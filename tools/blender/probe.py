"""Print joint positions of a clip's frames from cricketer.blend (world space).

    blender --background E:/blender/cricketer.blend --python tools/blender/probe.py -- cover_drive 27,42
"""
import bpy, sys, math
args = sys.argv[sys.argv.index("--") + 1:]
arm = bpy.data.objects["Cricketer"]
for tr in arm.animation_data.nla_tracks:
    tr.mute = True
act = bpy.data.actions[args[0]]
arm.animation_data.action = act
f0 = int(act.frame_range[0])
pb = arm.pose.bones
W = lambda v: tuple(round(x, 3) for x in (arm.matrix_world @ v))
for k in (int(x) for x in args[1].split(",")):
    bpy.context.scene.frame_set(f0 + k)
    out = {"head": W(pb["head"].head), "head_top": W(pb["head"].tail), "hips": W(pb["hips"].head)}
    for S in ("L", "R"):
        sh, el, wr = pb["upper_arm_" + S].head, pb["forearm_" + S].head, pb["hand_" + S].head
        a = math.degrees((sh - el).angle(wr - el))
        out["sh_" + S], out["el_" + S], out["wr_" + S], out["elbow_deg_" + S] = W(sh), W(el), W(wr), round(a)
        h = pb["hand_" + S]
        fa = (wr - el).normalized()
        out["wrist_bend_" + S] = round(math.degrees(fa.angle((h.tail - h.head).normalized())))
    print("PROBE %-16s %3d  elbow L %3d R %3d   wrist L %3d R %3d" % (args[0], k, out["elbow_deg_L"], out["elbow_deg_R"], out["wrist_bend_L"], out["wrist_bend_R"]))
    if "-v" in args:
        print("   ", out)
    bd = (pb["bat"].tail - pb["bat"].head).normalized()
    for S in ("L", "R"):
        h = pb["hand_" + S]
        Y = (h.tail - h.head).normalized()
        fa = (pb["hand_" + S].head - pb["forearm_" + S].head).normalized()
        print("  ", S, "angle(Y,bat)=%.0f angle(forearm,bat)=%.0f" % (math.degrees(Y.angle(bd)), math.degrees(fa.angle(bd))))
