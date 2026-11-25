"""Build the whole squad: one character (shared body + outfit pieces), props, animation packs.

    "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" --background --factory-startup --python tools/blender/build_all.py

Environment
    CLIPS=pull,cut     only build these clips (faster iteration; packs then hold just these)
    NO_RENDER=1        skip the preview contact sheets
    WORK=E:\\blender    where the .blend and previews go

Outputs
    assets/players/rig/character.glb        skeleton + body/outfit meshes, 3 LODs each
    assets/players/rig/anim_<group>.glb      clips for batting, bowling, fielding, umpire
    assets/players/rig/clips.json            durations, loop flags, events, outfits
    assets/props/{bat,ball,stumps,bails}.glb
"""
import bpy, sys, os, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cricket_lib as L
import clips as C

PROJECT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(PROJECT, "assets", "players", "rig")
PROPS = os.path.join(PROJECT, "assets", "props")
WORK = os.environ.get("WORK", r"E:\blender")
PREV = os.path.join(WORK, "previews")
for d in (OUT, PROPS, WORK, PREV, os.path.join(PREV, "_tmp")):
    os.makedirs(d, exist_ok=True)
LOD_RATIOS = [1.0, 0.4, 0.14]
OUTFITS = {"batter": ["body", "helmet", "bat_pads", "bat_gloves"], "bowler": ["body"], "fielder": ["body", "cap"],
           "keeper": ["body", "helmet", "keeper_pads", "keeper_gloves"], "umpire": ["body", "umpire_hat"]}
summary = {}

# ---------------------------------------------------------------- character
L.reset()
mat = L.make_material(WORK)
arm = L.build_armature()
pieces = {"body": L.build_body(arm), "helmet": L.build_helmet(), "cap": L.build_cap(), "umpire_hat": L.build_umpire_hat(),
          "bat_pads": L.build_pads("bat"), "keeper_pads": L.build_pads("keeper"),
          "bat_gloves": L.build_gloves(arm, "bat"), "keeper_gloves": L.build_gloves(arm, "keeper")}
lods = {}
for name, obj in pieces.items():
    if name != "body":
        obj.parent = arm
        obj.modifiers.new("Armature", 'ARMATURE').object = arm
    L.apply_palette(obj, mat)
    lods[name] = L.make_lods(obj, LOD_RATIOS)
summary["tris"] = {n: [L.tris(o) for o in objs] for n, objs in lods.items()}
all_meshes = [o for objs in lods.values() for o in objs]
summary["character_kb"] = L.export_glb(os.path.join(OUT, "character.glb"), [arm] + all_meshes)

# ---------------------------------------------------------------- props
bat = L.build_bat_mesh()
bat.data.transform(Matrix.Translation(-L.G0))
bat.location = L.G0                       # origin at the top-hand grip
ball = L.build_ball_mesh()
stumps = [L.build_stump_mesh("stump_" + n, x) for n, x in zip(("off", "middle", "leg"), L.STUMP_X)]
bails = [L.build_bail_mesh("bail_off", -0.107, -0.002), L.build_bail_mesh("bail_leg", 0.002, 0.107)]
for o in [bat, ball] + stumps + bails:
    L.apply_palette(o, mat)
summary["props_kb"] = {
    "bat": L.export_glb(os.path.join(PROPS, "bat.glb"), [bat]),
    "ball": L.export_glb(os.path.join(PROPS, "ball.glb"), [ball]),
    "stumps": L.export_glb(os.path.join(PROPS, "stumps.glb"), stumps),
    "bails": L.export_glb(os.path.join(PROPS, "bails.glb"), bails)}
for o in [ball] + stumps + bails:
    o.hide_render = True

# ---------------------------------------------------------------- animation
want = [s for s in os.environ.get("CLIPS", "").split(",") if s]
clips = [c for c in C.CLIPS if not want or c.name in want]
rig = L.AnimRig(arm)
start = 1
for c in clips:
    c.start = start
    for k in range(c.frames + 1):
        rig.key(start + k, c.pose(k))
    start += c.frames + 10
