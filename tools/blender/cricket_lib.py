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
import proportions as PR
J = PR.joints()
X_BAT = -0.9
G0 = Vector((X_BAT, 0, 0.92))      # top-hand grip on the rest bat
# shoulder to grip with a slightly bent elbow
REACH = 0.97 * (PR.LEN["upper_arm"] + PR.LEN["forearm"]) + 0.05
ARM_FREE = PR.LEN["upper_arm"] + PR.LEN["forearm"] - 0.02
# ...and no closer than an elbow bent to about 65 degrees: tighter than that looks crumpled
MIN_REACH = 0.34
GRIP_Y, GRIP_Z, GRIP_ANGLE = PR.GRIP_Y, PR.GRIP_Z, rad(PR.GRIP_ANGLE)


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


def add_limb(bm, a, b, prof, seg=16, front=Vector((0, -1, 0))):
    """Tapered limb lofted from a to b. prof: (t, half width, half depth[, forward bulge]),
    depth measured along `front` (the limb's front, -Y by default)."""
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    f = (front - ax * front.dot(ax)).normalized()
    sd = ax.cross(f)
    rows = []
    for row in prof:
        t, rx, ry = row[:3]
        fo = row[3] if len(row) > 3 else 0.0
        c = a.lerp(b, t) + f * fo
        rows.append([bm.verts.new(c + sd * (rx * math.cos(2 * math.pi * k / seg)) + f * (ry * math.sin(2 * math.pi * k / seg)))
                     for k in range(seg)])
    out = [bm.faces.new((rows[i][k], rows[i][(k + 1) % seg], rows[i + 1][(k + 1) % seg], rows[i + 1][k]))
           for i in range(len(rows) - 1) for k in range(seg)]
    out.append(bm.faces.new(rows[0][::-1]))
    out.append(bm.faces.new(rows[-1]))
    r0, r1 = prof[0][1:3], prof[-1][1:3]
    out += add_ellipsoid(bm, a, (min(r0), min(r0), min(r0)), seg=seg, rings=8)
    out += add_ellipsoid(bm, b, (min(r1), min(r1), min(r1)), seg=seg, rings=8)
    return out


def voxel_skin(obj, voxel, smooth_iter, target_tris):
    m = obj.modifiers.new("remesh", 'REMESH')
    m.mode, m.voxel_size, m.adaptivity = 'VOXEL', voxel, 0.0
    apply_mod(obj, m)
    m = obj.modifiers.new("smooth", 'SMOOTH')
    m.factor, m.iterations = 0.5, smooth_iter
    apply_mod(obj, m)
    m = obj.modifiers.new("dec", 'DECIMATE')
    m.ratio = min(1.0, target_tris / max(1, tris(obj)))
    apply_mod(obj, m)


# Clean colour borders: the mesh is cut along these planes before regions are assigned,
# so collars, sleeves, the waistband and the hairline are straight lines, not zigzags.
SLEEVE_T = 0.72                    # short sleeve ends this far down the upper arm
HAIR_PLANE = (Vector((0, -0.09, 1.765)), Vector((0, 0.6, 0.8)).normalized())
COLLAR_Z, WAIST_Z = PR.Z["neck_base"] + 0.022, 0.985


def _arm_cut(S):
    a, b = J["shoulder_" + S], J["elbow_" + S]
    return a.lerp(b, SLEEVE_T), (b - a).normalized()


def cut_borders(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)

    def cut(co, no, keep):
        faces = [f for f in bm.faces if all(keep(v.co) for v in f.verts)]
        edges = list({e for f in faces for e in f.edges})
        verts = list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=faces + edges + verts, plane_co=co, plane_no=no)
    cut(Vector((0, 0, COLLAR_Z)), Z, lambda c: abs(c.x) < 0.09)
    cut(Vector((0, 0, COLLAR_Z - 0.022)), Z, lambda c: abs(c.x) < 0.09)
    cut(Vector((0, 0, WAIST_Z)), Z, lambda c: abs(c.x) < 0.3)
    cut(HAIR_PLANE[0], HAIR_PLANE[1], lambda c: c.z > 1.58)
    for S, sx in (("L", 1), ("R", -1)):
        co, no = _arm_cut(S)
        cut(co, no, lambda c, sx=sx: c.x * sx > PR.X["shoulder"] + 0.05)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(obj.data)
    bm.free()


