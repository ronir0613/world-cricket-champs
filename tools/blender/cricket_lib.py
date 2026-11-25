"""Shared pieces for building the cricket squad in Blender: palette, skeleton, body,
outfit pieces, props, the IK animation rig, baking, export and preview renders.

Conventions (Blender space, metres, Z up; glTF export turns -Y into three.js +Z):
    Rest pose faces -Y. Left side is +X.
    Every role uses the same body and skeleton; outfits are separate skinned meshes
    on that skeleton, and all meshes share one 32x16 palette material, so the game can
    merge a player's pieces into a single draw call.
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix, Quaternion

rad = math.radians
Z = Vector((0, 0, 1))
FPS = 30


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def coll():
    return bpy.context.scene.collection


def activate(obj, *others):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in others:
        o.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_mod(obj, mod):
    activate(obj)
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- palette
REGIONS = ["skin", "shirt", "trousers", "white", "helmet", "steel", "shoe", "sole",
           "wood", "grip", "dark", "trim", "strap", "hair", "sticker", "badge",
           "sleeve", "cap", "hat", "kglove", "kweb", "kpad", "ball", "seam",
           "stump", "bail", "logo", "spare1", "spare2", "spare3", "spare4", "spare5"]
R = {n: i for i, n in enumerate(REGIONS)}
COLORS = {"skin": "#b98563", "shirt": "#1f5fbf", "trousers": "#1b2a55", "white": "#f1f1ec",
          "helmet": "#14213d", "steel": "#9aa3ad", "shoe": "#efefea", "sole": "#2b2b2b",
          "wood": "#e2c48f", "grip": "#c8102e", "dark": "#1a1410", "trim": "#f2b705",
          "strap": "#c3c7cc", "hair": "#17110c", "sticker": "#c8102e", "badge": "#f2b705",
          "sleeve": "#b98563", "cap": "#14213d", "hat": "#f2efe6", "kglove": "#f1f1ec",
          "kweb": "#2b2b2b", "kpad": "#f1f1ec", "ball": "#b3121f", "seam": "#f3e9d2",
          "stump": "#efe6cf", "bail": "#efe6cf", "logo": "#c8102e"}
GX, GY, CELL = 8, 4, 4


def uv_of(i):
    return ((i % GX + 0.5) / GX, (i // GX + 0.5) / GY)


def make_material(work):
    img = bpy.data.images.new("palette", GX * CELL, GY * CELL, alpha=False)
    px = np.zeros((GY * CELL, GX * CELL, 4), dtype=np.float32)
    for name, i in R.items():
        hx = COLORS.get(name, "#ff00ff")
        rgb = [int(hx[k:k + 2], 16) / 255 for k in (1, 3, 5)]
        r, c = i // GX, i % GX
        px[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL, :3] = rgb
        px[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL, 3] = 1
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.join(work, "palette.png")
    img.file_format = 'PNG'
    img.save()
    m = bpy.data.materials.new("cricket")
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = 'Closest'
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.72
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.3
    return m


def apply_palette(obj, mat):
    me = obj.data
    me.materials.clear()
    me.materials.append(mat)
    regions = np.zeros(len(me.polygons), dtype=np.int32)
    if me.attributes.get("region"):
        me.attributes["region"].data.foreach_get("value", regions)
        me.attributes.remove(me.attributes["region"])
    uvl = me.uv_layers.new(name="UVMap")
    loop_uv = np.zeros((len(me.loops), 2), dtype=np.float32)
    for poly in me.polygons:
        loop_uv[poly.loop_start:poly.loop_start + poly.loop_total] = uv_of(int(regions[poly.index]))
    uvl.data.foreach_set("uv", loop_uv.ravel())
    me.shade_smooth()


# ---------------------------------------------------------------- skeleton
J = {"pelvis": (0, 0, 0.93), "spine": (0, 0, 1.05), "chest": (0, 0, 1.22), "chest_top": (0, 0, 1.44),
     "neck": (0, 0.005, 1.46), "head": (0, 0.005, 1.575), "head_top": (0, 0, 1.80)}
for _S, _sx in (("L", 1), ("R", -1)):
    J.update({
        "clav_" + _S: (0.03 * _sx, 0, 1.42), "shoulder_" + _S: (0.18 * _sx, 0, 1.43),
        # elbows sit slightly back: a rest bend tells the arm IK which way to fold
        "elbow_" + _S: (0.392 * _sx, 0.025, 1.218),
        "wrist_" + _S: (0.583 * _sx, 0, 1.027),
        "hand_" + _S: (0.703 * _sx, 0, 0.907),
        "hip_" + _S: (0.095 * _sx, 0, 0.92), "knee_" + _S: (0.105 * _sx, -0.03, 0.50),   # forward rest bend: tells the leg IK which way to fold
        "ankle_" + _S: (0.115 * _sx, 0.015, 0.085), "ball_" + _S: (0.12 * _sx, -0.115, 0.025),
        "toe_" + _S: (0.12 * _sx, -0.185, 0.02)})
J = {k: Vector(v) for k, v in J.items()}
X_BAT = -0.9
G0 = Vector((X_BAT, 0, 0.92))      # top-hand grip on the rest bat
REACH = 0.57 + 0.04                # shoulder to grip with a slightly bent elbow
# Where the handle runs through a closed hand, in the hand bone's frame (Y = wrist to
# knuckles, Z = palm normal, X = along the handle). The rig places wrists from this and
# the batting gloves are modelled as fists around it, so the two always agree.
GRIP_Y, GRIP_Z = 0.065, 0.022


def build_armature(name="Cricketer"):
    data = bpy.data.armatures.new(name + "_rig")
    arm = bpy.data.objects.new(name, data)
    coll().objects.link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones

    def bone(n, head, tail, parent=None, roll=(0, -1, 0), connect=False):
        b = eb.new(n)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        b.align_roll(Vector(roll))
        return b

    bone("root", (0, 0, 0), (0, 0.25, 0), roll=(0, 0, 1))
    bone("hips", J["pelvis"], J["spine"], "root")
    bone("spine", J["spine"], J["chest"], "hips")
    bone("chest", J["chest"], J["chest_top"], "spine")
    bone("neck", J["neck"], J["head"], "chest")
    bone("head", J["head"], J["head_top"], "neck")
    for S, sx in (("L", 1), ("R", -1)):
        palm = Vector((-0.707 * sx, 0, -0.707))
        bone("shoulder_" + S, J["clav_" + S], J["shoulder_" + S], "chest")
        bone("upper_arm_" + S, J["shoulder_" + S], J["elbow_" + S], "shoulder_" + S, connect=True)
        bone("forearm_" + S, J["elbow_" + S], J["wrist_" + S], "upper_arm_" + S, connect=True)
        h = bone("hand_" + S, J["wrist_" + S], J["hand_" + S], "forearm_" + S, roll=palm, connect=True)
        # prop socket in the palm: the ball (or anything held) is parented here in game
        y = (J["hand_" + S] - J["wrist_" + S]).normalized()
        c = J["wrist_" + S] + y * 0.08 + palm * 0.035
        bone("prop_" + S, c, c + y * 0.05, "hand_" + S, roll=palm)
        bone("thigh_" + S, J["hip_" + S], J["knee_" + S], "hips")
        bone("shin_" + S, J["knee_" + S], J["ankle_" + S], "thigh_" + S, connect=True)
        bone("foot_" + S, J["ankle_" + S], J["ball_" + S], "shin_" + S, roll=(0, 0, 1), connect=True)
        bone("toe_" + S, J["ball_" + S], J["toe_" + S], "foot_" + S, roll=(0, 0, 1), connect=True)
    bone("bat", G0, (X_BAT, 0, 0.40), "root")
    bpy.ops.object.mode_set(mode='OBJECT')
    for n in ("root", "prop_L", "prop_R"):
        data.bones[n].use_deform = False
    return arm


# ---------------------------------------------------------------- mesh helpers
def faces_of(verts):
    return list({f for v in verts for f in v.link_faces})


def add_ellipsoid(bm, c, r, basis=None, seg=20, rings=12):
    rot = basis.to_4x4() if basis is not None else Matrix()
    m = Matrix.Translation(Vector(c)) @ rot @ Matrix.Diagonal((r[0], r[1], r[2], 1))
    return faces_of(bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=m)["verts"])


def add_capsule(bm, a, b, ra, rb, seg=18, caps=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    m = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
    out = faces_of(bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=ra, radius2=rb, depth=d.length, matrix=m)["verts"])
    if caps:
        out += add_ellipsoid(bm, a, (ra, ra, ra), seg=seg, rings=10)
        out += add_ellipsoid(bm, b, (rb, rb, rb), seg=seg, rings=10)
    return out


def add_loft(bm, sections, seg=24, power=2.4):
    """Closed body of superellipse rings: (z, rx, ry, y offset), bottom to top."""
    rings = []
    for z, rx, ry, yo in sections:
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            ca, sa = math.cos(a), math.sin(a)
            ring.append(bm.verts.new((rx * math.copysign(abs(ca) ** (2 / power), ca),
                                      ry * math.copysign(abs(sa) ** (2 / power), sa) + yo, z)))
        rings.append(ring)
    out = [bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
           for i in range(len(rings) - 1) for k in range(seg)]
    out.append(bm.faces.new(rings[0][::-1]))
    out.append(bm.faces.new(rings[-1]))
    return out


def add_tube(bm, pts, r, sides=6):
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        u = t.cross(a).normalized()
        v = t.cross(u)
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r)
                      for k in range(sides)])
    out = [bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
           for i in range(len(rings) - 1) for k in range(sides)]
    out.append(bm.faces.new(rings[0][::-1]))
    out.append(bm.faces.new(rings[-1]))
    return out


def add_grid(bm, point, nu, nv):
    vs = [[bm.verts.new(point(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    return [bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1])) for i in range(nu) for j in range(nv)]


class Piece:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.reg = self.bm.faces.layers.int.new("region")

    def tag(self, faces, region):
        for f in faces:
            f[self.reg] = R[region]
        return faces

    def to_object(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, me)
        coll().objects.link(obj)
        return obj


def set_weights(obj, fn):
    groups = {}
    for v in obj.data.vertices:
        for b, w in fn(obj.matrix_world @ v.co).items():
            if w <= 0:
                continue
            g = groups.get(b) or obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)
            groups[b] = g
            g.add([v.index], w, 'REPLACE')


def rigid(obj, bone):
    set_weights(obj, lambda co: {bone: 1.0})
    return obj


def solidify(obj, thickness, offset=-1.0, rim=True):
    m = obj.modifiers.new("solid", 'SOLIDIFY')
    m.thickness, m.offset, m.use_even_offset, m.use_rim = thickness, offset, True, rim
    apply_mod(obj, m)


def join(objs, name):
    activate(objs[0], *objs[1:])
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = o.data.name = name
    return o


def bone_frame(arm, name):
    m = arm.data.bones[name].matrix_local
    return m.to_3x3(), m.to_translation()


# ---------------------------------------------------------------- body
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


def classify_body(obj):
    segs = [("head", J["head"], J["head_top"]), ("neck", J["neck"], J["head"]),
            ("chest", J["chest"], J["chest_top"]), ("spine", J["spine"], J["chest"]),
            ("hips", Vector((0, 0, 0.88)), J["spine"])]
    for S in ("L", "R"):
        segs += [("shoulder", J["clav_" + S], J["shoulder_" + S]), ("upper_arm", J["shoulder_" + S], J["elbow_" + S]),
                 ("forearm", J["elbow_" + S], J["wrist_" + S]), ("hand", J["wrist_" + S], J["hand_" + S]),
                 ("thigh", J["hip_" + S], J["knee_" + S]), ("shin", J["knee_" + S], J["ankle_" + S]),
                 ("foot", J["ankle_" + S], J["toe_" + S])]
    regions = []
    for poly in obj.data.polygons:
        c = poly.center
        name, _, t = min(((n,) + seg_dist(c, a, b) for n, a, b in segs), key=lambda x: x[1])
        if name == "head":
            reg = "hair" if (c.z > 1.66 and c.y > 0.02) or c.z > 1.765 else "skin"
        elif name == "neck":
            reg = "skin" if c.z > 1.49 else "trim"
        elif name in ("chest", "spine", "shoulder", "upper_arm"):
            reg = "shirt"
        elif name == "forearm":
            reg = "shirt" if t < 0.22 else "sleeve"
        elif name == "hand":
            reg = "skin"
        elif name == "hips":
            reg = "shirt" if c.z > 0.985 else "trousers"
        else:
            reg = "trousers"
        regions.append(R[reg])
    obj.data.attributes.new("region", 'INT', 'FACE').data.foreach_set("value", regions)


def build_body(arm, target_tris=8400):
    p = Piece("body")
    bm = p.bm
    add_loft(bm, [(0.84, 0.130, 0.095, 0.010), (0.90, 0.160, 0.110, 0.012), (0.97, 0.165, 0.112, 0.010),
                  (1.04, 0.152, 0.100, 0.000), (1.11, 0.148, 0.098, -0.005), (1.19, 0.158, 0.104, -0.008),
                  (1.27, 0.170, 0.112, -0.010), (1.34, 0.176, 0.108, -0.005), (1.40, 0.172, 0.095, 0.005),
                  (1.44, 0.140, 0.080, 0.008), (1.47, 0.072, 0.062, 0.008)])
    add_capsule(bm, (0, 0.01, 1.42), (0, 0.0, 1.60), 0.056, 0.052)
    add_ellipsoid(bm, (0, -0.005, 1.68), (0.083, 0.10, 0.115), seg=28, rings=18)
    add_ellipsoid(bm, (0, -0.028, 1.618), (0.066, 0.072, 0.058))
    add_ellipsoid(bm, (0, -0.098, 1.665), (0.013, 0.022, 0.024))
    for S, sx in (("L", 1), ("R", -1)):
        add_ellipsoid(bm, (0.082 * sx, 0.005, 1.67), (0.012, 0.024, 0.032))
        add_ellipsoid(bm, J["shoulder_" + S] - Vector((0.01 * sx, 0, 0.01)), (0.062, 0.06, 0.056))
        add_capsule(bm, J["shoulder_" + S], J["elbow_" + S], 0.056, 0.045)
        add_capsule(bm, J["elbow_" + S], J["wrist_" + S], 0.046, 0.032)
        u = (J["hand_" + S] - J["wrist_" + S]).normalized()
        # bare hand kept short enough to sit inside a closed batting glove
        add_capsule(bm, J["wrist_" + S], J["wrist_" + S] + u * 0.075, 0.028, 0.020)
        add_ellipsoid(bm, (0.075 * sx, 0.04, 0.91), (0.085, 0.07, 0.085))
        add_capsule(bm, J["hip_" + S], J["knee_" + S], 0.088, 0.056)
        add_capsule(bm, J["knee_" + S], J["ankle_" + S], 0.054, 0.038)
        add_ellipsoid(bm, (0.11 * sx, 0.025, 0.36), (0.048, 0.05, 0.11))
        add_capsule(bm, J["ankle_" + S], J["ball_" + S], 0.038, 0.032)
    body = p.to_object()
    m = body.modifiers.new("remesh", 'REMESH')
    m.mode, m.voxel_size, m.adaptivity = 'VOXEL', 0.008, 0.0
    apply_mod(body, m)
    m = body.modifiers.new("smooth", 'SMOOTH')
    m.factor, m.iterations = 0.5, 5
    apply_mod(body, m)
    m = body.modifiers.new("dec", 'DECIMATE')
    m.ratio = min(1.0, target_tris / max(1, tris(body)))
    apply_mod(body, m)
    classify_body(body)
    # heat weights for the skin only; bones that carry no flesh are switched off meanwhile
    off = ["bat", "root", "prop_L", "prop_R"]
    saved = {n: arm.data.bones[n].use_deform for n in off}
    for n in off:
        arm.data.bones[n].use_deform = False
    activate(arm, body)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for n, v in saved.items():
        arm.data.bones[n].use_deform = v
    return join([body] + build_face() + build_shoes(), "body")


def build_face():
    p = Piece("face")
    for sx in (1, -1):
        p.tag(add_ellipsoid(p.bm, (0.032 * sx, -0.091, 1.692), (0.0095, 0.006, 0.0085), seg=8, rings=6), "dark")
        p.tag(add_ellipsoid(p.bm, (0.033 * sx, -0.094, 1.713), (0.02, 0.006, 0.0045), seg=8, rings=4), "hair")
    p.tag(add_ellipsoid(p.bm, (0, -0.094, 1.627), (0.018, 0.004, 0.0028), seg=8, rings=4), "dark")
    return [rigid(p.to_object(), "head")]


def build_shoes():
    out = []
    for S, sx in (("L", 1), ("R", -1)):
        x = 0.12 * sx
        p = Piece("shoe_" + S)
        p.tag(add_ellipsoid(p.bm, (x, -0.045, 0.05), (0.052, 0.135, 0.055), seg=16, rings=10), "shoe")
        p.tag(add_ellipsoid(p.bm, (x, 0.03, 0.095), (0.048, 0.058, 0.05), seg=14, rings=8), "shoe")
        for v in p.bm.verts:
            v.co.z = max(v.co.z, 0.004)
        for f in p.bm.faces:
            if f.calc_center_median().z < 0.018:
                f[p.reg] = R["sole"]
        obj = p.to_object()

        def w(co, S=S):
            t = smooth(-co.y, 0.08, 0.13)
            return {"foot_" + S: 1 - t, "toe_" + S: t}
        set_weights(obj, w)
        out.append(obj)
    return out


# ---------------------------------------------------------------- outfit pieces
HEAD_C = Vector((0, 0.005, 1.69))


def head_shell(p, radii, cut, region, seg=22, rings=14):
    add_ellipsoid(p.bm, HEAD_C, radii, seg=seg, rings=rings)
    bmesh.ops.delete(p.bm, geom=[v for v in p.bm.verts if v.co.z < cut(v.co.y)], context='VERTS')
    p.tag(list(p.bm.faces), region)


def brim(p, z, rx, ry, span, length, droop, region, seg=14):
    k = math.sqrt(max(0.0, 1 - ((z - HEAD_C.z) / 0.125) ** 2))

    def pt(u, v):
        a = rad(-span + 2 * span * u)
        inner = Vector((rx * k * math.sin(a), HEAD_C.y - ry * k * math.cos(a), z))
        L = length(a) * v
        return inner + Vector((math.sin(a), -math.cos(a), 0)) * L + Vector((0, 0, -droop * L))
    return p.tag(add_grid(p.bm, pt, seg, 2), region)


def build_helmet():
    p = Piece("helmet_shell")
    head_shell(p, (0.108, 0.128, 0.125), lambda y: 1.665 - 0.35 * y, "helmet")
    for f in p.bm.faces:
        fc = f.calc_center_median()
        if fc.z > 1.735 and fc.y < HEAD_C.y - 0.1 and abs(fc.x) < 0.03:
            f[p.reg] = R["badge"]
    shell = p.to_object()
    solidify(shell, 0.012)
    q = Piece("helmet_parts")
    brim(q, 1.707, 0.108, 0.128, 80, lambda a: 0.065 * math.cos(a) ** 0.6, 0.18, "helmet")
    for z in (1.668, 1.628, 1.590):
        pts = [Vector((0.118 * math.sin(rad(a)), HEAD_C.y - 0.158 * math.cos(rad(a)), z)) for a in range(-70, 71, 10)]
        q.tag(add_tube(q.bm, pts, 0.0045, 4), "steel")
    for a in (-70, -18, 18, 70):
        x, y = 0.118 * math.sin(rad(a)), HEAD_C.y - 0.158 * math.cos(rad(a))
        q.tag(add_tube(q.bm, [(x, y, 1.70 if abs(a) > 30 else 1.668), (x, y, 1.585)], 0.0045, 4), "steel")
    parts = q.to_object()
    solidify(parts, 0.006, rim=True)
    return join([rigid(shell, "head"), rigid(parts, "head")], "helmet")


def build_cap():
    p = Piece("cap")
    head_shell(p, (0.093, 0.112, 0.122), lambda y: 1.70 - 0.22 * y, "cap", seg=18, rings=12)
    for f in p.bm.faces:
        fc = f.calc_center_median()
        if 1.74 < fc.z < 1.78 and fc.y < HEAD_C.y - 0.085 and abs(fc.x) < 0.025:
            f[p.reg] = R["badge"]
    shell = p.to_object()
    solidify(shell, 0.006)
    q = Piece("cap_brim")
    brim(q, 1.722, 0.093, 0.112, 70, lambda a: 0.075 * math.cos(a) ** 0.5, 0.25, "cap", seg=12)
    b = q.to_object()
    solidify(b, 0.005)
    return join([rigid(shell, "head"), rigid(b, "head")], "cap")


def build_umpire_hat():
    p = Piece("hat")
    secs = [(1.695, 0.100, 0.118, 0.005), (1.75, 0.098, 0.115, 0.005), (1.81, 0.094, 0.110, 0.005),
            (1.845, 0.085, 0.100, 0.005), (1.855, 0.05, 0.06, 0.005)]
    faces = add_loft(p.bm, secs, seg=20, power=2.0)
    p.tag(faces, "hat")
    for f in faces:
        if f.calc_center_median().z < 1.72:
            f[p.reg] = R["dark"]

    def ring(u, v):
        a = 2 * math.pi * u
        r = 1 + v * 0.75
        return Vector((0.100 * r * math.cos(a), 0.118 * r * math.sin(a) + 0.005, 1.70 - 0.035 * v * v))
    p.tag(add_grid(p.bm, ring, 24, 3), "hat")
    obj = p.to_object()
    solidify(obj, 0.005)
    obj.name = obj.data.name = "umpire_hat"
    return rigid(obj, "head")


def build_pads(style="bat"):
    keeper = style == "keeper"
    region = "kpad" if keeper else "white"
    top = 0.56 if keeper else 0.64
    out = []
    for S, sx in (("L", 1), ("R", -1)):
        p = Piece("pad_" + S)
        knee, ankle, hip = J["knee_" + S], J["ankle_" + S], J["hip_" + S]

        def axis(z):
            if z <= knee.z:
                return ankle.lerp(knee, (z - ankle.z) / (knee.z - ankle.z))
            return knee.lerp(hip, (z - knee.z) / (hip.z - knee.z))

        def rad_at(a, z, extra=0.0):
            return 0.073 + 0.008 * math.cos(a) + extra - max(0, z - 0.56) * 0.12

        def shell(u, v):
            a = rad(-105 + 210 * u)
            z = 0.10 + (top - 0.10) * v
            c = axis(z)
            r = rad_at(a, z)
            return Vector((c.x + r * math.sin(a), c.y - r * math.cos(a), z))
        p.tag(add_grid(p.bm, shell, 12, 10), region)
        obj = p.to_object()
        solidify(obj, 0.014, 1.0)
        q = Piece("pad_parts_" + S)
        for a in ((-30, 30) if keeper else (-38, 0, 38)):
            pts = []
            for i in range(9):
                z = 0.12 + (top - 0.18) * i / 8
                c = axis(z)
                r = rad_at(rad(a), z, 0.012)
                pts.append((c.x + r * math.sin(rad(a)), c.y - r * math.cos(rad(a)), z))
            q.tag(add_tube(q.bm, pts, 0.015 if keeper else 0.017, 6), region)
        c = axis(0.535)
        q.tag(add_tube(q.bm, [(c.x + 0.09 * math.sin(rad(a)), c.y - 0.09 * math.cos(rad(a)), 0.535) for a in range(-95, 96, 15)],
                       0.022, 6), region)
        for z in (0.22, 0.40):
            c = axis(z)
            q.tag(add_tube(q.bm, [(c.x + 0.068 * math.sin(rad(a)), c.y - 0.068 * math.cos(rad(a)), z) for a in range(100, 261, 20)],
                           0.006, 4), "strap")
        parts = q.to_object()

        def w(co, S=S):
            t = smooth(co.z, 0.50, 0.58)
            return {"shin_" + S: 1 - t, "thigh_" + S: t}
        for o in (obj, parts):
            set_weights(o, w)
        out += [obj, parts]
    return join(out, "keeper_pads" if keeper else "bat_pads")


def build_gloves(arm, style="bat"):
    keeper = style == "keeper"
    out = []
    for S, sx in (("L", 1), ("R", -1)):
        rot, wrist = bone_frame(arm, "hand_" + S)
        X, Y, Zh = rot.col[0], rot.col[1], rot.col[2]
        radial = -X * sx
        p = Piece("glove_" + S)
        if keeper:
            p.tag(add_ellipsoid(p.bm, wrist + Y * 0.08, (0.068, 0.11, 0.05), basis=rot, seg=14, rings=10), "kglove")
            p.tag(add_ellipsoid(p.bm, wrist + Y * 0.06 + radial * 0.058 + Zh * 0.01, (0.03, 0.06, 0.03), basis=rot, seg=8, rings=6), "kglove")
            p.tag(add_ellipsoid(p.bm, wrist + Y * 0.07 + radial * 0.04 + Zh * 0.035, (0.035, 0.05, 0.006), basis=rot, seg=8, rings=4), "kweb")
            p.tag(add_capsule(p.bm, wrist - Y * 0.08, wrist + Y * 0.01, 0.052, 0.056, seg=12, caps=False), "kglove")
        else:
            # a closed fist round the handle: the handle runs along X through `grip`
            grip = wrist + Y * GRIP_Y + Zh * GRIP_Z
            p.tag(add_capsule(p.bm, grip - X * 0.032, grip + X * 0.032, 0.034, 0.034, seg=10), "white")      # palm and fingers
            p.tag(add_ellipsoid(p.bm, wrist + Y * 0.048 - Zh * 0.002, (0.045, 0.056, 0.037), basis=rot, seg=10, rings=6), "white")  # back of hand
            # padded finger rolls curling over the far side of the handle, from the knuckles round to the palm
            for ang in (-35, 15, 65, 110):
                a = rad(ang)
                c = grip + (Y * math.cos(a) + Zh * math.sin(a)) * 0.034
                p.tag(add_tube(p.bm, [c - X * 0.036, c + X * 0.036], 0.0115, 5), "white")
            # thumb wraps the palm side, pointing down the handle (radial = towards the blade)
            p.tag(add_capsule(p.bm, grip + Zh * 0.036 - Y * 0.012, grip + Zh * 0.040 + radial * 0.040, 0.014, 0.012, seg=6), "white")
            p.tag(add_capsule(p.bm, wrist - Y * 0.07, wrist + Y * 0.005, 0.047, 0.049, seg=10, caps=False), "white")      # cuff
        p.tag(add_tube(p.bm, [wrist - Y * 0.035 + X * k * 0.05 for k in (-1, -0.5, 0, 0.5, 1)], 0.006, 4), "strap")
        out.append(rigid(p.to_object(), "hand_" + S))
    return join(out, "keeper_gloves" if keeper else "bat_gloves")


def make_lods(obj, ratios, keep_source=False):
    lods = []
    for i, ratio in enumerate(ratios):
        o = obj.copy()
        o.data = obj.data.copy()
        o.name = o.data.name = "%s_LOD%d" % (obj.name, i)
        coll().objects.link(o)
        if ratio < 1.0:
            m = o.modifiers.new("dec", 'DECIMATE')
            m.ratio = ratio
            apply_mod(o, m)
        lods.append(o)
    if not keep_source:
        bpy.data.objects.remove(obj)
    return lods


# ---------------------------------------------------------------- props
def build_bat_mesh():
    p = Piece("bat")
    bm = p.bm
    sec = [(-0.054, -0.018), (0.054, -0.018), (0.054, 0.016), (0.032, 0.033), (0, 0.040), (-0.032, 0.033), (-0.054, 0.016)]
    rows = []
    for z in (0.0, 0.015, 0.08, 0.16, 0.25, 0.34, 0.43, 0.52, 0.56, 0.61):
        hump = 0.75 + 0.25 * math.exp(-((z - 0.2) / 0.16) ** 2)
        sw, sd = (0.97, 0.9) if z == 0.0 else (1.0, 1.0)
        if z == 0.61:
            sw, sd, hump = 0.33, 1.0, 0.55
        elif z == 0.56:
            hump = 0.7
        rows.append([bm.verts.new((X_BAT + x * sw, y * sd * (hump if y > 0 else 1), z)) for x, y in sec])
    n = len(sec)
    for i in range(len(rows) - 1):
        z = rows[i][0].co.z
        for k in range(n):
            f = bm.faces.new((rows[i][k], rows[i][(k + 1) % n], rows[i + 1][(k + 1) % n], rows[i + 1][k]))
            f[p.reg] = R["sticker"] if (k == 0 and 0.40 < z < 0.52) or (k in (3, 4) and 0.25 < z < 0.43) else R["wood"]
    bm.faces.new(rows[0][::-1])[p.reg] = R["wood"]
    bm.faces.new(rows[-1])[p.reg] = R["wood"]
    p.tag(add_capsule(bm, (X_BAT, 0.002, 0.60), (X_BAT, 0.002, 0.955), 0.0175, 0.0175, seg=8, caps=False), "grip")
    p.tag(add_ellipsoid(bm, (X_BAT, 0.002, 0.958), (0.019, 0.019, 0.01), seg=8, rings=4), "grip")
    return p.to_object()


def build_ball_mesh():
    p = Piece("ball")
    r = 0.036
    faces = add_ellipsoid(p.bm, (0, 0, 0), (r, r, r), seg=20, rings=12)
    p.tag(faces, "ball")
    for f in faces:
        if abs(f.calc_center_median().x) < r * 0.12:
            f[p.reg] = R["seam"]
    return p.to_object()


STUMP_X = (-0.0857, 0.0, 0.0857)


def build_stump_mesh(name, x):
    p = Piece(name)
    # rings at the logo band's edges, so only that band on the front carries the logo
    p.tag(add_tube(p.bm, [(x, 0, z) for z in (0.0, 0.30, 0.45, 0.711)], 0.0175, 10), "stump")
    p.tag(add_ellipsoid(p.bm, (x, 0, 0.711), (0.0175, 0.0175, 0.006), seg=10, rings=4), "stump")
    for f in p.bm.faces:
        c = f.calc_center_median()
        if 0.30 < c.z < 0.45 and c.y < -0.008 and abs(f.normal.z) < 0.5:
            f[p.reg] = R["logo"]
    return p.to_object()


def build_bail_mesh(name, x0, x1):
    p = Piece(name)
    z = 0.711 + 0.008
    a, b = Vector((x0, 0, z)), Vector((x1, 0, z))
    p.tag(add_capsule(p.bm, a, b, 0.006, 0.006, seg=8, caps=False), "bail")
    p.tag(add_capsule(p.bm, a.lerp(b, 0.25), a.lerp(b, 0.75), 0.0085, 0.0085, seg=8, caps=False), "bail")
    return p.to_object()


def export_glb(path, objs, animations=False, extra=None):
    activate(objs[0], *objs[1:])
    opts = dict(filepath=path, export_format='GLB', use_selection=True, export_animations=animations,
                export_skins=True, export_morph=False, export_yup=True, export_apply=False,
                export_materials='EXPORT')
    if animations:
        # one animation per NLA track, so each pack holds only the tracks set up for it
        opts.update(export_animation_mode='NLA_TRACKS', export_anim_slide_to_zero=True,
                    export_force_sampling=True, export_def_bones=False)
    opts.update(extra or {})
    bpy.ops.export_scene.gltf(**opts)
    return round(os.path.getsize(path) / 1024, 1)


# ---------------------------------------------------------------- animation rig
class AnimRig:
    """IK rig on the shared skeleton. Clips give world-space targets per frame;
    Blender solves the limbs, and each clip is baked to plain bone keys."""

    def __init__(self, arm):
        self.arm = arm
        pb = self.pb = arm.pose.bones
        self.rest = {n: b.matrix_local.copy() for n, b in arm.data.bones.items()}
        self.ctrl = {}
        for n in ("bat_ctrl", "hand_tgt_L", "hand_tgt_R", "elbow_pole_L", "elbow_pole_R",
                  "foot_tgt_L", "foot_tgt_R", "knee_pole_L", "knee_pole_R", "look"):
            e = bpy.data.objects.new(n, None)
            e.rotation_mode = 'QUATERNION'
            coll().objects.link(e)
            self.ctrl[n] = e
        self.iks, self.grip = {}, {}
        for S in ("L", "R"):
            c = pb["forearm_" + S].constraints.new('IK')
            c.target, c.pole_target, c.chain_count = self.ctrl["hand_tgt_" + S], self.ctrl["elbow_pole_" + S], 2
            self.iks["arm_" + S] = (c, "forearm_" + S, self.ctrl["elbow_pole_" + S])
            c = pb["hand_" + S].constraints.new('COPY_ROTATION')
            c.target = self.ctrl["hand_tgt_" + S]
            self.grip[S] = c
            c = pb["shin_" + S].constraints.new('IK')
            c.target, c.pole_target, c.chain_count = self.ctrl["foot_tgt_" + S], self.ctrl["knee_pole_" + S], 2
            self.iks["leg_" + S] = (c, "shin_" + S, self.ctrl["knee_pole_" + S])
            c = pb["foot_" + S].constraints.new('COPY_ROTATION')
            c.target = self.ctrl["foot_tgt_" + S]
        pb["bat"].constraints.new('COPY_TRANSFORMS').target = self.ctrl["bat_ctrl"]
        for bone, inf in (("neck", 0.35), ("head", 0.85)):
            c = pb[bone].constraints.new('DAMPED_TRACK')
            c.target, c.track_axis, c.influence = self.ctrl["look"], 'TRACK_Z', inf
        arm.animation_data_create()
        self._prevq = {}

    def _key(self, obj, m, f):
        obj.matrix_world = m
        q = obj.rotation_quaternion.copy()
        p = self._prevq.get(obj.name)
        if p is not None and p.dot(q) < 0:
            obj.rotation_quaternion = -q
        self._prevq[obj.name] = obj.rotation_quaternion.copy()
        obj.keyframe_insert("location", frame=f)
        obj.keyframe_insert("rotation_quaternion", frame=f)

    @staticmethod
    def _frame(X, Y, Zc, pos):
        m = Matrix((X, Y, Zc)).transposed().to_4x4()
        m.translation = pos
        return m

    def key(self, f, P):
        pb, scene = self.pb, bpy.context.scene
        w = P["hips"] - J["pelvis"]
        pb["hips"].location = (w.x, w.z, -w.y)
        pb["hips"].rotation_quaternion = (Quaternion((0, 1, 0), rad(P["yaw"])) @ Quaternion((1, 0, 0), rad(P["pitch"]))
                                          @ Quaternion((0, 0, 1), rad(P.get("roll", 0))))
        for n in ("spine", "chest"):
            pt, yw, rl = P[n]
            pb[n].rotation_quaternion = Quaternion((0, 1, 0), rad(yw)) @ Quaternion((1, 0, 0), rad(pt)) @ Quaternion((0, 0, 1), rad(rl))
        pb["hips"].keyframe_insert("location", frame=f)
        for n in ("hips", "spine", "chest"):
            pb[n].keyframe_insert("rotation_quaternion", frame=f)
        scene.frame_set(f)
        shoulders = {S: self.arm.matrix_world @ pb["upper_arm_" + S].head for S in ("L", "R")}

        grips = {}
        bat = P.get("bat") or P.get("bat1")
        if bat:
            G, d, fa = (v.copy() for v in bat)
            offs = (("L", 0.0), ("R", 0.105)) if P.get("bat") else (("R", 0.0),)
            for _ in range(6):
                for S, off in offs:
                    gap = (G + d * off - shoulders[S]).length - REACH
                    if gap > 0:
                        G += (shoulders[S] - (G + d * off)).normalized() * gap
            e3 = d.cross(fa)
            F = Matrix((d, fa, e3)).transposed()
            F0 = Matrix((Vector((0, 0, -1)), Vector((0, -1, 0)), Vector((-1, 0, 0)))).transposed()
            T = Matrix.Translation(G) @ (F @ F0.transposed()).to_4x4() @ Matrix.Translation(-G0)
            self._key(self.ctrl["bat_ctrl"], T @ self.rest["bat"], f)
            for S, off in offs:
                grips[S] = G + d * off
        else:
            self._key(self.ctrl["bat_ctrl"], self.rest["bat"], f)
            d = e3 = None

        def grip_frame(S, ref):
            """Hand closed round the handle: knuckles continue the line from ref (shoulder,
            then the solved elbow), thumb pointing down the handle towards the blade."""
            grip = grips[S]
            v = grip - ref
            Y = v - d * v.dot(d)
            Y = Y.normalized() if Y.length > 1e-4 else e3
            X = -d if S == "L" else d
            Zh = X.cross(Y)
            return self._frame(X, Y, Zh, grip - Y * GRIP_Y - Zh * GRIP_Z)

        for S in ("L", "R"):
            if S in grips:
                m = grip_frame(S, shoulders[S])
                self.grip[S].influence = 1.0
            else:
                wrist = P["hands"][S].copy()
                gap = (wrist - shoulders[S]).length - 0.565
                if gap > 0:
                    wrist += (shoulders[S] - wrist).normalized() * gap
                m = Matrix.Translation(wrist)
                self.grip[S].influence = 0.0
            self._key(self.ctrl["hand_tgt_" + S], m, f)
            pb["hand_" + S].constraints[self.grip[S].name].keyframe_insert("influence", frame=f)
            self._key(self.ctrl["elbow_pole_" + S], Matrix.Translation(P["poles"][S]), f)

        for S in ("L", "R"):
            ball, yaw, heel = P["feet"][S]
            rrest = self.rest["foot_" + S].to_3x3()
            rot = Matrix.Rotation(rad(yaw), 3, 'Z') @ Matrix.Rotation(rad(-heel), 3, rrest.col[0])
            bpos = Vector((ball.x, ball.y, J["ball_" + S].z + ball.z))
            ankle = bpos + rot @ (J["ankle_" + S] - J["ball_" + S])
            m = (rot @ rrest).to_4x4()
            m.translation = ankle
            self._key(self.ctrl["foot_tgt_" + S], m, f)
            toes = Matrix.Rotation(rad(yaw), 3, 'Z') @ Vector((0, -1, 0))
            self._key(self.ctrl["knee_pole_" + S], Matrix.Translation(ankle + Z * 0.45 + toes * 0.7), f)
        self._key(self.ctrl["look"], Matrix.Translation(P["look"]), f)

        # second pass: aim each gripping hand along the forearm the IK actually produced,
        # so the wrist bends only as much as a real wrist would
        if grips:
            scene.frame_set(f)
            elbows = {S: self.arm.matrix_world @ pb["forearm_" + S].head for S in grips}
            for S in grips:
                self._key(self.ctrl["hand_tgt_" + S], grip_frame(S, elbows[S]), f)

    def calibrate(self, frame):
        bpy.context.scene.frame_set(frame)
        res = {}
        for key, (c, mid, pole) in self.iks.items():
            best = None
            for step in (15, 3, 1):
                centre = 0 if best is None else best[1]
                span = 180 if best is None else step * 5
                for a in np.arange(centre - span, centre + span + 0.01, step):
                    c.pole_angle = rad(a)
                    bpy.context.view_layer.update()
                    dist = (self.arm.matrix_world @ self.pb[mid].head - pole.matrix_world.translation).length
                    if best is None or dist < best[0]:
                        best = (dist, float(a))
            c.pole_angle = rad(best[1])
            res[key] = best[1]
        return res

    def bake(self, name, f0, f1):
        controls = self.arm.animation_data.action
        activate(self.arm)
        bpy.ops.object.mode_set(mode='POSE')
        bpy.ops.nla.bake(frame_start=f0, frame_end=f1, step=1, only_selected=False, visual_keying=True,
                         clear_constraints=False, clear_parents=False, use_current_action=False, bake_types={'POSE'})
        act = self.arm.animation_data.action
        act.name = name
        act.use_fake_user = True
        bpy.ops.object.mode_set(mode='OBJECT')
        self.arm.animation_data.action = controls
        return act

    def cleanup(self):
        controls = self.arm.animation_data.action
        for b in self.pb:
            for c in list(b.constraints):
                b.constraints.remove(c)
            b.location = (0, 0, 0)
            b.rotation_quaternion = (1, 0, 0, 0)
        for e in self.ctrl.values():
            bpy.data.objects.remove(e)
        self.arm.animation_data.action = None
        if controls:
            bpy.data.actions.remove(controls)


# ---------------------------------------------------------------- previews
def preview_setup(w=240, h=300):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light, sh.color_type = 'STUDIO', 'TEXTURE'
    sh.show_cavity = True
    sh.show_object_outline = True
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.world = bpy.data.worlds.new("w")
    gm = bpy.data.materials.new("ground")
    gm.diffuse_color = (0.42, 0.55, 0.32, 1)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.001))
    ground = bpy.context.object
    ground.data.materials.append(gm)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 45
    coll().objects.link(cam)
    scene.camera = cam
    return cam, ground


def aim(cam, pos, target):
    cam.location = pos
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()


def contact_sheet(paths, cols, out):
    ims = []
    for pth in paths:
        im = bpy.data.images.load(pth)
        w, h = im.size
        ims.append(np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = ims[0].shape[:2]
    rows = (len(ims) + cols - 1) // cols
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, a in enumerate(ims):
        r, c = rows - 1 - i // cols, i % cols
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = a
    img = bpy.data.images.new("sheet", cols * w, rows * h)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