cal = next((c for c in clips if c.group == "batting"), clips[0])
summary["pole_angles"] = rig.calibrate(cal.start)
actions = {c.name: rig.bake(c.name, c.start, c.start + c.frames) for c in clips}
rig.cleanup()

# ---------------------------------------------------------------- previews
if not os.environ.get("NO_RENDER"):
    cam, ground = L.preview_setup()
    bat_view = bat.copy()
    bat_view.data = bat.data
    L.coll().objects.link(bat_view)
    bat_view.parent, bat_view.parent_type, bat_view.parent_bone = arm, 'BONE', "bat"
    bpy.context.view_layer.update()
    bat_view.matrix_world = bat.matrix_world.copy()
    bat.hide_render = True
    pb = arm.pose.bones
    by_group = {}
    for c in clips:
        for name, objs in lods.items():
            for i, o in enumerate(objs):
                o.hide_render = not (i == 0 and name in OUTFITS[c.outfit])
        bat_view.hide_render = c.group != "batting"
        arm.animation_data.action = actions[c.name]
        ev = list(c.events.values())
        ks = sorted({0, c.frames // 4, ev[0] if ev else c.frames // 2, 3 * c.frames // 4, c.frames})
        while len(ks) < 5:
            ks = sorted(set(ks) | {c.frames // 2 + len(ks)})
        for k in ks[:5]:
            bpy.context.scene.frame_set(c.start + k)
            hips = arm.matrix_world @ pb["hips"].head
            if c.group == "batting":
                L.aim(cam, (-3.6, -0.9, 1.15), (0.0, -0.35, 0.85))
            elif c.group == "bowling":
                L.aim(cam, hips + Vector((-5.0, 0.6, 0.5)), hips + Vector((0, 0, 0.25)))
            else:
                L.aim(cam, hips + Vector((-2.2, -2.9, 0.7)), hips + Vector((0, 0, 0.05)))
            p = os.path.join(PREV, "_tmp", "%s_%d.png" % (c.name, k))
            bpy.context.scene.render.filepath = p
            bpy.ops.render.render(write_still=True)
            by_group.setdefault(c.group, []).append(p)
    for g, paths in by_group.items():
        for i in range(0, len(paths), 25):
            L.contact_sheet(paths[i:i + 25], 5, os.path.join(PREV, "%s_%d.png" % (g, i // 25)))

# ---------------------------------------------------------------- animation packs
arm.animation_data.action = None
summary["anim_kb"] = {}
for g in sorted({c.group for c in clips}):
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for c in clips:
        if c.group == g:
            tr = arm.animation_data.nla_tracks.new()
            tr.name = c.name
            tr.strips.new(c.name, c.start, actions[c.name])
    summary["anim_kb"][g] = L.export_glb(os.path.join(OUT, "anim_%s.glb" % g), [arm], animations=True)

manifest = {
    "fps": L.FPS,
    "outfits": OUTFITS,
    "lods": "each piece is <piece>_LOD0/1/2; merge one outfit's meshes per LOD into one SkinnedMesh",
    "palette": {"size": [L.GX * L.CELL, L.GY * L.CELL], "cell": L.CELL, "columns": L.GX, "regions": L.REGIONS,
                "note": "cell i sits at column i % 8, row floor(i / 8) counted from the bottom of the image"},
    "props": {"bat": "origin at the top-hand grip; attach to bone 'bat' using that bone's bind pose",
              "ball": "origin at centre; hold in bone 'prop_R' (palm socket)",
              "stumps": "origin at the foot of the middle stump; nodes stump_off/middle/leg (off side is -X / three.js -X)",
              "bails": "same origin as stumps; nodes bail_off, bail_leg"},
    "clips": {c.name: {"group": c.group, "file": "anim_%s.glb" % c.group, "frames": c.frames,
                       "duration": round(c.frames / L.FPS, 3), "loop": c.loop, "outfit": c.outfit,
                       "events": {k: round(v / L.FPS, 3) for k, v in c.events.items()}, "notes": c.notes}
              for c in clips}}
with open(os.path.join(OUT, "clips.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, "cricketer.blend"))
print("SQUAD_SUMMARY " + json.dumps(summary))
