"""Every animation clip for the shared cricketer skeleton, written as keyframe tables.

A table is a list of (frame, {channel: value}). Channels are interpolated with
Catmull-Rom style curves; "_hold": True makes that key a still point. Values can be
numbers, vectors, or tuples of those (for example a foot is ((x, y, lift), yaw, heel)).

Clip spaces (Blender coordinates, metres; the game turns -Y into +Z):
    batting   batter at the origin, side-on, bowler towards -Y, off side -X (right-hander)
    bowling   bowler runs towards +Y, ball released near the origin
    others    in place at the origin, facing -Y
"""
import math
from mathutils import Vector, Matrix
import numpy as np

rad = math.radians
Z = Vector((0, 0, 1))
SWEET, GRIP_TO_TOE = 0.77, 0.92
STRAIGHT, COVER = (0.0, -1.0), (-0.45, -0.89)


# ---------------------------------------------------------------- tables
def _flat(name, val):
    if isinstance(val, (int, float)):
        yield name, (float(val),)
    elif all(isinstance(x, (int, float)) for x in val):
        yield name, tuple(float(x) for x in val)
    else:
        for i, sub in enumerate(val):
            yield from _flat("%s#%d" % (name, i), sub)


def hermite(keys, t):
    fr = [k[0] for k in keys]
    vals = [np.array(k[1], dtype=float) for k in keys]
    if t <= fr[0]:
        return vals[0]
    if t >= fr[-1]:
        return vals[-1]
    i = max(j for j in range(len(fr) - 1) if fr[j] <= t)

    def tan(j):
        if j == 0 or j == len(fr) - 1 or keys[j][2]:
            return vals[j] * 0
        return (vals[j + 1] - vals[j - 1]) / (fr[j + 1] - fr[j - 1])
    t0, t1 = fr[i], fr[i + 1]
    m0, m1 = tan(i) * (t1 - t0), tan(i + 1) * (t1 - t0)
    s = (t - t0) / (t1 - t0)
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * vals[i] + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * vals[i + 1] + (s3 - s2) * m1


class Table:
    def __init__(self, base, keys):
        self.ch = {}
        for k, d in [(0, base)] + keys:
            hold = bool(d.get("_hold"))
            for name, val in d.items():
                if name.startswith("_") or val is None:
                    continue
                for cname, cval in _flat(name, val):
                    lst = self.ch.setdefault(cname, [])
                    lst[:] = [x for x in lst if x[0] != k]
                    lst.append((k, cval, hold))
        for lst in self.ch.values():
            lst.sort(key=lambda x: x[0])

    def __call__(self, k):
        out = {}
        for cname, keys in self.ch.items():
            v = hermite(keys, k)
            parts = cname.split("#")
            val = float(v[0]) if len(v) == 1 else tuple(float(x) for x in v)
            node = out
            for p in parts[:-1]:
                node = node.setdefault(p, {})
            node[parts[-1]] = val
        return _tuplify(out)


def _tuplify(node):
    if isinstance(node, dict):
        if node and all(k.isdigit() for k in node):
            return tuple(_tuplify(node[k]) for k in sorted(node, key=int))
        return {k: _tuplify(v) for k, v in node.items()}
    return node


# ---------------------------------------------------------------- helpers
def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def swing(phi, s=STRAIGHT, lat=0.0):
    """Bat swinging in the vertical plane through s; phi 0 = toe straight down, + = toe back."""
    s = Vector((s[0], s[1], 0)).normalized()
    b, n = -s, Z.cross(s)
    d = (-Z * math.cos(rad(phi)) + b * math.sin(rad(phi)) + n * lat).normalized()
    f = d.cross(n)
    return d, (f - d * f.dot(d)).normalized()


def B(G, phi, s=STRAIGHT, lat=0.0):
    d, f = swing(phi, s, lat)
    return (tuple(G), tuple(d), tuple(f))


def BC(P, phi, s=STRAIGHT, lat=0.0):
    """Bat at contact: sweet spot on P."""
    d, f = swing(phi, s, lat)
    return (tuple(Vector(P) - d * SWEET), tuple(d), tuple(f))


def BV(G, d, f):
    return (tuple(G), tuple(Vector(d).normalized()), tuple(Vector(f).normalized()))


def BH(G, ang, tilt=0.0):
    """Horizontal-ish bat for pulls: blade towards angle ang (deg from +X), face leading the swing."""
    a = rad(ang)
    return BV(G, (math.cos(a), math.sin(a), tilt), (-math.sin(a), math.cos(a), 0.0))


def wm(alpha, f=0.05, r=0.55):
    """Bowling-arm hand on a circle around the right shoulder, in body space (left, forward, up).
    alpha 0 = straight up, positive = towards the batter (the body's left when side-on)."""
    return (-0.18 + r * math.sin(rad(alpha)), f, 0.50 + r * math.cos(rad(alpha)))


def steps(plants, k, swing_h=0.2, high=None):
    """Foot on the ground between (on, off); arcs between plants. plants: (on, off, (x, y), yaw)."""
    for on, off, xy, yaw in plants:
        if on <= k <= off:
            return ((xy[0], xy[1], 0.0), yaw, 30 * smooth01((k - (off - 3)) / 3.0) if k > off - 3 else 0.0)
    prev = max((p for p in plants if p[1] < k), key=lambda p: p[1], default=None)
    nxt = min((p for p in plants if p[0] > k), key=lambda p: p[0], default=None)
    if prev is None or nxt is None:
        p = prev or nxt
        return ((p[2][0], p[2][1], 0.0), p[3], 0.0)
    t = (k - prev[1]) / (nxt[0] - prev[1])
    s = smooth01(t)
    h = high if (high and nxt[0] - prev[1] > 12) else swing_h
    x = prev[2][0] + (nxt[2][0] - prev[2][0]) * s
    y = prev[2][1] + (nxt[2][1] - prev[2][1]) * s
    return ((x, y, h * math.sin(math.pi * t)), prev[3] + (nxt[3] - prev[3]) * s, 25 * (1 - t) - 10 * t)


