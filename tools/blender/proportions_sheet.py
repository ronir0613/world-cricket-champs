"""Render the body canon: front, side and batter outfit against a 7.5-head grid.

    "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --factory-startup --python tools/blender/proportions_sheet.py

Writes <WORK>/previews/proportions.png and docs/body-proportions.png.
"""
import bpy, sys, os, math, shutil
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cricket_lib as L
import proportions as PR

PROJECT = os.path.normpath(os.path.join(HERE, "..", ".."))
WORK = os.environ.get("WORK", r"E:\blender")
PREV = os.path.join(WORK, "previews")
os.makedirs(os.path.join(PREV, "_tmp"), exist_ok=True)

L.reset()
mat = L.make_material(WORK)
arm = L.build_armature()
body = L.build_body(arm)
hands = L.build_hands(arm)
kit = [L.build_helmet(), L.build_pads("bat"), L.build_gloves(arm, "bat")]
bat = L.build_bat_mesh()
for o in [hands] + kit:
    o.parent = arm
    o.modifiers.new("Armature", 'ARMATURE').object = arm
for o in [body, hands, bat] + kit:
    L.apply_palette(o, mat)
print("TRIS body %d hands %d gloves %d bat %d" % (L.tris(body), L.tris(hands), L.tris(kit[2]), L.tris(bat)))

sc = bpy.context.scene
cam, ground = L.preview_setup(420, 620)
ground.hide_render = True
sc.world.color = (0.93, 0.93, 0.91)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.15

# head-unit lines with labels
lm = bpy.data.materials.new("line")
lm.diffuse_color = (0.75, 0.2, 0.2, 1)
marks = [(PR.HEIGHT - i * PR.HEAD, "%g" % i) for i in range(0, 8)] + [(0.0, "7.5")]
for z, label in marks:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.6, z))
    ln = bpy.context.object
    ln.scale = (1.6, 0.002, 0.0025)
    ln.data.materials.append(lm)
    bpy.ops.object.text_add(location=(-0.70, 0.55, z + 0.012))
    t = bpy.context.object
    t.data.body = label
    t.data.size = 0.055
    t.rotation_euler = (math.radians(90), 0, 0)
    t.data.materials.append(lm)
lines = [o for o in bpy.data.objects if o.name.startswith(("Cube", "Text"))]


def shot(view, show, out):
    for o in bpy.data.objects:
        if o.type in ('MESH', 'FONT'):
            o.hide_render = o not in show and o not in lines
    if view == "front":
        cam.location, cam.rotation_euler = (0, -6, 0.9), (math.radians(90), 0, 0)
        for o in lines:
            o.location.y, o.rotation_euler.z = 0.6, 0
            if o.type == 'FONT':
                o.location.x = -0.70
    else:
        cam.location, cam.rotation_euler = (-6, 0, 0.9), (math.radians(90), 0, math.radians(-90))
        for o in lines:
            o.location.x, o.rotation_euler.z = 0.6, math.radians(-90)
            o.location.y = 0.0 if o.type != "FONT" else 0.70
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return out


# the bat stands beside the batter, grip at the hip
bat.location = (0.25 - L.X_BAT, 0.35, 0.0)
paths = [shot("front", [body, hands], os.path.join(PREV, "_tmp", "pf.png")),
         shot("side", [body, hands], os.path.join(PREV, "_tmp", "ps.png")),
         shot("front", [body] + kit + [bat], os.path.join(PREV, "_tmp", "pk.png"))]
out = os.path.join(PREV, "proportions.png")
L.contact_sheet(paths, 3, out)
shutil.copy(out, os.path.join(PROJECT, "docs", "body-proportions.png"))
print("SHEET", out)