def classify_body(obj):
    segs = [("head", J["head"], J["head_top"]), ("neck", J["neck"], J["head"]),
            ("chest", J["chest"], J["chest_top"]), ("spine", J["spine"], J["chest"]),
            ("hips", Vector((0, 0, 0.88)), J["spine"])]
    for S in ("L", "R"):
        segs += [("shoulder", J["clav_" + S], J["shoulder_" + S]), ("upper_arm", J["shoulder_" + S], J["elbow_" + S]),
                 ("forearm", J["elbow_" + S], J["wrist_" + S]),
                 ("thigh", J["hip_" + S], J["knee_" + S]), ("shin", J["knee_" + S], J["ankle_" + S]),
                 ("foot", J["ankle_" + S], J["toe_" + S])]
    hc, hn = HAIR_PLANE
    regions = []
    for poly in obj.data.polygons:
        c = poly.center
        name, _, t = min(((n,) + seg_dist(c, a, b) for n, a, b in segs), key=lambda x: x[1])
        if name == "head" or (name == "neck" and c.z > COLLAR_Z + 0.03):
            reg = "hair" if (c - hc).dot(hn) > 0 else "skin"
        elif name == "neck" or (c.z > COLLAR_Z - 0.03 and abs(c.x) < 0.08):
            reg = "skin" if c.z > COLLAR_Z else ("trim" if c.z > COLLAR_Z - 0.022 else "shirt")
        elif name in ("upper_arm", "forearm"):
            co, no = _arm_cut("L" if c.x > 0 else "R")
            reg = "shirt" if (c - co).dot(no) < 0 else "sleeve"
        else:
            reg = "shirt" if c.z > WAIST_Z else "trousers"
        regions.append(R[reg])
    obj.data.attributes.new("region", 'INT', 'FACE').data.foreach_set("value", regions)


def build_body(arm, target_tris=7000):
    p = Piece("body")
    bm = p.bm
    add_loft(bm, PR.TORSO, seg=28)
    # chest, shoulder blades and seat give the torso its shape
    for sx in (1, -1):
        add_ellipsoid(bm, (0.072 * sx, -0.062, 1.318), (0.088, 0.05, 0.07))           # pecs
        add_ellipsoid(bm, (0.085 * sx, 0.052, 1.34), (0.085, 0.05, 0.10))            # shoulder blades / lats
        add_ellipsoid(bm, (0.078 * sx, 0.055, 0.905), (0.088, 0.065, 0.095))         # glutes
        add_capsule(bm, (0.035 * sx, 0.012, 1.505), (0.16 * sx, 0.008, 1.462), 0.042, 0.04)   # trapezius slope
    add_capsule(bm, (0, 0.012, 1.43), (0, 0.004, PR.Z["chin"] + 0.04), PR.NECK_R[0], PR.NECK_R[0] * 0.93)
    # head: cranium plus a jaw, no detailed face
    add_ellipsoid(bm, (0, 0.010, 1.700), (0.079, 0.098, 0.100), seg=28, rings=18)
    add_ellipsoid(bm, (0, -0.022, 1.622), (0.064, 0.072, 0.064))
    add_ellipsoid(bm, (0, -0.092, 1.668), (0.012, 0.018, 0.022))                      # nose
    for S, sx in (("L", 1), ("R", -1)):
        add_ellipsoid(bm, (0.079 * sx, 0.008, 1.672), (0.011, 0.022, 0.03))           # ears
        sh, el, wr = J["shoulder_" + S], J["elbow_" + S], J["wrist_" + S]
        u = (el - sh).normalized()
        add_ellipsoid(bm, sh + u * 0.018 + Vector((-0.006 * sx, 0, 0.006)), (0.058, 0.060, 0.058), basis=Matrix.Rotation(rad(-45 * sx), 3, 'Y'))   # deltoid
        add_limb(bm, sh, el, PR.UPPER_ARM)
        add_limb(bm, el, wr, PR.FOREARM)
        add_limb(bm, J["hip_" + S] + Vector((0, 0.005, 0.02)), J["knee_" + S], PR.THIGH)
        add_ellipsoid(bm, J["knee_" + S] + Vector((0, -0.012, 0.0)), (0.054, 0.052, 0.06))
        add_limb(bm, J["knee_" + S], J["ankle_" + S], PR.SHIN)
        add_capsule(bm, J["ankle_" + S], J["ball_" + S], 0.038, 0.032)
    body = p.to_object()
    voxel_skin(body, 0.0075, 6, target_tris)
    cut_borders(body)
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
    return join([body] + build_face(body) + build_shoes(), "body")


