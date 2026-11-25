"""Render chosen frames of one clip from cricketer.blend into a contact sheet.

    blender --background E:/blender/cricketer.blend --python tools/blender/render_clip.py -- run 0,4,8,12 body+cap side E:/blender/previews/run.png

outfit: pieces joined with "+" (add "bat" to show the bat). view: side, front, 34, back, top.
"""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cricket_lib as L
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
clip, frames, outfit, view, out = args[0], [int(x) for x in args[1].split(",")], args[2].split("+"), args[3], args[4]
sc = bpy.context.scene
arm = bpy.data.objects["Cricketer"]
for tr in arm.animation_data.nla_tracks:
    tr.mute = True
act = bpy.data.actions[clip]
cam = sc.camera or L.preview_setup()[0]          # builds made with NO_RENDER have no camera yet
bat = bpy.data.objects.get("bat")
if bat is not None and bat.parent is None and "bat" in outfit:
    # attach in the rest pose, so the bat keeps its place relative to the bat bone
    arm.animation_data.action = None
    sc.frame_set(0)
    bpy.context.view_layer.update()
    world = bat.matrix_world.copy()
    bat.parent, bat.parent_type, bat.parent_bone = arm, 'BONE', "bat"
    bpy.context.view_layer.update()
    bat.matrix_world = world
arm.animation_data.action = act
f0 = int(act.frame_range[0])
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if "_LOD" in o.name:
        o.hide_render = not (o.name.endswith("_LOD0") and o.name[:-5] in outfit)
    elif o.name.startswith("bat"):
        o.hide_render = "bat" not in outfit
    elif o.name.startswith(("ball", "stump", "bail")):
        o.hide_render = True
os.makedirs(os.path.join(os.path.dirname(out), "_tmp"), exist_ok=True)
OFFSETS = {"side": (-5.0, 0.6, 0.5), "front": (0.3, -5.0, 0.4), "34": (-2.2, -2.9, 0.7), "back": (0.3, 5.0, 0.6), "top": (-0.5, 0.0, 5.0),
           # close-ups aimed at the hands
           "grip_off": (-1.1, -0.2, 0.15), "grip_bowler": (0.1, -1.1, 0.15), "grip_leg": (1.1, -0.2, 0.2), "grip_top": (-0.3, -0.3, 1.0)}
paths = []
for k in frames:
    sc.frame_set(f0 + k)
    pb = arm.pose.bones
    if view.startswith("grip"):
        target = arm.matrix_world @ ((pb["hand_L"].head + pb["hand_L"].tail + pb["hand_R"].head + pb["hand_R"].tail) / 4)
    else:
        target = arm.matrix_world @ pb["hips"].head + Vector((0, 0, 0.1))
    L.aim(cam, target + Vector(OFFSETS[view]), target)
    p = os.path.join(os.path.dirname(out), "_tmp", "rc_%d.png" % k)
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    paths.append(p)
L.contact_sheet(paths, len(paths), out)
print("SHEET", out)
