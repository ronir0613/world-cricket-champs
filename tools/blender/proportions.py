"""The squad's body canon: one standard set of proportions every player is built from.

Stylised athlete, 7.5 heads tall (1.80 m). Faces stay simple; proportions follow a real
adult male so poses read correctly at any camera distance. Every number the body,
skeleton, outfits and grip use comes from here, so changing the canon changes them all.

Units: metres, Blender space (Z up, rest pose faces -Y, left side +X).
Heights are measured from the ground with the player standing straight.
"""
from mathutils import Vector

HEIGHT = 1.80
HEADS = 7.5
HEAD = HEIGHT / HEADS            # 0.24 m: the unit the canon is laid out in

# ---------------------------------------------------------------- landmark heights (z)
Z = dict(
    head_top=1.800,
    eyes=1.690,                  # half way down the head
    chin=1.560,                  # 1 head
    neck_base=1.470,             # top of the sternum, between the collarbones
    shoulder=1.450,              # shoulder joint centre
    chest=1.320,                 # nipple line, 2 heads
    elbow=1.120,                 # arms hanging
    waist=1.080,                 # navel, 3 heads; narrowest point of the torso
    hip=0.930,                   # hip joint centre
    crotch=0.840,                # 4 heads, a touch under half height
    wrist=0.860,                 # arms hanging
    fingertip=0.670,             # mid thigh
    knee=0.500,                  # knee joint centre
    calf=0.360,                  # widest point of the calf
    ankle=0.085,
)

# ---------------------------------------------------------------- half widths (x)
X = dict(
    shoulder=0.176,              # shoulder joint centre
    deltoid=0.235,               # outside of the shoulders: 0.47 m, just under 2 heads
    chest=0.170,
    waist=0.140,
    hips=0.175,                  # outside of the hips: 1.45 heads, narrower than the shoulders
    hip=0.092,                   # hip joint centre
    knee=0.098,
    ankle=0.110,
)

# ---------------------------------------------------------------- segment lengths
LEN = dict(
    upper_arm=0.320,
    forearm=0.265,
    palm=0.100,                  # wrist to knuckles
    fingers=0.090,
    thigh=0.430,
    shin=0.415,
    foot=0.265,
    neck=0.120,
)

# ---------------------------------------------------------------- girths (radii)
# (side-to-side, front-to-back); limbs list them from the top joint down as (t, rx, ry)
NECK_R = (0.056, 0.058)
UPPER_ARM = [(0.0, 0.056, 0.058), (0.35, 0.050, 0.056), (0.75, 0.044, 0.046), (1.0, 0.041, 0.040)]
FOREARM = [(0.0, 0.042, 0.040), (0.22, 0.046, 0.042), (0.65, 0.036, 0.030), (1.0, 0.031, 0.021)]
THIGH = [(0.0, 0.092, 0.094), (0.30, 0.086, 0.090), (0.75, 0.066, 0.068), (1.0, 0.055, 0.056)]
SHIN = [(0.0, 0.052, 0.052), (0.30, 0.054, 0.062), (0.65, 0.043, 0.046), (1.0, 0.035, 0.036)]

# torso as superellipse sections, bottom to top: (z, half width, half depth, forward offset)
TORSO = [
    (0.835, 0.120, 0.090, 0.012),
    (0.900, 0.160, 0.108, 0.016),
    (0.960, X["hips"], 0.110, 0.012),
    (1.020, 0.152, 0.100, 0.004),
    (1.080, X["waist"], 0.094, 0.000),
    (1.150, 0.150, 0.099, -0.004),
    (1.230, 0.164, 0.108, -0.008),
    (1.320, X["chest"], 0.114, -0.010),
    (1.390, 0.172, 0.106, -0.004),
    (1.440, 0.150, 0.086, 0.006),
    (1.475, 0.075, 0.062, 0.010),
]

# arms rest 45 degrees down (A-pose) so the shoulders deform evenly both ways
ARM_DROP = 45.0
# a small rest bend tells the IK which way each elbow and knee folds
ELBOW_BACK, KNEE_FWD = 0.025, 0.03

# ---------------------------------------------------------------- the bat grip
# Where the handle runs through a closed batting fist, in the hand bone's frame
# (Y = wrist to knuckles, Z = palm normal, X = across the palm).
GRIP_Y, GRIP_Z = 0.068, 0.024
# The handle crosses the palm diagonally, from the heel of the hand to the base of the
# index finger, so the forearm meets the bat at about 90 + GRIP_ANGLE degrees.
GRIP_ANGLE = 32.0
HAND_GAP = 0.092                 # top-hand grip to bottom-hand grip, gloves touching


def joints():
    """Skeleton joint positions for the rest pose."""
    import math
    J = {"pelvis": (0, 0, Z["hip"]), "spine": (0, 0, 1.05), "chest": (0, 0, 1.22), "chest_top": (0, 0, 1.44),
         "neck": (0, 0.006, Z["neck_base"] - 0.01), "head": (0, 0.006, Z["chin"] + 0.015), "head_top": (0, 0, Z["head_top"])}
    c, s = math.cos(math.radians(ARM_DROP)), math.sin(math.radians(ARM_DROP))
    for S, sx in (("L", 1), ("R", -1)):
        sh = Vector((X["shoulder"] * sx, 0, Z["shoulder"]))
        arm = Vector((c * sx, 0, -s))
        el = sh + arm * LEN["upper_arm"] + Vector((0, ELBOW_BACK, 0))
        wr = sh + arm * (LEN["upper_arm"] + LEN["forearm"])
        hand = wr + arm * (LEN["palm"] + LEN["fingers"] * 0.6)
        hip = Vector((X["hip"] * sx, 0, Z["hip"] - 0.01))
        knee = Vector((X["knee"] * sx, -KNEE_FWD, Z["knee"]))
        ankle = Vector((X["ankle"] * sx, 0.015, Z["ankle"]))
        J.update({"clav_" + S: (0.03 * sx, 0, Z["shoulder"] - 0.03), "shoulder_" + S: sh, "elbow_" + S: el,
                  "wrist_" + S: wr, "hand_" + S: hand, "hip_" + S: hip, "knee_" + S: knee, "ankle_" + S: ankle,
                  "ball_" + S: (0.12 * sx, -0.115, 0.025), "toe_" + S: (0.12 * sx, -0.185, 0.02)})
    return {k: Vector(v) for k, v in J.items()}


def table():
    """The canon as rows for the reference sheet and docs: (name, value, in heads)."""
    rows = [("height", HEIGHT), ("head", HEAD)]
    rows += [("z " + k, v) for k, v in Z.items()]
    rows += [("width " + k, 2 * v) for k, v in X.items()]
    rows += [("length " + k, v) for k, v in LEN.items()]
    return [(n, round(v, 3), round(v / HEAD, 2)) for n, v in rows]