def build_hands(arm, target_tris=1400):
    """Bare hands, relaxed and slightly curled. A separate piece so gloved roles drop them."""
    out = []
    for S, sx in (("L", 1), ("R", -1)):
        rot, wrist = bone_frame(arm, "hand_" + S)
        X, Y, Zh = rot.col[0], rot.col[1], rot.col[2]
        radial = -X * sx
        p = Piece("hand_" + S)
        bm = p.bm
        add_capsule(bm, wrist - Y * 0.02, wrist + Y * 0.02, 0.029, 0.031, seg=12)
        add_ellipsoid(bm, wrist + Y * 0.055 + Zh * 0.002, (0.043, 0.056, 0.019), basis=rot, seg=16, rings=10)
        # four fingers, curled a little towards the palm
        for i, off in enumerate((0.024, 0.008, -0.008, -0.023)):
            base = wrist + Y * 0.098 + radial * off
            ln = (0.040, 0.046, 0.043, 0.034)[i]
            mid = base + Y * ln * 0.55 + Zh * 0.010
            tip = mid + (Y * 0.9 + Zh * 0.42).normalized() * ln * 0.55
            add_capsule(bm, base, mid, 0.0102, 0.0095, seg=8)
            add_capsule(bm, mid, tip, 0.0095, 0.0085, seg=8)
        tb = wrist + Y * 0.025 + radial * 0.030 + Zh * 0.010
        tm = tb + (Y * 0.6 + radial * 0.6 + Zh * 0.45).normalized() * 0.040
        add_capsule(bm, tb, tm, 0.014, 0.011, seg=8)
        add_capsule(bm, tm, tm + (Y * 0.8 + Zh * 0.5).normalized() * 0.028, 0.011, 0.009, seg=8)
        obj = p.to_object()
        voxel_skin(obj, 0.004, 3, target_tris // 2)
        obj.data.attributes.new("region", 'INT', 'FACE').data.foreach_set("value", [R["skin"]] * len(obj.data.polygons))
        out.append(rigid(obj, "hand_" + S))
    return join(out, "hands")


def build_face(body):
    """A simple, friendly face: eyes, brows and a mouth line pressed onto the head."""
    deps = bpy.context.evaluated_depsgraph_get()

    def on_face(x, z, sink=0.003):
        ok, loc, no, _ = body.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)), depsgraph=deps)
        return (loc - no * sink) if ok else Vector((x, -0.09, z))
    p = Piece("face")
    for sx in (1, -1):
        p.tag(add_ellipsoid(p.bm, on_face(0.031 * sx, 1.690), (0.0095, 0.0065, 0.0095), seg=8, rings=6), "dark")
        p.tag(add_ellipsoid(p.bm, on_face(0.032 * sx, 1.713, 0.002), (0.019, 0.006, 0.0045), seg=8, rings=4), "hair")
    p.tag(add_ellipsoid(p.bm, on_face(0, 1.618, 0.002), (0.017, 0.005, 0.003), seg=8, rings=4), "dark")
    return [rigid(p.to_object(), "head")]