def smooth01(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def cycle_feet(phase, stride, duty, lift, width, kick=0.0):
    """In-place gait facing -Y: each foot slides back under the body, then swings forward.
    Swing: the heel peels up behind (toe pointing down), the knee drives the foot through
    high, then the foot reaches forward heel-first. kick > 0 lifts the heel towards the
    seat early in the swing, as in running."""
    out = {}
    for S, sx, off in (("L", 1, 0.0), ("R", -1, 0.5)):
        ph = (phase + off) % 1.0
        if ph < duty:
            t = ph / duty
            fwd, h = stride / 2 - stride * t, 0.0
            heel = 40 * smooth01((t - 0.55) / 0.45) - 8 * (1 - smooth01(t / 0.15))
        else:
            t = (ph - duty) / (1 - duty)
            fwd = -stride / 2 + stride * (0.5 - 0.5 * math.cos(math.pi * t))
            h = lift * math.sin(math.pi * t) ** 0.5 + kick * math.sin(math.pi * min(1.0, t / 0.6)) * (1 - t)
            # behind the body fwd is negative: the heel folds up towards the seat
            fwd -= kick * 0.25 * math.sin(math.pi * min(1.0, t / 0.6)) * (1 - t)
            heel = 55 * (1 - smooth01(t / 0.55)) - 12 * smooth01((t - 0.6) / 0.4)
        # body space (left, forward, lift): feet="body" turns this into world space with the hips' yaw
        out[S] = ((width * sx, fwd, h), 0.0, heel)
    return out


def gait_arms(ph, kind):
    """Arms swing against the legs: left arm forward while the right foot is forward."""
    a = math.cos(2 * math.pi * ph)
    if kind == "run":     # elbows near 90 degrees, hands from hip to chest
        L = (0.17, 0.08 - 0.26 * a, 0.10 + 0.14 * max(0.0, -a) - 0.02 * max(0.0, a))
        R = (-0.17, 0.08 + 0.26 * a, 0.10 + 0.14 * max(0.0, a) - 0.02 * max(0.0, -a))
    else:                 # loose arms brushing the hips
        L = (0.21, 0.03 - 0.16 * a, -0.03 + 0.03 * abs(a))
        R = (-0.21, 0.03 + 0.16 * a, -0.03 + 0.03 * abs(a))
    return L, R


# ---------------------------------------------------------------- clip container
class Clip:
    def __init__(self, name, group, frames, table, flags=None, post=None, loop=False, events=None, outfit="batter", notes=""):
        self.name, self.group, self.frames, self.table = name, group, frames, table
        self.flags, self.post, self.loop = flags or {}, post, loop
        self.events, self.outfit, self.notes = events or {}, outfit, notes

    def pose(self, k):
        e = self.table(k)
        if self.post:
            self.post(k, e)
        return finalize(e, self.flags)


def finalize(e, fl):
    hips = Vector(e["hips"])
    yaw = e["yaw"]
    Rz = Matrix.Rotation(rad(yaw), 3, 'Z')
    Lx, Fw = Rz @ Vector((1, 0, 0)), Rz @ Vector((0, -1, 0))

    def brel(v):
        return hips + Lx * v[0] + Fw * v[1] + Z * v[2]
    P = dict(hips=hips, yaw=yaw, pitch=e.get("pitch", 0.0), roll=e.get("roll", 0.0),
             spine=tuple(e.get("spine", (0, 0, 0))), chest=tuple(e.get("chest", (0, 0, 0))))
    feet = {}
    for S in ("L", "R"):
        pos, fy, heel = e["foot" + S]
        if fl.get("feet") == "body":
            p = Vector((hips.x, hips.y, 0)) + Lx * pos[0] + Fw * pos[1]
            p.z = pos[2]
            fy = yaw + fy
        else:
            p = Vector(pos)
        feet[S] = (p, fy, heel)
    P["feet"] = feet
    mode = fl.get("mode", "free")
    if mode in ("bat", "bat1"):
        G, d, f = (Vector(x) for x in e["bat"])
        if fl.get("bat_space") == "body":
            G = brel(G)
            d = Lx * d[0] + Fw * d[1] + Z * d[2]
            f = Lx * f[0] + Fw * f[1] + Z * f[2]
        d.normalize()
        f = (f - d * f.dot(d)).normalized()
        P[mode] = (G, d, f)
    P["hands"] = {S: brel(e["hand" + S]) for S in ("L", "R") if ("hand" + S) in e}
    poles = {}
    for S, sx in (("L", 1), ("R", -1)):
        v = e.get("pole" + S)
        if v is None:
            poles[S] = brel((0.35 * sx, -0.55, 0.2))
        elif fl.get("poles") == "world":
            poles[S] = hips + Vector(v)
        else:
            poles[S] = brel(v)
    P["poles"] = poles
    P["look"] = Vector(e["look"]) if "look" in e else brel((0, 10, 0.55))
    return P


# ================================================================ batting
TOE_ST = Vector((-0.14, 0.12, 0.0))
_d = Vector((0.08, -0.17, 0.0))
_d.z = math.sqrt(GRIP_TO_TOE ** 2 - _d.length_squared)
G_ST = TOE_ST + _d
_dd = -_d.normalized()
PHI_ST = math.degrees(math.atan2(_dd.y, -_dd.z))
LAT_ST = _dd.x
BAT_ST = B(G_ST, PHI_ST, STRAIGHT, LAT_ST)
FOOT_L_ST, FOOT_R_ST = ((0.0, -0.21, 0.0), -78.0, 0.0), ((0.0, 0.17, 0.0), -90.0, 0.0)
BOWLER_EYE = (0, -20, 1.55)
BAT_BASE = dict(hips=(0.10, -0.02, 0.86), yaw=-90, pitch=6, roll=0, spine=(10, 0, 0), chest=(8, 8, 0),
                look=BOWLER_EYE, footL=FOOT_L_ST, footR=FOOT_R_ST, bat=BAT_ST,
                poleL=(-0.15, -0.75, 0.30), poleR=(-0.10, 0.65, -0.15))
BAT_FLAGS = dict(mode="bat", poles="world")
STANCE_KEY = dict(BAT_BASE)


def stance_post(k, e):
    t = k / 30.0
    br = math.sin(2 * math.pi * t / 2.0)
    tap = smooth01((k - 14) / 7) * (1 - smooth01((k - 23) / 7))
    x, y, z = e["hips"]
    e["hips"] = (x, y, z + 0.004 * br)
    p, yw, r = e["chest"]
    e["chest"] = (p + 0.8 * br, yw, r)
    G, d, f = e["bat"]
    nb = B(Vector(G) + Vector((0, 0, 0.045 * tap)), PHI_ST - 4 * tap, STRAIGHT, LAT_ST)
    e["bat"] = nb


def drive(name, s_dir, front, P, follow_G, follow_phi, contact_hips, follow_yaw, frames=49):
    """Front-foot drive: backlift, stride, contact at frame 27 (0.9 s), high finish."""
    mix = lambda w: (STRAIGHT[0] * (1 - w) + s_dir[0] * w, STRAIGHT[1] * (1 - w) + s_dir[1] * w)
    keys = [
        (6, dict(bat=B((-0.10, -0.02, 0.95), 35))),
        (8, dict(hips=(0.12, 0.01, 0.86), yaw=-92)),
        (11, dict(bat=B((-0.22, 0.10, 1.06), 100))),
        (12, dict(footL=FOOT_L_ST)),
        (14, dict(hips=(0.08, -0.10, 0.855), yaw=-90, pitch=7, spine=(10, 0, 0))),
        (15, dict(bat=B((-0.30, 0.16, 1.15), 150), footL=((front[0] * 0.35, -0.45, 0.09), -70, 12))),
        (17, dict(chest=(10, -5, 0))),
        (20, dict(bat=B((-0.42, -0.04, 1.15), 158, mix(0.75)))),
        (21, dict(hips=(contact_hips[0] + 0.04, contact_hips[1] + 0.08, 0.81), yaw=-82, pitch=10,
                  footL=((front[0], front[1], 0.0), front[2], 0.0))),
        (24, dict(bat=B((-0.50, -0.48, 1.00), 100, s_dir))),
        (27, dict(bat=BC(P, 8, s_dir), hips=contact_hips, yaw=-78, pitch=12, spine=(22, 0, 0), chest=(16, 5, 0), look=P,
                  poleL=(-0.35, -0.85, 0.55), poleR=(-0.20, 0.50, -0.25))),
        (31, dict(bat=B((-0.55, -1.05, 1.04), -60, s_dir))),
        (33, dict(hips=(contact_hips[0] - 0.02, contact_hips[1] - 0.03, 0.775), yaw=(follow_yaw - 78) / 2 - 10,
                  chest=(14, 18, 0), look=tuple(Vector(P) + Vector((s_dir[0] * 0.9, s_dir[1] * 0.9, 0))))),
        (26, dict(footR=FOOT_R_ST)),
        (36, dict(bat=B(tuple(Vector(follow_G) + Vector((-0.1, -0.1, -0.2))), -140, s_dir))),
        (41, dict(hips=(contact_hips[0] - 0.02, contact_hips[1] - 0.05, 0.80), yaw=follow_yaw, pitch=6, spine=(12, 0, 0),
                  chest=(6, 32, 0), footR=((-0.03, 0.12, 0.0), -68, 38), look=(s_dir[0] * 12, s_dir[1] * 12, 0.6),
                  poleL=(-0.45, -0.5, 0.9), poleR=(-0.70, -0.20, 0.20))),
        (42, dict(bat=B(follow_G, follow_phi, s_dir), _hold=True)),
        (frames, dict(bat=B(tuple(Vector(follow_G) + Vector((0.01, 0.01, 0))), follow_phi - 3, s_dir),
                      hips=(contact_hips[0] - 0.02, contact_hips[1] - 0.05, 0.80), yaw=follow_yaw + 2)),
    ]
    return Clip(name, "batting", frames, Table(STANCE_KEY, keys), BAT_FLAGS, events={"contact": 27})


def defence(name, back, P, phi, frames, hold_to):
    if back:
        move = [(5, dict(bat=B((-0.10, 0.0, 1.00), 45))),
                (8, dict(footR=((-0.08, 0.28, 0.06), -95, 0))), (11, dict(footR=((-0.08, 0.30, 0.0), -95, 0))),
                (12, dict(footL=((-0.04, 0.0, 0.05), -85, 0))), (15, dict(footL=((-0.03, 0.03, 0.0), -85, 0))),
                (15, dict(hips=(0.02, 0.14, 0.91), yaw=-90, pitch=3, spine=(6, 0, 0)))]
        stay = dict(hips=(0.01, 0.12, 0.90), poleL=(-0.20, -0.60, 0.70), poleR=(-0.15, 0.45, -0.20),
                    spine=(8, 0, 0), chest=(8, 4, 0), look=P, footR=((-0.08, 0.30, 0.0), -95, 0), footL=((-0.03, 0.03, 0.0), -85, 0))
    else:
        move = [(6, dict(bat=B((-0.12, -0.02, 0.98), 40))),
                (10, dict(footL=((-0.06, -0.40, 0.08), -70, 0))), (15, dict(footL=((-0.10, -0.62, 0.0), -65, 0))),
                (15, dict(hips=(0.0, -0.30, 0.80), yaw=-85, pitch=12))]
        stay = dict(hips=(-0.01, -0.36, 0.78), pitch=14, spine=(24, 0, 0), chest=(14, 2, 0), look=P,
                    poleL=(-0.20, -0.80, 0.50), poleR=(-0.10, 0.50, -0.20), footL=((-0.10, -0.62, 0.0), -65, 0))
    contact = dict(stay, bat=BC(P, phi), _hold=True)
    keys = move + [(19, contact), (hold_to, dict(contact)), (frames, dict(STANCE_KEY))]
    return Clip(name, "batting", frames, Table(STANCE_KEY, keys), BAT_FLAGS, events={"contact": 19})


def pull():
    keys = [
        (6, dict(bat=B((-0.10, -0.02, 0.96), 35))),
        (10, dict(footR=((-0.10, 0.30, 0.06), -85, 0), hips=(0.04, 0.10, 0.88), yaw=-75)),
        (12, dict(bat=B((-0.20, 0.12, 1.18), 140), footR=((-0.10, 0.30, 0.0), -85, 0))),
        (14, dict(footL=((0.08, -0.10, 0.05), -45, 0))),
        (17, dict(footL=((0.14, -0.06, 0.0), -30, 0), hips=(0.02, 0.14, 0.89), yaw=-45, pitch=6, chest=(6, -10, 0),
                  bat=BV((-0.05, 0.10, 1.30), (-0.2, 0.7, 0.68), (-0.9, 0.0, 0.2)), look=(-0.2, -4, 1.2))),
        (21, dict(bat=BH((0.15, 0.02, 1.18), 130, 0.1))),
        # contact at waist height, where short balls usually reach a batter in the nets
        (23, dict(bat=BH((0.35, -0.18, 1.02), 175, -0.12))),
        (25, dict(bat=BH((0.42, -0.30, 0.96), 204, -0.22), hips=(0.02, 0.12, 0.84), yaw=-20, pitch=10, chest=(10, 10, 0),
                  look=(-0.27, -0.61, 0.80), poleL=(0.10, -0.70, 0.30), poleR=(-0.20, 0.30, -0.30))),
        (28, dict(bat=BH((0.45, -0.35, 1.02), 255, -0.12))),
        (32, dict(bat=BH((0.45, -0.20, 1.20), 320, 0.2), yaw=0, chest=(6, 25, 0), footR=((-0.10, 0.30, 0.0), -70, 30),
                  look=(6, -6, 1.0))),
        (38, dict(bat=BH((0.35, 0.05, 1.30), 420, 0.6), yaw=10, chest=(4, 35, 0),
                  poleL=(0.30, -0.30, 0.60), poleR=(-0.30, -0.30, -0.20), _hold=True)),
        (48, dict(bat=BH((0.34, 0.06, 1.30), 422, 0.6), yaw=11)),
    ]
    return Clip("pull", "batting", 48, Table(STANCE_KEY, keys), BAT_FLAGS, events={"contact": 25})


def cut():
    keys = [
        (6, dict(bat=B((-0.12, 0.0, 0.98), 45))),
        (8, dict(footR=((-0.12, 0.22, 0.06), -100, 0))),
        (12, dict(footR=((-0.22, 0.24, 0.0), -100, 0), hips=(-0.04, 0.06, 0.87), yaw=-95,
                  bat=BV((-0.15, 0.12, 1.25), (0, 0.4, 0.92), (-1, 0, 0)))),
        (14, dict(footL=((-0.15, -0.15, 0.05), -95, 0))),
        (17, dict(footL=((-0.18, -0.12, 0.0), -95, 0))),
        (18, dict(bat=BV((-0.32, 0.15, 1.28), (-0.15, -0.25, 0.95), (-0.95, 0, 0.2)))),
        (21, dict(bat=BV((-0.48, 0.15, 1.15), (-0.2, -0.85, 0.45), (-0.9, 0.1, -0.3)))),
        (23, dict(bat=BV((-0.57, 0.15, 1.07), (-0.1, -0.95, -0.3), (-0.9, 0.1, -0.3)), hips=(-0.12, 0.04, 0.84), yaw=-100,
                  pitch=12, chest=(14, -5, 0), look=(-0.65, -0.58, 0.84), poleL=(-0.40, -0.60, 0.40), poleR=(-0.30, 0.40, -0.20))),
        (27, dict(bat=BV((-0.50, -0.10, 0.90), (0.2, -0.75, -0.65), (-0.6, 0.4, 0.2)))),
        (33, dict(bat=BV((-0.35, -0.30, 0.88), (0.6, -0.5, -0.6), (-0.4, -0.6, 0.2)), chest=(12, 10, 0),
                  look=(-8, -2, 0.5), _hold=True)),
        (46, dict(bat=BV((-0.35, -0.31, 0.88), (0.6, -0.5, -0.6), (-0.4, -0.6, 0.2)))),
    ]
    return Clip("cut", "batting", 46, Table(STANCE_KEY, keys), BAT_FLAGS, events={"contact": 23})


def leave():
    up = BV((-0.02, 0.08, 1.38), (0.1, 0.45, 0.88), (-0.9, 0, 0.1))
    keys = [
        (8, dict(footL=((-0.04, -0.38, 0.05), -75, 0))),
        (10, dict(bat=up, poleL=(-0.10, -0.60, 0.60))),
        (11, dict(footL=((-0.05, -0.40, 0.0), -75, 0), hips=(0.06, -0.15, 0.85), pitch=8)),
        (20, dict(look=(-0.5, -2, 0.9))),
        (30, dict(look=(-0.4, 1.5, 0.8))),
        (38, dict(bat=up, footL=((-0.05, -0.40, 0.0), -75, 0), hips=(0.06, -0.15, 0.85), _hold=True)),
        (50, dict(bat=BAT_ST, poleL=BAT_BASE["poleL"], look=BOWLER_EYE)),
        (56, dict(footL=FOOT_L_ST, hips=BAT_BASE["hips"], pitch=6)),
        (60, dict(STANCE_KEY)),
    ]
    return Clip("leave", "batting", 60, Table(STANCE_KEY, keys), BAT_FLAGS)


# batter with the bat in the right hand (running, resting between balls)
def bat_hand_post(gait):
    def post(k, e):
        if gait:
            ph = (k / 20.0) % 1.0
            gait_post(k, e, 20, "run", arms=False)
            L, R = gait_arms(ph, "run")
            e["handL"] = L
            # bat carried low in the right hand, pumping a little less than a free arm
            e["bat"] = ((-0.20, 0.10 + 0.6 * (R[1] - 0.08), 0.06 + 0.5 * (R[2] - 0.10)), (0.05, 0.6, -0.8), (-1, 0, 0))
        else:
            br = math.sin(2 * math.pi * k / 60.0)
            x, y, z = e["hips"]
            e["hips"] = (x + 0.012 * br, y, z + 0.003 * br)
    return post


FREE_STAND = dict(hips=(0, 0, 0.915), yaw=0, pitch=2, roll=0, spine=(2, 0, 0), chest=(2, 0, 0),
                  footL=((0.11, 0.0, 0.0), 6, 0), footR=((-0.11, 0.0, 0.0), -6, 0),
                  handL=(0.21, 0.02, -0.02), handR=(-0.21, 0.02, -0.02))
RUN_BASE = dict(FREE_STAND, hips=(0, 0, 0.92), pitch=12, spine=(6, 0, 0), chest=(2, 0, 0),
                handL=(0.17, 0.05, 0.12), handR=(-0.17, 0.05, 0.12), poleL=(0.30, -0.7, -0.25), poleR=(-0.30, -0.7, -0.25))

BATTING = [
    Clip("stance", "batting", 60, Table(STANCE_KEY, [(60, dict(STANCE_KEY))]), BAT_FLAGS, post=stance_post, loop=True),
    drive("cover_drive", COVER, (-0.20, -0.76, -55), (-0.38, -0.82, 0.14), (-0.40, -0.86, 1.55), -215, (-0.06, -0.44, 0.77), -56),
    drive("straight_drive", STRAIGHT, (-0.06, -0.76, -65), (-0.20, -0.86, 0.13), (-0.30, -0.88, 1.55), -215, (-0.02, -0.44, 0.77), -62),
    defence("forward_defence", False, (-0.28, -0.72, 0.12), 18, 56, 36),
    defence("back_defence", True, (-0.27, -0.10, 0.62), 4, 54, 34),
    pull(), cut(), leave(),
    Clip("bat_idle", "batting", 60,
         Table(dict(FREE_STAND, bat=((-0.24, 0.10, -0.015), (-0.12, 0.10, -1.0), (0, 1, 0))), [
             (60, dict(FREE_STAND, bat=((-0.24, 0.10, -0.015), (-0.12, 0.10, -1.0), (0, 1, 0))))]),
         dict(mode="bat1", bat_space="body"), post=bat_hand_post(False), loop=True, notes="rest between balls"),
    Clip("batter_run", "batting", 20,
         Table(dict(RUN_BASE, bat=((-0.21, 0.12, 0.10), (0.05, 0.55, -0.83), (-1, 0, 0))), [(20, dict(RUN_BASE))]),
         dict(mode="bat1", bat_space="body", feet="body"), post=bat_hand_post(True), loop=True,
         notes="in place; move the root at about 3.2 m/s"),
]


# ================================================================ bowling
def bowl(name, plantsL, plantsR, keys, base, frames, release, high):
    def post(k, e):
        e["footL"] = steps(plantsL, k, 0.2, high)
        e["footR"] = steps(plantsR, k, 0.2, high)
    return Clip(name, "bowling", frames, Table(base, keys), dict(mode="free"), post=post,
                events={"release": release}, outfit="bowler",
                notes="root motion: runs towards +Y (three.js -Z); release near the origin")


ARM_FWD_L, ARM_BACK_L = (0.17, 0.32, 0.38), (0.19, -0.22, 0.02)
ARM_FWD_R, ARM_BACK_R = (-0.17, 0.32, 0.38), (-0.19, -0.22, 0.02)
BOWL_BASE = dict(hips=(0.0, -3.70, 0.96), yaw=180, pitch=14, roll=0, spine=(6, 0, 0), chest=(4, 0, 0),
                 footL=((0, 0, 0), 180, 0), footR=((0, 0, 0), 180, 0), look=(0.3, 20, 0.5),
                 handL=ARM_FWD_L, handR=ARM_BACK_R, poleL=(0.30, -0.7, -0.2), poleR=(-0.30, -0.7, -0.2))
FAST = bowl(
    "bowl_fast",
    plantsL=[(0, 4, (-0.08, -3.40), 180), (26, 33, (-0.02, 0.30), 168), (45, 50, (-0.45, 2.40), 205)],
    plantsR=[(-6, -2, (0.06, -4.25), 180), (7, 12, (0.06, -2.55), 180), (20, 25, (0.02, -0.95), 92),
             (37, 42, (-0.15, 1.45), 200), (53, 56, (-0.80, 3.25), 205)],
    keys=[
        (4, dict(handL=ARM_BACK_L, handR=ARM_FWD_R)),
        (7, dict(hips=(0.03, -2.85, 0.95), yaw=178, pitch=14)),
        (8, dict(handL=ARM_FWD_L, handR=ARM_BACK_R)),
        (12, dict(hips=(0.03, -2.30, 1.00), yaw=172, pitch=8, poleL=(0.35, -0.6, 0.1), poleR=(-0.4, -0.6, 0.2))),
        (13, dict(handL=(0.05, 0.30, 0.45), handR=(-0.05, 0.30, 0.45))),
        (16, dict(hips=(0.02, -1.65, 1.16), yaw=125, pitch=0, chest=(0, -15, 0), handL=(0.10, 0.30, 0.65), handR=(-0.05, 0.25, 0.50))),
        (18, dict(handR=wm(-170))),
        (20, dict(hips=(0.0, -1.0, 0.95), yaw=95, pitch=-10, spine=(-5, -5, 0), chest=(-6, -15, 0), handL=(0.55, 0.15, 0.85))),
        (21, dict(handR=wm(-140))), (24, dict(handR=wm(-95))),
        (26, dict(hips=(-0.02, -0.22, 0.90), yaw=100, pitch=-6, chest=(-4, -10, 0), handR=wm(-55), handL=(0.55, 0.10, 0.80))),
        (28, dict(handR=wm(-10))),
        (29, dict(hips=(-0.05, 0.02, 0.93), yaw=150, pitch=12, spine=(8, 10, 0), chest=(8, 25, -8), handR=wm(15), handL=(0.30, -0.15, 0.25))),
        (30, dict(handR=wm(45))), (32, dict(handR=wm(100))),
        (33, dict(hips=(-0.10, 0.55, 0.86), yaw=185, pitch=30, spine=(15, 5, 0), chest=(18, 20, -5), handL=(0.15, -0.30, 0.05))),
        (34, dict(handR=wm(150))),
        (37, dict(hips=(-0.17, 1.28, 0.90), yaw=205, pitch=20, spine=(12, 0, 0))),
        (38, dict(handR=(0.25, 0.25, -0.05))),
        (40, dict(chest=(8, 5, 0), handL=(0.2, -0.1, 0.0))),
        (45, dict(hips=(-0.42, 2.20, 0.94), yaw=205, pitch=14)),
        (46, dict(handR=(-0.15, 0.15, 0.0), handL=(0.2, 0.2, 0.1))),
        (56, dict(hips=(-0.82, 3.35, 0.95), yaw=205, pitch=10, spine=(4, 0, 0), chest=(4, 0, 0),
                  handR=(-0.2, 0.1, 0.0), handL=(0.2, 0.0, 0.0))),
    ], base=BOWL_BASE, frames=56, release=29, high=0.4)

SPIN_BASE = dict(BOWL_BASE, hips=(0.02, -2.0, 0.95), pitch=6, handL=(0.2, 0.1, 0.15), handR=(-0.2, 0.1, 0.15))
SPIN = bowl(
    "bowl_spin",
    plantsL=[(9, 13, (-0.06, -1.55), 180), (23, 31, (0.0, 0.15), 170), (41, 46, (-0.35, 1.70), 205)],
    plantsR=[(0, 4, (0.05, -2.30), 180), (18, 24, (0.02, -0.70), 105), (33, 37, (-0.10, 0.95), 195)],
    keys=[
        (9, dict(hips=(0.0, -1.30, 0.96), yaw=178, handL=(0.1, 0.3, 0.40), handR=(-0.1, 0.3, 0.40))),
        (14, dict(hips=(0.0, -1.0, 1.05), yaw=140, handL=(0.05, 0.25, 0.50), handR=(-0.05, 0.25, 0.50))),
        (18, dict(hips=(0.0, -0.62, 0.94), yaw=105, pitch=-4, chest=(-4, -12, 0), handR=wm(-150), handL=(0.5, 0.1, 0.75))),
        (21, dict(handR=wm(-90))),
        (23, dict(hips=(-0.02, -0.05, 0.90), yaw=115, pitch=0, handL=(0.5, 0.05, 0.70))),
        (24, dict(handR=wm(-30))),
        (26, dict(hips=(-0.05, 0.10, 0.92), yaw=160, pitch=12, chest=(8, 20, -5), handR=wm(10), handL=(0.30, -0.15, 0.25))),
        (28, dict(handR=wm(60))),
        (30, dict(hips=(-0.08, 0.40, 0.88), yaw=195, pitch=22, chest=(12, 12, 0), handL=(0.15, -0.25, 0.05))),
        (31, dict(handR=wm(130))),
        (35, dict(handR=(0.25, 0.25, 0.0))),
        (36, dict(hips=(-0.15, 0.95, 0.92), yaw=205, pitch=10, chest=(4, 0, 0))),
        (46, dict(hips=(-0.35, 1.65, 0.94), yaw=205, pitch=8, handR=(-0.2, 0.05, 0.0), handL=(0.2, 0.05, 0.0))),
    ], base=SPIN_BASE, frames=46, release=26, high=0.3)
# run-up loop facing the batter (+Y here, -Z in three.js), so it hands straight into a delivery
BOWLER_RUN_BASE = dict(RUN_BASE, yaw=180, pitch=14)
BOWLER_RUN = Clip("bowler_run", "bowling", 20, Table(BOWLER_RUN_BASE, [(20, dict(BOWLER_RUN_BASE))]),
                  dict(mode="free", feet="body"), post=None, loop=True, outfit="bowler",
                  notes="in place, facing the batter; left foot lands at the start of the loop, like bowl_fast frame 0")
BOWLING = [FAST, SPIN, BOWLER_RUN]


# ================================================================ fielding, keeping, umpiring
GAITS = {  # stride, duty, lift, width, kick, bob, sway
    "run": (0.72, 0.38, 0.22, 0.085, 0.30, 0.035, 0.0),
    "walk": (0.66, 0.62, 0.09, 0.10, 0.0, 0.018, 0.018)}


def gait_post(k, e, n, kind, arms=True):
    ph = (k / n) % 1.0
    stride, duty, lift, width, kick, bob, sway = GAITS[kind]
    for S, v in cycle_feet(ph, stride, duty, lift, width, kick).items():
        e["foot" + S] = v
    x, y, z = e["hips"]
    # lowest at each mid-stance (left at duty/2, right half a cycle later), weight over the stance foot
    e["hips"] = (x + sway * math.cos(2 * math.pi * (ph - duty / 2)), y, z - bob * math.cos(4 * math.pi * (ph - duty / 2)))
    swing = math.sin(2 * math.pi * (ph - duty / 2))
    e["yaw"] = e["yaw"] + (6 if kind == "run" else 4) * swing          # pelvis turns with the forward leg
    p, yw, r = e["chest"]
    e["chest"] = (p, yw - (12 if kind == "run" else 7) * swing, r)    # shoulders turn the other way
    if arms:
        e["handL"], e["handR"] = gait_arms(ph, kind)


def loop_post(kind, n):
    def post(k, e):
        ph = (k / n) % 1.0
        x, y, z = e["hips"]
        if kind in ("run", "walk"):
            gait_post(k, e, n, kind)
        else:
            br = math.sin(2 * math.pi * ph)
            amp = {"idle": (0.012, 0.004), "ready": (0.0, 0.015), "keeper": (0.0, 0.01), "umpire": (0.005, 0.003)}[kind]
            e["hips"] = (x + amp[0] * br, y, z + amp[1] * br)
    return post


FIELD_FLAGS = dict(mode="free")
READY = dict(FREE_STAND, hips=(0, 0.04, 0.72), pitch=28, spine=(14, 0, 0), chest=(6, 0, 0),
             footL=((0.26, 0.0, 0.0), 12, 8), footR=((-0.26, 0.0, 0.0), -12, 8),
             handL=(0.20, 0.33, -0.20), handR=(-0.20, 0.33, -0.20), poleL=(0.55, -0.3, 0.0), poleR=(-0.55, -0.3, 0.0),
             look=(0, -12, 0.4))
SIDE_ON = dict(hips=(0.0, -0.05, 0.90), yaw=-90, pitch=2, chest=(0, -15, 0), handR=(-0.55, -0.20, 0.55),
               handL=(0.55, 0.10, 0.55), footL=((0.0, -0.30, 0.0), -70, 0), footR=((0.0, 0.15, 0.0), -90, 0),
               poleR=(-0.5, -0.3, -0.3), poleL=(0.4, -0.3, -0.2))


def throw_keys(t0):
    return [
        (t0, dict(SIDE_ON)),
        (t0 + 3, dict(footL=((0.02, -0.45, 0.08), -60, 0))),
        (t0 + 5, dict(footL=((0.0, -0.58, 0.0), -55, 0), hips=(0.0, -0.20, 0.88), yaw=-60, chest=(4, 5, 0),
                      handR=(-0.10, 0.10, 0.95))),
        (t0 + 7, dict(hips=(0.0, -0.28, 0.87), yaw=-25, pitch=12, chest=(10, 25, 0), handR=(0.25, 0.40, 0.55),
                      handL=(0.35, -0.15, 0.20))),
        (t0 + 11, dict(yaw=0, pitch=22, handR=(0.25, 0.35, -0.10), handL=(0.20, -0.20, 0.0),
                       footR=((0.0, 0.15, 0.0), -70, 40))),
        (t0 + 22, dict(READY, hips=(0.0, -0.30, 0.82), footL=((0.18, -0.55, 0.0), 10, 0), footR=((-0.18, -0.30, 0.0), -10, 0))),
    ]


PICKUP = Clip("pickup_throw", "fielding", 44, Table(READY, [
    (8, dict(hips=(0, -0.15, 0.62), pitch=55, spine=(25, 0, 0), footL=((0.20, -0.10, 0.0), 10, 0),
             footR=((-0.18, 0.05, 0.0), -10, 10), handR=(-0.10, 0.45, -0.55), handL=(0.15, 0.35, -0.35), _hold=True)),
    (12, dict(hips=(0, -0.15, 0.62), pitch=55, handR=(-0.10, 0.45, -0.55))),
    (18, dict(hips=(0, -0.05, 0.85), yaw=-60, pitch=10, spine=(6, 0, 0), handR=(-0.35, -0.05, 0.40), handL=(0.4, 0.2, 0.4))),
] + throw_keys(22)), FIELD_FLAGS, events={"pickup": 12, "release": 29}, outfit="fielder")

THROW = Clip("throw", "fielding", 30, Table(READY, throw_keys(7)), FIELD_FLAGS, events={"release": 14}, outfit="fielder")

CATCH = Clip("catch_high", "fielding", 40, Table(READY, [
    (8, dict(hips=(0, 0, 0.90), pitch=0, spine=(-4, 0, 0), handL=(0.10, 0.20, 0.75), handR=(-0.10, 0.20, 0.75), look=(0, -3, 4))),
    (14, dict(handL=(0.06, 0.25, 0.98), handR=(-0.06, 0.25, 0.98), look=(0, -0.4, 2.0), poleL=(0.4, -0.2, -0.2), poleR=(-0.4, -0.2, -0.2))),
    (22, dict(handL=(0.06, 0.25, 0.55), handR=(-0.06, 0.25, 0.55), look=(0, -0.5, 1.2))),
    (30, dict(handL=(0.06, 0.25, 0.30), handR=(-0.06, 0.25, 0.30), pitch=6, spine=(6, 0, 0), look=(0, -10, 1.2), _hold=True)),
    (40, dict(handL=(0.06, 0.25, 0.30), handR=(-0.06, 0.25, 0.30))),
]), FIELD_FLAGS, events={"catch": 14}, outfit="fielder")

DIVE = Clip("dive_left", "fielding", 50, Table(READY, [
    (5, dict(hips=(0.15, 0, 0.70), roll=-10, pitch=15)),
    (10, dict(hips=(0.55, -0.05, 0.78), roll=-45, pitch=10, handL=(0.75, 0.20, 0.35), handR=(0.65, 0.30, 0.25),
              footR=((-0.20, 0.0, 0.0), -10, 45), footL=((0.35, 0.0, 0.15), 20, 0))),
    (15, dict(hips=(1.05, -0.08, 0.55), roll=-80, pitch=5, handL=(1.0, 0.0, 0.10), handR=(1.0, 0.10, 0.10),
              footL=((0.35, -0.12, 0.30), 0, 20), footR=((0.25, 0.10, 0.48), 0, 30))),
    (19, dict(hips=(1.30, -0.10, 0.20), roll=-90, pitch=0, handL=(1.05, -0.02, 0.0), handR=(1.05, 0.05, 0.0),
              footL=((0.55, -0.20, 0.08), 0, 25), footR=((0.62, 0.10, 0.26), 0, 25))),
    (26, dict(hips=(1.45, -0.10, 0.17), footL=((0.70, -0.20, 0.08), 0, 25), footR=((0.77, 0.10, 0.26), 0, 25), _hold=True)),
    (50, dict(hips=(1.46, -0.10, 0.17), footL=((0.71, -0.20, 0.08), 0, 25), footR=((0.78, 0.10, 0.26), 0, 25))),
]), FIELD_FLAGS, events={"catch": 18}, outfit="fielder", notes="dive_right = play mirrored")

KEEP = dict(FREE_STAND, hips=(0, 0, 0.48), pitch=25, spine=(15, 0, 0), chest=(5, 0, 0),
            footL=((0.24, 0.0, 0.0), 25, 18), footR=((-0.24, 0.0, 0.0), -25, 18),
            handL=(0.06, 0.42, -0.12), handR=(-0.06, 0.42, -0.12), poleL=(0.6, 0.0, -0.3), poleR=(-0.6, 0.0, -0.3))
KEEPER_TAKE = Clip("keeper_take", "fielding", 36, Table(KEEP, [
    (8, dict(hips=(0, 0, 0.70), pitch=15, handL=(0.06, 0.40, 0.15), handR=(-0.06, 0.40, 0.15))),
    (12, dict(handL=(0.06, 0.38, 0.40), handR=(-0.06, 0.38, 0.40))),
    (18, dict(hips=(0, 0.05, 0.80), handL=(0.06, 0.18, 0.30), handR=(-0.06, 0.18, 0.30), footL=((0.22, 0.0, 0.0), 15, 0),
              footR=((-0.22, 0.0, 0.0), -15, 0))),
    (28, dict(hips=(0, 0, 0.90), pitch=5, spine=(4, 0, 0), handL=(0.10, 0.20, 0.15), handR=(-0.10, 0.20, 0.15), _hold=True)),
    (36, dict(hips=(0, 0, 0.90))),
]), FIELD_FLAGS, events={"catch": 12}, outfit="keeper")

UMP = dict(FREE_STAND, hips=(0, 0, 0.90), pitch=10, spine=(6, 0, 0), footL=((0.16, 0.0, 0.0), 8, 0),
           footR=((-0.16, 0.0, 0.0), -8, 0), handL=(0.05, 0.22, 0.0), handR=(-0.05, 0.22, 0.0),
           poleL=(0.45, -0.3, 0.0), poleR=(-0.45, -0.3, 0.0))
UP = dict(pitch=2, spine=(2, 0, 0))


def signal(name, frames, keys, hold):
    a, b = hold
    seq = [(8, dict(UP)), (a, dict(keys, **UP, _hold=True)), (b, dict(keys, **UP)), (frames, dict(UMP))]
    return Clip(name, "umpire", frames, Table(UMP, seq), FIELD_FLAGS, outfit="umpire")


FOUR = [(8, dict(UP, handR=(-0.60, 0.30, 0.50))), (16, dict(handR=(0.25, 0.45, 0.50))), (24, dict(handR=(-0.60, 0.30, 0.50))),
        (32, dict(handR=(0.25, 0.45, 0.50))), (40, dict(handR=(-0.60, 0.30, 0.50))), (52, dict(UMP)), (60, dict(UMP))]
OTHERS = [
    Clip("field_idle", "fielding", 60, Table(FREE_STAND, [(60, dict(FREE_STAND))]), FIELD_FLAGS,
         post=loop_post("idle", 60), loop=True, outfit="fielder"),
    Clip("field_ready", "fielding", 30, Table(READY, [(30, dict(READY))]), FIELD_FLAGS, post=loop_post("ready", 30),
         loop=True, outfit="fielder"),
    Clip("walk", "fielding", 32, Table(dict(FREE_STAND, pitch=3), [(32, dict(FREE_STAND, pitch=3))]), dict(mode="free", feet="body"),
         post=loop_post("walk", 32), loop=True, outfit="fielder", notes="in place; move the root at about 1.2 m/s"),
    Clip("run", "fielding", 20, Table(RUN_BASE, [(20, dict(RUN_BASE))]), dict(mode="free", feet="body"),
         post=loop_post("run", 20), loop=True, outfit="fielder", notes="in place; move the root at about 3.2 m/s"),
    PICKUP, THROW, CATCH, DIVE,
    Clip("keeper_crouch", "fielding", 60, Table(KEEP, [(60, dict(KEEP))]), FIELD_FLAGS, post=loop_post("keeper", 60),
         loop=True, outfit="keeper"),
    KEEPER_TAKE,
    Clip("umpire_idle", "umpire", 60, Table(UMP, [(60, dict(UMP))]), FIELD_FLAGS, post=loop_post("umpire", 60),
         loop=True, outfit="umpire"),
    signal("umpire_out", 60, dict(handR=(-0.12, 0.12, 1.03), poleR=(-0.5, 0.0, 0.3)), (12, 44)),
    Clip("umpire_four", "umpire", 60, Table(UMP, FOUR), FIELD_FLAGS, outfit="umpire"),
    signal("umpire_six", 54, dict(handL=(0.16, 0.10, 1.03), handR=(-0.16, 0.10, 1.03)), (12, 40)),
    signal("umpire_wide", 54, dict(handL=(0.73, 0.05, 0.50), handR=(-0.73, 0.05, 0.50), poleL=(0.5, -0.3, 0.0),
                                   poleR=(-0.5, -0.3, 0.0)), (12, 40)),
    signal("umpire_noball", 50, dict(handR=(-0.73, 0.05, 0.50), poleR=(-0.5, -0.3, 0.0)), (12, 36)),
]

BOWLER_RUN.post = loop_post("run", 20)      # loop_post is defined after the bowling section
CLIPS = BATTING + BOWLING + OTHERS