SHOE = [(0.088, 0.034, 0.070), (0.070, 0.043, 0.102), (0.030, 0.047, 0.112), (-0.020, 0.048, 0.092),
        (-0.080, 0.052, 0.068), (-0.130, 0.051, 0.054), (-0.172, 0.045, 0.043), (-0.198, 0.032, 0.034), (-0.210, 0.012, 0.026)]


def build_shoes():
    """Low-cut cricket shoes lofted heel to toe: (y, half width, top) per section."""
    out = []
    for S, sx in (("L", 1), ("R", -1)):
        p = Piece("shoe_" + S)
        bm = p.bm
        x0, seg = 0.117 * sx, 16
        rows = []
        for y, rx, top in SHOE:
            ring = []
            for k in range(seg):
                a = 2 * math.pi * k / seg
                ca, sa = math.cos(a), math.sin(a)
                ex = math.copysign(abs(ca) ** (2 / 2.6), ca)
                ez = math.copysign(abs(sa) ** (2 / (3.2 if sa < 0 else 2.2)), sa)
                ring.append(bm.verts.new((x0 + rx * ex - 0.004 * sx * (y < -0.1), y, max(0.003, top / 2 + top / 2 * ez))))
            rows.append(ring)
        for i in range(len(rows) - 1):
            for k in range(seg):
                bm.faces.new((rows[i][k], rows[i][(k + 1) % seg], rows[i + 1][(k + 1) % seg], rows[i + 1][k]))
        bm.faces.new(rows[0][::-1])
        bm.faces.new(rows[-1])
        for f in bm.faces:
            c = f.calc_center_median()
            f[p.reg] = R["sole"] if c.z < 0.016 else (R["trim"] if 0.07 < c.z and c.y > 0.05 else R["shoe"])
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


def grip_axes(rot, sx):
    """Hand-bone axes (X, Y, Zh), the thumb side, the grip point offset and the handle
    direction (pointing from the little finger to the thumb, i.e. towards the blade)."""
    X, Y, Zh = rot.col[0], rot.col[1], rot.col[2]
    radial = -X * sx
    h = (radial * math.cos(GRIP_ANGLE) + Y * math.sin(GRIP_ANGLE)).normalized()
    return X, Y, Zh, radial, h


def build_gloves(arm, style="bat"):
    keeper = style == "keeper"
    out = []
    for S, sx in (("L", 1), ("R", -1)):
        rot, wrist = bone_frame(arm, "hand_" + S)
        X, Y, Zh, radial, h = grip_axes(rot, sx)
        p = Piece("glove_" + S)
        bm = p.bm
        if keeper:
            p.tag(add_ellipsoid(bm, wrist + Y * 0.085 + Zh * 0.006, (0.07, 0.115, 0.045), basis=rot, seg=16, rings=10), "kglove")
            p.tag(add_ellipsoid(bm, wrist + Y * 0.06 + radial * 0.06 + Zh * 0.012, (0.03, 0.06, 0.03), basis=rot, seg=10, rings=6), "kglove")
            p.tag(add_ellipsoid(bm, wrist + Y * 0.075 + radial * 0.042 + Zh * 0.036, (0.036, 0.05, 0.006), basis=rot, seg=8, rings=4), "kweb")
            p.tag(add_capsule(bm, wrist - Y * 0.085, wrist + Y * 0.01, 0.054, 0.058, seg=14, caps=False), "kglove")
        else:
            # A closed fist round the handle. The handle runs along h through `grip`; the
            # fingers wrap it from the knuckles, over the far side, into the palm.
            grip = wrist + Y * GRIP_Y + Zh * GRIP_Z
            u1 = (Y - h * Y.dot(h)).normalized()           # from the handle towards the knuckles' far side
            u2 = h.cross(u1)
            if u2.dot(Zh) < 0:
                u2 = -u2                                   # u2 points to the palm
            # back of the hand and palm, flattened along the palm normal
            p.tag(add_ellipsoid(bm, wrist + Y * 0.040 - Zh * 0.004, (0.046, 0.052, 0.030), basis=rot, seg=14, rings=8), "white")
            # fingers: four padded rolls, index (thumb side) to little finger
            for off, rr, k0 in ((0.031, 0.0125, -58), (0.010, 0.0130, -60), (-0.011, 0.0125, -60), (-0.030, 0.0112, -54)):
                c0 = grip + h * off
                ring = 0.0175 + rr + 0.002
                pts = [c0 + (u1 * math.cos(rad(a)) + u2 * math.sin(rad(a))) * ring for a in range(k0 - 25, 141, 22)]
                # first point runs back to the knuckle, sitting on the back of the hand
                pts[0] = c0 - u2 * 0.02 - u1 * 0.004
                p.tag(add_tube(bm, pts, rr, 7), "white")
                p.tag(add_ellipsoid(bm, pts[-1], (rr, rr, rr), seg=7, rings=4), "white")
            # padded sausages on the back of the fingers (the protective rolls)
            for off in (0.031, 0.010, -0.011, -0.030):
                c0 = grip + h * off
                a = rad(-20)
                q = c0 + (u1 * math.cos(a) + u2 * math.sin(a)) * 0.034
                p.tag(add_capsule(bm, q - h * 0.0, q + (u1 * 0.6 + u2 * -0.8).normalized() * 0.02, 0.0118, 0.011, seg=8), "white")
            # thumb: from the heel of the hand round the handle, pressing over the fingers
            t0 = wrist + Y * 0.025 + radial * 0.034 + Zh * 0.014
            t1 = grip + h * 0.046 + u2 * 0.022 + u1 * -0.002
            t2 = grip + h * 0.030 + u2 * 0.034 + u1 * 0.016
            p.tag(add_capsule(bm, t0, t1, 0.017, 0.0135, seg=8), "white")
            p.tag(add_capsule(bm, t1, t2, 0.0135, 0.012, seg=8), "white")
            # side bar protecting the thumb-side of the hand
            p.tag(add_capsule(bm, wrist + Y * 0.01 + radial * 0.035, wrist + Y * 0.06 + radial * 0.044 - Zh * 0.006, 0.014, 0.013, seg=8), "white")
            p.tag(add_capsule(bm, wrist - Y * 0.075, wrist + Y * 0.012, 0.045, 0.047, seg=12, caps=False), "white")      # cuff
            p.tag(add_ellipsoid(bm, wrist - Y * 0.075, (0.045, 0.045, 0.008), basis=rot, seg=12, rings=4), "white")
        shell = p.to_object()
        voxel_skin(shell, 0.0038, 2, 900 if keeper else 1300)
        shell.data.attributes.new("region", 'INT', 'FACE').data.foreach_set(
            "value", [R["kglove" if keeper else "white"]] * len(shell.data.polygons))
        if keeper:      # the web between thumb and finger stays dark
            reg = shell.data.attributes["region"]
            web = wrist + Y * 0.075 + radial * 0.042 + Zh * 0.036
            for poly in shell.data.polygons:
                if (poly.center - web).length < 0.03 and poly.normal.dot(Zh) > 0.3:
                    reg.data[poly.index].value = R["kweb"]
        q = Piece("strap_" + S)
        rs = 0.059 if keeper else 0.049
        q.tag(add_tube(q.bm, [wrist - Y * 0.03 + (X * math.cos(rad(a)) - Zh * math.sin(rad(a))) * rs for a in range(0, 181, 30)],
                       0.006, 4), "strap")
        out += [rigid(shell, "hand_" + S), rigid(q.to_object(), "hand_" + S)]
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
# Bat (standard men's size, Laws limits): 965 mm overall, blade 108 mm wide.
BAT = dict(toe=0.0, blade_top=0.555, shoulder_top=0.615, handle_top=0.958, width=0.108,
           face=-0.028, edge=0.040, spine=0.064, spine_at=0.20, handle_r=0.0172)


def _bat_section(z):
    """Blade cross-section at height z: closed loop of (x, y), face towards -Y."""
    b = BAT
    w = b["width"] / 2
    edge = b["edge"] - 0.006 * smooth(z, 0.30, 0.55) - 0.004 * (1 - smooth(z, 0.0, 0.06))
    spine = b["edge"] + (b["spine"] - b["edge"]) * math.exp(-((z - b["spine_at"]) / 0.17) ** 2)
    spine = max(spine, edge + 0.008)
    yf = b["face"]
    pts = []
    for t in (-1.0, -0.6, -0.2, 0.2, 0.6, 1.0):            # face, slightly bowed
        pts.append((t * w * 0.94, yf - 0.002 * (1 - t * t)))
    pts += [(w, yf + 0.006), (w, yf + edge - 0.007), (w * 0.93, yf + edge)]          # right edge, rounded corners
    for t in (0.62, 0.30, 0.0, -0.30, -0.62):                # the back: a ridge rising to the spine
        k = 1 - abs(t)
        pts.append((t * w, yf + edge + (spine - edge) * (k ** 0.85)))
    pts += [(-w * 0.93, yf + edge), (-w, yf + edge - 0.007), (-w, yf + 0.006)]
    return pts


def build_bat_mesh():
    p = Piece("bat")
    bm = p.bm
    b = BAT
    zs = [0.0, 0.004, 0.012, 0.04, 0.10, 0.17, 0.24, 0.31, 0.38, 0.45, 0.51, b["blade_top"]]
    rows = []
    for z in zs:
        sec = _bat_section(z)
        toe = 0.96 + 0.04 * smooth(z, 0.0, 0.012)           # toe corners slightly rounded
        rows.append([bm.verts.new((X_BAT + x * toe, y * (0.93 + 0.07 * smooth(z, 0.0, 0.012)), z)) for x, y in sec])
    # shoulders: the blade narrows in a curve into the handle
    top = _bat_section(b["blade_top"])
    cy = b["face"] + 0.028
    for z, k in ((0.575, 0.80), (0.592, 0.55), (0.604, 0.34), (b["shoulder_top"], 0.20)):
        rows.append([bm.verts.new((X_BAT + x * k, cy + (y - cy) * (0.35 + 0.65 * k), z)) for x, y in top])
    n = len(rows[0])
    nface = 6
    for i in range(len(rows) - 1):
        z = (rows[i][0].co.z + rows[i + 1][0].co.z) / 2
        for k in range(n):
            f = bm.faces.new((rows[i][k], rows[i][(k + 1) % n], rows[i + 1][(k + 1) % n], rows[i + 1][k]))
            back = k >= 9 and k <= 13
            if (k < nface - 1 and 0.40 < z < 0.53 and 0 < k < 4) or (back and 0.22 < z < 0.46):
                f[p.reg] = R["sticker"]
            elif (k in (6, 7) or k in (n - 2, n - 1)) and 0.30 < z < 0.42:
                f[p.reg] = R["sticker"]                       # edge stickers
            else:
                f[p.reg] = R["wood"]
    bm.faces.new(rows[0][::-1])[p.reg] = R["wood"]
    bm.faces.new(rows[-1])[p.reg] = R["wood"]
    # handle: cane under a rubber grip, a little thicker towards the top
    hy = cy
    p.tag(add_capsule(bm, (X_BAT, hy, b["shoulder_top"] - 0.03), (X_BAT, hy, 0.66), 0.0158, 0.0158, seg=10, caps=False), "wood")
    pts = [(X_BAT, hy, z) for z in (0.655, 0.70, 0.80, 0.90, b["handle_top"] - 0.006)]
    p.tag(add_tube(bm, pts, b["handle_r"], 12), "grip")
    p.tag(add_ellipsoid(bm, (X_BAT, hy, b["handle_top"] - 0.006), (b["handle_r"], b["handle_r"], 0.008), seg=12, rings=4), "grip")
    for z in (0.66, 0.952):                                    # grip ends
        p.tag(add_tube(bm, [(X_BAT, hy, z - 0.004), (X_BAT, hy, z + 0.004)], b["handle_r"] + 0.0012, 12), "dark")
    obj = p.to_object()
    obj.data.shade_smooth()
    return obj


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
        self.len_ua = {S: arm.data.bones["upper_arm_" + S].length for S in ("L", "R")}
        self.len_fa = {S: arm.data.bones["forearm_" + S].length for S in ("L", "R")}

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
            offs = (("L", 0.0), ("R", PR.HAND_GAP)) if P.get("bat") else (("R", 0.0),)
            for _ in range(6):
                for S, off in offs:
                    v = G + d * off - shoulders[S]
                    if v.length > REACH:
                        G -= v.normalized() * (v.length - REACH)
                    elif v.length < MIN_REACH:
                        G += v.normalized() * (MIN_REACH - v.length)
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

        def hand_at(S, th):
            """Fist round the handle, turned th degrees about it: (X, Y, Zh, wrist)."""
            b1 = e3.normalized()
            b2 = d.cross(b1)
            Yp = b1 * math.cos(rad(th)) + b2 * math.sin(rad(th))
            Y = Yp * math.cos(GRIP_ANGLE) + d * math.sin(GRIP_ANGLE)
            radial = (d - Y * Y.dot(d)).normalized()
            X = -radial if S == "L" else radial
            Zh = X.cross(Y)
            return X, Y, Zh, grips[S] - Y * GRIP_Y - Zh * GRIP_Z

        def elbow_at(S, W, psi):
            """Two-bone solve: elbow towards the keyed pole, swivelled psi degrees about
            the shoulder-wrist line. Returns (elbow, overreach, pole point)."""
            sh, pole = shoulders[S], P["poles"][S]
            a, b = self.len_ua[S], self.len_fa[S]
            v = W - sh
            dist = min(v.length, a + b - 1e-4)
            u = v.normalized()
            x = (a * a - b * b + dist * dist) / (2 * dist)
            r = math.sqrt(max(0.0, a * a - x * x))
            pv = (pole - sh) - u * (pole - sh).dot(u)
            pv = Matrix.Rotation(rad(psi), 3, u) @ pv.normalized()
            return sh + u * x + pv * r, v.length - (a + b), sh + u * x + pv * 0.6

        def grip_frame(S):
            """Turn the fist about the handle, and swivel the elbow a little off its pole,
            until the wrist is as straight as it can be. Returns (hand frame, pole point)."""
            def cost(th, psi):
                X, Y, Zh, W = hand_at(S, th)
                E, over, _ = elbow_at(S, W, psi)
                return (W - E).angle(Y) + max(0.0, over) * 20 + abs(rad(psi)) * 0.35
            best = min(((th, psi) for th in range(0, 360, 8) for psi in range(-45, 46, 15)), key=lambda q: cost(*q))
            best = min(((th, psi) for th in range(best[0] - 8, best[0] + 9, 2) for psi in range(best[1] - 12, best[1] + 13, 4)),
                       key=lambda q: cost(*q))
            X, Y, Zh, W = hand_at(S, best[0])
            return self._frame(X, Y, Zh, W), elbow_at(S, W, best[1])[2]

        for S in ("L", "R"):
            if S in grips:
                m, pole = grip_frame(S)
                self.grip[S].influence = 1.0
            else:
                wrist = P["hands"][S].copy()
                gap = (wrist - shoulders[S]).length - ARM_FREE
                if gap > 0:
                    wrist += (shoulders[S] - wrist).normalized() * gap
                m = Matrix.Translation(wrist)
                pole = P["poles"][S]
                self.grip[S].influence = 0.0
            self._key(self.ctrl["hand_tgt_" + S], m, f)
            pb["hand_" + S].constraints[self.grip[S].name].keyframe_insert("influence", frame=f)
            self._key(self.ctrl["elbow_pole_" + S], Matrix.Translation(pole), f)

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
