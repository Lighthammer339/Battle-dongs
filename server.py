#!/usr/bin/env python3
"""BATTLE DONGS - Pocket Tanks style artillery with dick tanks.

Pure standard library: serves ./public over HTTP and speaks WebSocket on the
same port. Run:  python server.py   (PORT env var overrides 8080)

The server runs every shot's physics and sends clients a replay (projectile
paths + timed events) to animate. Powers are defined in powers.txt.
"""
import asyncio
import base64
import configparser
import hashlib
import json
import math
import mimetypes
import os
import random
import struct
import time
import traceback

HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", 8080))
ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
POWERS_FILE = os.path.join(ROOT, "powers.txt")
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

MAX_PLAYERS = 4
TURN_CHOICES = (30, 60, 90)    # seconds to aim; on timeout the current aim fires
WEAPON_CHOICES = (5, 10, 15)   # weapons per player
DRAFT_SEC = 20                 # seconds per draft pick
MOVES = 4                      # tank moves per game
MOVE_PX = 30                   # how far one move drives
CLIMB = 6                      # steepest step a tank can drive up, px

# physics (world is WW x WH pixels, y points UP from the bottom)
WW, WH = 640, 300
G = 200.0                      # gravity px/s^2
VMAX = 410.0                   # launch speed at power 100
DT = 1 / 120
SAMPLE = 4                     # record a path point every 4 steps (30 per second)
MAX_SHOT_SEC = 25
TEABAG_GRAVITY = 0.4    # teabag hops float down slowly (multiplier of G)
TANK_R = 8                     # hitbox radius around the tank's middle
PIVOT = 12                     # barrel pivot height above the ground
BARREL = 14
AIM_MIN, AIM_MAX = -45, 225   # worms-style aim: up to 45 degrees below the horizon on either side
CHARGE_SEC = 1.6               # seconds to charge from 0 to full power (clients use the same)
HP_MAX = 150                   # health; hit 0 and your dong dies (blast + gravestone) and is out of the game
KILL_BONUS = 25                # score bonus for finishing someone off
CRATE_CHANCE = 0.4             # chance a power-up crate parachutes in at the start of a turn
CRATE_MAX = 3                  # most crates lying around at once
CRATE_KINDS = (("health", 4), ("ammo", 4), ("viagra", 3))
HEAL = 40                      # health crate
VIAGRA_MULT = 1.5              # damage multiplier for the next shot after a viagra crate

BOT_NAMES = ["Richard", "Big Johnson", "Willy", "Peter", "Moby", "Sir Longfellow",
             "Wang Chung", "Little Jimmy", "Captain Wood", "Shlongo"]


def r1(v):
    return round(v, 1)


def clamp(v, a, b):
    return a if v < a else b if v > b else v


# --------------------------------------------------------------------------- powers.txt

TYPES = ("shot", "spread", "stream", "split", "cluster", "roller", "bouncer", "jackhammer", "teabag",
         "digger", "dirt", "napalm", "seeker", "airstrike", "teleport", "shove")
LOOKS = ("glob", "ball", "nuts", "drop", "pearl", "rocket", "dirt", "probe")
NUM_KEYS = {   # key: (default, min, max)
    "damage": (30, 0, 500), "radius": (16, 0, 120), "count": (1, 1, 30), "spread": (6, 0, 90),
    "delay": (0.15, 0.02, 2), "jitter": (0, 0, 20), "reach": (100, 0, 640), "speed": (1, 0.2, 4),
    "gravity": (1, 0, 4), "frag_damage": (10, 0, 500), "frag_radius": (8, 0, 120),
    "frag_speed": (150, 10, 600), "height": (40, 1, 250), "weight": (1, 0, 100), "size": (3, 1, 16),
}
STR_KEYS = {"type": "shot", "color": "#fffbe8", "look": "glob", "shape": "ball", "carve": "yes", "direction": "push",
            "description": ""}
FALLBACK = [{**{k: v[0] for k, v in NUM_KEYS.items()}, **STR_KEYS, "name": "Single Squirt", "carve": True}]


def load_powers():
    """Read powers.txt. Bad entries are reported and skipped, never fatal."""
    cp = configparser.ConfigParser(interpolation=None, comment_prefixes=("#", ";"),
                                   inline_comment_prefixes=None, strict=False)
    try:
        with open(POWERS_FILE, encoding="utf-8") as f:
            cp.read_file(f)
    except Exception as e:
        print("powers.txt could not be read, using a single default power:", e)
        return FALLBACK
    out = []
    for name in cp.sections():
        sec = cp[name]
        p = {"name": name.strip()[:28]}
        bad = False
        for k, (dflt, lo, hi) in NUM_KEYS.items():
            try:
                p[k] = clamp(float(sec.get(k, dflt)), lo, hi)
            except ValueError:
                print(f"powers.txt [{name}]: '{k}' should be a number, using {dflt}")
                p[k] = dflt
        for k, dflt in STR_KEYS.items():
            p[k] = sec.get(k, dflt).strip()
        for k in sec:
            if k not in NUM_KEYS and k not in STR_KEYS:
                print(f"powers.txt [{name}]: unknown key '{k}' ignored")
        p["type"] = p["type"].lower()
        if p["type"] not in TYPES:
            print(f"powers.txt [{name}]: unknown type '{p['type']}', skipped")
            bad = True
        if p["look"] not in LOOKS:
            p["look"] = "glob"
        p["carve"] = p["carve"].lower() not in ("no", "false", "0", "off")
        p["direction"] = "pull" if p["direction"].lower() in ("pull", "suck", "in") else "push"
        p["count"] = int(p["count"])
        p["description"] = p["description"][:160]
        if not bad:
            out.append(p)
    return out or FALLBACK


# --------------------------------------------------------------------------- terrain

def make_terrain(spawn_xs):
    rnd = random.random
    base = 80 + rnd() * 50
    waves = [(30 + rnd() * 45, 0.8 + rnd() * 1.4), (10 + rnd() * 25, 2.5 + rnd() * 3), (2 + rnd() * 5, 8 + rnd() * 9)]
    phases = [rnd() * 6.283 for _ in waves]
    H = []
    for x in range(WW):
        u = x / WW * 2 * math.pi
        h = base + sum(a * math.sin(u * f + ph) for (a, f), ph in zip(waves, phases))
        H.append(clamp(h, 20, WH - 90))
    # flat-ish pads where the tanks start
    for sx in spawn_xs:
        lo, hi = max(0, int(sx) - 10), min(WW, int(sx) + 11)
        avg = sum(H[lo:hi]) / (hi - lo)
        for x in range(lo, hi):
            H[x] = avg
    return H


def carve(H, cx, cy, r):
    """Remove a circle of ground; dirt above the hole drops down (heightmap collapse)."""
    for x in range(max(0, int(cx - r)), min(WW, int(cx + r) + 1)):
        dx = x + 0.5 - cx
        if abs(dx) >= r:
            continue
        h = math.sqrt(r * r - dx * dx)
        lo, hi = max(cy - h, 0), min(cy + h, H[x])
        if hi > lo:
            H[x] -= hi - lo


def add_dirt(H, cx, cy, r, shape="ball", height=40):
    """Add dirt: a ball (only the part sticking out of the ground piles up) or a wall."""
    for x in range(max(0, int(cx - r)), min(WW, int(cx + r) + 1)):
        dx = x + 0.5 - cx
        if abs(dx) >= r:
            continue
        if shape == "wall":
            add = height
        else:
            h = math.sqrt(r * r - dx * dx)
            lo, hi = cy - h, cy + h
            buried = max(0, min(hi, H[x]) - max(lo, 0))
            add = 2 * h - buried
        H[x] = min(WH - 10, H[x] + max(0, add))


def ground_at(H, x):
    xi = int(clamp(x, 0, WW - 1))
    return max(H[max(0, xi - 4):min(WW, xi + 5)])


# --------------------------------------------------------------------------- shot simulation

class Shot:
    """Simulates one turn's shot and records a replay for the clients."""

    def __init__(self, game, me, spec, angle, power, mult=1.0):
        self.game, self.me, self.spec = game, me, spec
        self.mult = mult
        self.angle, self.power = angle, power
        self.H = game.H
        self.t = 0.0
        self.live, self.done, self.events, self.pending = [], [], [], []
        self.nid = 0

    def emit(self, k, **kw):
        kw["k"] = k
        kw["t"] = round(self.t, 3)
        self.events.append(kw)

    def later(self, delay, fn):
        self.pending.append((self.t + delay, fn))

    def run(self):
        self.launch()
        while (self.live or self.pending) and self.t < MAX_SHOT_SEC:
            if self.pending:
                due = [p for p in self.pending if p[0] <= self.t]
                if due:
                    self.pending = [p for p in self.pending if p[0] > self.t]
                    for _, fn in due:
                        fn()
            for p in list(self.live):
                if p["alive"]:
                    self.step(p)
            self.t += DT
        for p in list(self.live):
            self.finish(p)
        return {"projs": self.done, "events": self.events, "dur": round(self.t, 2)}

    # ---- launching
    def fire(self, spec, ang, power):
        a = math.radians(ang)
        sp = clamp(power, 0, 100) / 100 * VMAX * spec["speed"]
        x, y = self.game.muzzle(self.me, ang)
        self.spawn(spec, x, y, math.cos(a) * sp, math.sin(a) * sp)

    def launch(self):
        s = self.spec
        typ, n = s["type"], s["count"]
        if typ == "spread":
            for i in range(n):
                self.fire(s, self.angle + (i - (n - 1) / 2) * s["spread"], self.power)
        elif typ == "stream":
            j = s["jitter"]
            for i in range(n):
                def go(i=i):
                    self.fire(s, self.angle + random.uniform(-j, j), self.power + random.uniform(-j, j))
                if i == 0:
                    go()
                else:
                    self.later(i * s["delay"], go)
        else:
            self.fire(s, self.angle, self.power)

    def spawn(self, spec, x, y, vx, vy):
        self.nid += 1
        p = {"spec": spec, "x": x, "y": y, "vx": vx, "vy": vy, "t0": self.t, "age": 0.0, "n": 0,
             "pts": [[r1(x), r1(y)]], "mode": "fly", "alive": True, "left": spec["count"], "dist": 0.0, "dir": 1}
        self.live.append(p)
        return p

    def finish(self, p):
        if not p["alive"]:
            return
        p["alive"] = False
        p["pts"].append([r1(p["x"]), r1(p["y"])])
        self.live.remove(p)
        s = p["spec"]
        self.done.append({"t0": round(p["t0"], 3), "te": round(self.t, 3), "pts": p["pts"],
                          "c": s["color"], "s": s["size"], "look": s["look"]})

    @staticmethod
    def frag_spec(s, look=None):
        return dict(s, type="shot", radius=s["frag_radius"], damage=s["frag_damage"],
                    size=max(2, s["size"] - 1), gravity=1.0, speed=1.0, look=look or s["look"])

    # ---- per-step physics
    def step(self, p):
        s = p["spec"]
        if p["mode"] == "roll":
            self.roll(p)
        else:
            if s["type"] == "seeker" and p["age"] > 0.35:
                self.steer(p)
            p["vy"] -= G * (TEABAG_GRAVITY if p["mode"] == "hop" else s["gravity"]) * DT
            p["x"] += p["vx"] * DT
            p["y"] += p["vy"] * DT
            p["age"] += DT
            if s["type"] == "split" and p["vy"] <= 0 and p["age"] > 0.1:
                self.split(p)
                return
            self.collide(p)
        if p["alive"]:
            p["n"] += 1
            if p["n"] % SAMPLE == 0:
                p["pts"].append([r1(p["x"]), r1(p["y"])])

    def collide(self, p):
        x, y = p["x"], p["y"]
        for c in list(self.game.crates):      # shoot a crate to grab it
            if math.hypot(c["x"] - x, c["y"] + 4 - y) < 7:
                self.game.collect(c, self.me, self)
        rising_hop = p["mode"] == "hop" and p["vy"] > 0     # don't re-hit the tank we just left
        tank = None if rising_hop else self.game.tank_at(x, y, skip=self.me if p["age"] < 0.25 else None)
        if tank:
            self.impact(p, tank)
        elif 0 <= x < WW and y <= self.H[int(x)]:
            # walk back along this step to the point where it actually went in. Snapping straight up to the
            # column's surface made shells that hit the side of a hill explode on top of it instead.
            px, py = x - p["vx"] * DT, y - p["vy"] * DT
            for k in range(1, 9):
                f = k / 8
                qx, qy = px + (x - px) * f, py + (y - py) * f
                if 0 <= qx < WW and qy <= self.H[int(qx)]:
                    x, y = qx, qy
                    break
            p["x"], p["y"] = x, y
            self.impact(p, None)
        elif x < -40 or x > WW + 40 or y < -40 or p["age"] > 14:
            self.finish(p)

    def steer(self, p):
        best, bd = None, p["spec"]["reach"]
        for tk in self.game.active():
            if tk is self.me:
                continue
            d = math.hypot(tk["x"] - p["x"], tk["y"] + 6 - p["y"])
            if d < bd:
                best, bd = tk, d
        if not best:
            return
        cur = math.atan2(p["vy"], p["vx"])
        want = math.atan2(best["y"] + 6 - p["y"], best["x"] - p["x"])
        diff = (want - cur + math.pi) % (2 * math.pi) - math.pi
        turn = clamp(diff, -5 * DT, 5 * DT)
        sp = max(120, math.hypot(p["vx"], p["vy"]))
        p["vx"], p["vy"] = math.cos(cur + turn) * sp, math.sin(cur + turn) * sp + G * DT  # cancels gravity while locked

    def split(self, p):
        s = p["spec"]
        child = dict(s, type="shot")
        cur = math.atan2(p["vy"], p["vx"])
        sp = math.hypot(p["vx"], p["vy"])
        n = s["count"]
        self.emit("pop", x=r1(p["x"]), y=r1(p["y"]), c=s["color"])
        for i in range(n):
            a = cur + math.radians((i - (n - 1) / 2) * s["spread"])
            v = sp * random.uniform(0.92, 1.08)
            self.spawn(child, p["x"], p["y"], math.cos(a) * v, math.sin(a) * v)
        self.finish(p)

    def roll(self, p):
        s = p["spec"]
        nx = p["x"] + p["dir"] * 75 * DT
        if nx < 0 or nx >= WW:
            self.finish(p)          # rolled off the edge of the world
            return
        h = self.H[int(nx)]
        if h > p["y"] + 0.35:       # uphill wall: stop and blow
            self.explode(p["x"], p["y"], s["radius"], s["damage"], s["color"], s["carve"])
            self.finish(p)
            return
        p["x"], p["y"] = nx, h
        p["dist"] += 75 * DT
        p["age"] += DT
        if self.game.tank_at(p["x"], p["y"]) or p["dist"] >= s["reach"]:
            self.explode(p["x"], p["y"], s["radius"], s["damage"], s["color"], s["carve"])
            self.finish(p)

    def bounce(self, p):
        x = int(clamp(p["x"], 2, WW - 3))
        slope = (self.H[x + 2] - self.H[x - 2]) / 4
        L = math.hypot(slope, 1)
        nx, ny = -slope / L, 1 / L
        dot = p["vx"] * nx + p["vy"] * ny
        if dot < 0:
            p["vx"] -= 2 * dot * nx
            p["vy"] -= 2 * dot * ny
        p["vx"] *= 0.75
        p["vy"] *= 0.75
        p["y"] = self.H[x] + 1.5

    # ---- what happens on impact
    def impact(self, p, tank):
        s = p["spec"]
        typ, x, y = s["type"], p["x"], p["y"]
        if typ == "roller" and not tank:
            H = self.H
            xi = int(clamp(x, 3, WW - 4))
            diff = H[xi + 3] - H[xi - 3]
            p["dir"] = (1 if p["vx"] >= 0 else -1) if abs(diff) < 0.5 else (1 if diff < 0 else -1)
            p["mode"] = "roll"
            return
        if typ == "bouncer" and not tank and p["left"] > 0:
            p["left"] -= 1
            if s["frag_radius"] > 0 or s["frag_damage"] > 0:
                self.explode(x, y, s["frag_radius"], s["frag_damage"], s["color"], s["carve"])
            self.emit("bounce", x=r1(x), y=r1(y))
            self.bounce(p)
            if math.hypot(p["vx"], p["vy"]) > 30:
                return
        if typ == "jackhammer" and p["left"] > 0:
            self.explode(x, y, s["radius"], s["damage"], s["color"], s["carve"])
            p["left"] -= 1
            p["vx"] *= 0.1
            p["vy"] = s["frag_speed"] * (0.55 + 0.45 * p["left"] / max(1, s["count"]))
            p["x"] = clamp(x, 0, WW - 1)
            p["y"] = max(y, self.H[int(p["x"])]) + 1
            return

        if typ == "shove":
            if s["direction"] == "pull":
                self.shove(x, y, s, -1)
                self.explode(x, y, s["radius"], s["damage"], s["color"], s["carve"])
            else:
                self.explode(x, y, s["radius"], s["damage"], s["color"], s["carve"])
                self.shove(x, y, s, 1)
            self.finish(p)
            return

        if typ == "teabag":
            # donkey-bomb style: slam, then float straight back up over the same spot and slam again
            if p["mode"] != "hop":
                p["hx"] = clamp(x, 0, WW - 1)
            self.explode(p["hx"], y, s["radius"], s["damage"], s["color"], s["carve"])
            p["left"] -= 1
            if p["left"] > 0:
                p["mode"] = "hop"
                p["x"], p["vx"] = p["hx"], 0.0
                p["y"] = max(y, self.H[int(p["hx"])]) + 1
                p["vy"] = s["frag_speed"]
                self.emit("bounce", x=r1(p["x"]), y=r1(p["y"]))
                return
            self.finish(p)
            return

        if typ == "digger" and tank and s["damage"] > 0:
            self.explode(x, y, s["frag_radius"], s["damage"], s["color"], s["carve"])
        elif typ == "digger":
            self.dig(p)
        elif typ == "dirt":
            add_dirt(self.H, x, y, s["radius"], s["shape"], s["height"])
            self.emit("dirt", x=r1(x), y=r1(y), r=s["radius"], shape=s["shape"], h=s["height"], c=s["color"])
            self.game.settle()
        elif typ == "napalm":
            self.napalm(x, s)
        elif typ == "cluster":
            self.explode(x, y, s["radius"], s["damage"], s["color"], s["carve"])
            frag = self.frag_spec(s)
            for _ in range(s["count"]):
                a = math.radians(90 + random.uniform(-s["spread"], s["spread"]))
                v = s["frag_speed"] * random.uniform(0.6, 1.0)
                self.spawn(frag, x, self.H[int(clamp(x, 0, WW - 1))] + 3, math.cos(a) * v, math.sin(a) * v)
        elif typ == "airstrike":
            self.emit("mark", x=r1(x), y=r1(y), c=s["color"])
            frag = self.frag_spec(s)
            n, w = s["count"], s["reach"]
            for i in range(n):
                bx = x + ((i - (n - 1) / 2) * (2 * w / max(1, n - 1)) if n > 1 else 0) + random.uniform(-3, 3)
                self.later(0.7 + i * 0.09, lambda bx=bx: self.spawn(frag, bx, WH + 20, random.uniform(-8, 8), -80))
        elif typ == "teleport":
            me = self.me
            me["x"] = clamp(x, 10, WW - 10)
            self.game.settle()
            self.emit("tp", id=me["id"], x=r1(me["x"]), y=r1(me["y"]))
        else:
            self.explode(x, y, s["radius"], s["damage"], s["color"], s["carve"])
        self.finish(p)

    def explode(self, x, y, r, dmg, color, do_carve=True):
        self.emit("boom", x=r1(x), y=r1(y), r=r, c=color, carve=bool(do_carve))
        if do_carve and r > 0:
            carve(self.H, x, y, r)
        for c in list(self.game.crates):      # blowing a crate up also gets you what's inside
            if math.hypot(c["x"] - x, c["y"] + 4 - y) < r + 5:
                self.game.collect(c, self.me, self)
        if dmg > 0:
            for tk in self.game.active():
                d = math.hypot(x - tk["x"], y - (tk["y"] + 6))
                reach = r + TANK_R
                if d < reach:
                    frac = 1 - max(0, d - 6) / max(1, reach - 6)
                    self.hurt(tk, round(dmg * (0.3 + 0.7 * clamp(frac, 0, 1))))
        self.game.settle()

    def shove(self, x, y, s, sign):
        moved = False
        for tk in self.game.active():
            d = math.hypot(tk["x"] - x, tk["y"] + 6 - y)
            if d >= s["reach"]:
                continue
            amt = s["frag_speed"] * (1 - d / s["reach"])
            side = (1 if tk["x"] >= x else -1) if abs(tk["x"] - x) > 0.5 else random.choice((-1, 1))
            if sign < 0:
                amt = min(amt, max(0.0, abs(tk["x"] - x) - 2))
            nx = clamp(tk["x"] + side * sign * amt, 10, WW - 10)
            if abs(nx - tk["x"]) < 1:
                continue
            tk["x"] = nx
            moved = True
        if moved:
            self.game.settle()
            for tk in self.game.active():
                self.emit("shove", id=tk["id"], x=r1(tk["x"]), y=r1(tk["y"]))

    def hurt(self, tk, amt):
        if amt <= 0 or tk.get("dead"):
            return
        own = tk is self.me
        if not own:
            amt = round(amt * self.mult)
        self.me["score"] += -amt if own else amt
        tk["taken"] += amt
        self.emit("dmg", id=tk["id"], by=self.me["id"], n=amt, own=own)
        if tk["taken"] >= HP_MAX:
            tk["dead"] = True
            bonus = 0 if own else KILL_BONUS
            self.me["score"] += bonus
            self.emit("die", id=tk["id"], by=self.me["id"], bonus=bonus)
            x, y = tk["x"], tk["y"] + 4
            self.later(0.45, lambda: self.explode(x, y, 18, 20, "#fffbe8", True))   # goes out with a bang

    def dig(self, p):
        s = p["spec"]
        sp = math.hypot(p["vx"], p["vy"]) or 1
        dx, dy = p["vx"] / sp, p["vy"] / sp
        if dy > -0.3:          # always burrow at least somewhat downward
            dy = -0.3
            L = math.hypot(dx, dy)
            dx, dy = dx / L, dy / L
        x0, y0, L = p["x"], p["y"], s["reach"]
        d = 0
        while d <= L:
            carve(self.H, x0 + dx * d, y0 + dy * d, s["radius"])
            d += 2
        x1, y1 = x0 + dx * L, y0 + dy * L
        self.emit("dig", x=r1(x0), y=r1(y0), x2=r1(x1), y2=r1(y1), r=s["radius"])
        p["x"], p["y"] = x1, y1
        if s["damage"] > 0:
            self.explode(x1, y1, s["frag_radius"], s["damage"], s["color"], s["carve"])
        else:
            self.game.settle()

    def napalm(self, x, s):
        H = self.H
        x0 = int(clamp(x, 0, WW - 1))
        ends = []
        for d in (-1, 1):
            cx, dist = x0, 0
            while dist < s["reach"]:
                nx = cx + d
                if nx < 0 or nx >= WW or H[nx] > H[cx] + 1.0:
                    break
                cx, dist = nx, dist + 1
            ends.append(cx)
        flames = list(range(ends[0], ends[1] + 1, 4))
        self.emit("fire", xs=flames, c=s["color"])
        for tk in self.game.active():
            n = sum(1 for fx in flames if abs(fx - tk["x"]) <= s["radius"] + 6 and abs(H[fx] - tk["y"]) < 20)
            self.hurt(tk, round(n * s["damage"]))


# --------------------------------------------------------------------------- game

class Game:
    def __init__(self, room):
        self.room = room
        self.powers = load_powers()
        self.by_name = {p["name"]: p for p in self.powers}
        self.players = {}
        self.turn_n = 0
        self.crates, self.crate_n = [], 0
        self.current = None
        self.phase = "draft"
        self.fire_req = None
        self.fired = asyncio.Event()
        self.pick_evt = asyncio.Event()
        self.pick_idx = None
        self.drafter = None
        self.pool, self.taken = [], []
        self.task = None
        self.paused_by = None              # name of whoever hit ESC, or None
        self.unpaused = asyncio.Event()
        self.unpaused.set()
        self.clock = None                  # (deadline-ish) seconds left on the running turn/draft timer

        members = list(room.members)
        n = len(members)
        xs = []
        for i in range(n):
            xs.append(clamp(WW * (i + 0.5) / n + random.uniform(-30, 30), 30, WW - 30))
        random.shuffle(members)
        self.H = make_terrain(xs)
        for m, x in zip(members, xs):
            self.players[m["id"]] = {
                "id": m["id"], "name": m["name"], "color": m["color"], "bot": m["bot"],
                "x": x, "y": 0.0, "score": 0, "taken": 0, "dead": False, "boost": False, "moves": MOVES, "inv": [], "gone": False,
                "angle": 45 if x < WW / 2 else 135, "power": 60, "w": 0,
            }
        self.order = list(self.players.values())
        self.settle()

    # ---- helpers
    def active(self):
        return [p for p in self.players.values() if not p["gone"] and not p["dead"]]

    def settle(self):
        for p in self.players.values():
            p["y"] = ground_at(self.H, p["x"])
        for c in self.crates:
            c["y"] = self.H[int(clamp(c["x"], 0, WW - 1))]

    # ---- power-up crates
    def maybe_crate(self):
        if len(self.crates) >= CRATE_MAX or random.random() > CRATE_CHANCE:
            return
        for _ in range(30):
            x = random.uniform(20, WW - 20)
            if all(abs(x - p["x"]) > 28 for p in self.active()) and all(abs(x - c["x"]) > 20 for c in self.crates):
                break
        else:
            return
        self.crate_n += 1
        kind = random.choices([k for k, _ in CRATE_KINDS], [w for _, w in CRATE_KINDS])[0]
        c = {"id": self.crate_n, "x": r1(x), "y": r1(self.H[int(x)]), "kind": kind}
        self.crates.append(c)
        self.room.broadcast({"t": "crate", "crate": c})

    def collect(self, c, p, shot=None):
        if c not in self.crates or p.get("dead"):
            return
        self.crates.remove(c)
        info = {}
        if c["kind"] == "health":
            heal = min(HEAL, p["taken"])
            p["taken"] -= heal
            info["n"] = heal
        elif c["kind"] == "ammo":
            pool = [q for q in self.powers if q.get("weight", 1) > 0] or self.powers
            name = random.choices([q["name"] for q in pool], [max(0.01, q.get("weight", 1)) for q in pool])[0]
            p["inv"].append(name)
            info["name"] = name
        else:
            p["boost"] = True
        ev = {"cid": c["id"], "id": p["id"], "kind": c["kind"], **info}
        if shot:
            shot.emit("pick", **ev)
        else:
            self.room.broadcast({"t": "picked", **ev, "state": self.state()})

    def tank_at(self, x, y, skip=None):
        for p in self.active():
            if p is not skip and math.hypot(x - p["x"], y - (p["y"] + 6)) < TANK_R:
                return p
        return None

    def muzzle(self, p, ang):
        a = math.radians(ang)
        return p["x"] + math.cos(a) * BARREL, p["y"] + PIVOT + math.sin(a) * BARREL

    def state(self):
        return {
            "tanks": [{k: (r1(p[k]) if k in ("x", "y") else p[k])
                       for k in ("id", "x", "y", "score", "taken", "dead", "boost", "moves", "inv", "gone", "angle", "power")}
                      for p in self.players.values()],
            "crates": self.crates,
            "H": [r1(h) for h in self.H],
        }

    # ---- pause (ESC menu)
    def set_pause(self, pid, on):
        p = self.players.get(pid)
        if not p or p["gone"] or p["bot"] or self.phase == "over":
            return
        if on and not self.paused_by:
            self.paused_by = p["name"]
            self.unpaused.clear()
        elif not on and self.paused_by:
            self.paused_by = None
            self.unpaused.set()
        else:
            return
        self.room.broadcast({"t": "pause", "on": bool(self.paused_by), "by": p["name"], "id": pid,
                             "ms": int(self.clock * 1000) if self.clock is not None else None})

    async def gate(self):
        """Hold here while the game is paused."""
        await self.unpaused.wait()

    async def countdown(self, evt, secs):
        """Like wait_for(evt.wait(), secs) but the clock stops while paused."""
        self.clock = secs
        try:
            while self.clock > 0 and not evt.is_set():
                if self.paused_by:
                    await self.unpaused.wait()
                    continue
                t0 = time.monotonic()
                try:
                    await asyncio.wait_for(evt.wait(), timeout=min(self.clock, 0.2))
                except asyncio.TimeoutError:
                    pass
                if not self.paused_by:
                    self.clock -= time.monotonic() - t0
        finally:
            self.clock = None

    # ---- flow
    async def run(self):
        room = self.room
        try:
            room.broadcast({"t": "gameStart", "turnSec": room.turn_sec, "W": WW, "H": WH,
                            "physics": {"g": G, "vmax": VMAX, "pivot": PIVOT, "barrel": BARREL,
                                        "aimMin": AIM_MIN, "aimMax": AIM_MAX, "charge": CHARGE_SEC},
                            "hp": HP_MAX,
                            "players": [{k: p[k] for k in ("id", "name", "color", "bot")} for p in self.order],
                            "powers": self.powers, "draft": room.draft, "state": self.state()})
            await asyncio.sleep(1.0)
            await self.draft()
            self.phase = "battle"
            start = random.randrange(len(self.order))
            k = start
            while True:
                left = [p for p in self.active() if p["inv"]]
                if not left or len(self.active()) < 2:
                    break
                p = self.order[k % len(self.order)]
                k += 1
                if p["gone"] or p["dead"] or not p["inv"]:
                    continue
                await self.gate()
                await self.take_turn(p)
            self.phase = "over"
            self.finish()
        except asyncio.CancelledError:
            pass
        except Exception:
            # never leave a room stuck mid-game: log it and end the match
            traceback.print_exc()
            self.finish()

    async def take_turn(self, p):
        self.turn_n += 1
        self.maybe_crate()
        self.current = p["id"]
        self.fire_req = None
        self.fired.clear()
        p["w"] = min(p["w"], len(p["inv"]) - 1)
        self.room.broadcast({"t": "turn", "id": p["id"], "n": self.turn_n,
                             "ms": int(self.room.turn_sec * 1000), "state": self.state()})
        if p["bot"]:
            await self.bot_turn(p)
        else:
            await self.countdown(self.fired, self.room.turn_sec)
        if p["gone"] or not p["inv"]:
            self.current = None
            return
        req = self.fire_req or {"angle": p["angle"], "power": p["power"], "w": p["w"]}
        self.current = None
        w = int(clamp(req["w"], 0, len(p["inv"]) - 1))
        name = p["inv"].pop(w)
        p["angle"], p["power"] = req["angle"], req["power"]
        p["w"] = 0
        spec = self.by_name.get(name, FALLBACK[0])
        mult = VIAGRA_MULT if p["boost"] else 1.0
        p["boost"] = False
        res = Shot(self, p, spec, req["angle"], req["power"], mult).run()
        self.room.broadcast({"t": "shot", "id": p["id"], "weapon": name, "angle": req["angle"],
                             "power": req["power"], **res, "after": self.state()})
        await asyncio.sleep(res["dur"] + 1.6)

    async def draft(self):
        room = self.room
        n_each = room.weapons
        ps = self.order
        total = n_each * len(ps)
        self.pool = self.make_pool(total + (2 * len(ps) if room.draft else 0))
        if not room.draft:
            for i, name in enumerate(self.pool[:total]):
                ps[i % len(ps)]["inv"].append(name)
            room.broadcast({"t": "draft", "pool": self.pool[:total], "taken": [ps[i % len(ps)]["id"] for i in range(total)],
                            "turn": None, "ms": 0, "dealt": True})
            await asyncio.sleep(2.5)
            return
        self.taken = [None] * len(self.pool)
        for k in range(total):
            p = ps[k % len(ps)]
            self.drafter = p["id"]
            self.pick_idx = None
            self.pick_evt.clear()
            room.broadcast({"t": "draft", "pool": self.pool, "taken": self.taken, "turn": p["id"],
                            "ms": DRAFT_SEC * 1000, "pick": k + 1, "total": total})
            if p["bot"]:
                await asyncio.sleep(random.uniform(0.5, 1.1))
                await self.gate()
                idx = self.bot_pick()
            elif p["gone"]:
                idx = None
            else:
                await self.countdown(self.pick_evt, DRAFT_SEC)
                idx = self.pick_idx
            free = [i for i, t in enumerate(self.taken) if t is None]
            if idx is None or idx not in free:
                idx = random.choice(free)
            self.taken[idx] = p["id"]
            p["inv"].append(self.pool[idx])
        self.drafter = None
        room.broadcast({"t": "draft", "pool": self.pool, "taken": self.taken, "turn": None, "ms": 0})
        await asyncio.sleep(1.5)

    def make_pool(self, n):
        elig = [p for p in self.powers if p["weight"] > 0] or FALLBACK
        pool, bag = [], []
        while len(pool) < n:
            if not bag:
                bag = list(elig)
            pick = random.choices(bag, weights=[max(0.01, p["weight"]) for p in bag])[0]
            bag.remove(pick)
            pool.append(pick["name"])
        return pool

    def pick(self, pid, idx):
        if self.drafter != pid or not isinstance(idx, int) or not 0 <= idx < len(self.taken):
            return
        if self.taken[idx] is None:
            self.pick_idx = idx
            self.pick_evt.set()

    def aim(self, pid, a):
        p = self.players.get(pid)
        if not p or self.current != pid or self.fire_req:
            return
        try:
            p["angle"] = clamp(float(a.get("angle", p["angle"])), AIM_MIN, AIM_MAX)
            p["power"] = clamp(float(a.get("power", p["power"])), 0, 100)
            p["w"] = int(clamp(int(a.get("w", p["w"])), 0, max(0, len(p["inv"]) - 1)))
        except (TypeError, ValueError):
            return
        self.room.broadcast({"t": "aim", "id": pid, "angle": p["angle"], "power": p["power"], "w": p["w"],
                             "c": bool(a.get("c"))})

    def fire(self, pid, a):
        p = self.players.get(pid)
        if not p or self.current != pid or self.fire_req or not isinstance(a, dict):
            return
        try:
            self.fire_req = {"angle": clamp(float(a.get("angle")), AIM_MIN, AIM_MAX),
                             "power": clamp(float(a.get("power")), 0, 100),
                             "w": int(a.get("w", 0))}
        except (TypeError, ValueError):
            return
        self.fired.set()

    def move(self, pid, d):
        p = self.players.get(pid)
        if not p or self.current != pid or self.fire_req or p["moves"] <= 0 or d not in (-1, 1):
            return
        x0, x = p["x"], p["x"]
        others = [o["x"] for o in self.active() if o is not p]
        for _ in range(MOVE_PX):
            nx = x + d
            if nx < 10 or nx > WW - 10 or any(abs(nx - ox) < 20 for ox in others):
                break
            if ground_at(self.H, nx) - ground_at(self.H, x) > CLIMB:
                break
            x = nx
        if x == x0:
            return
        p["x"] = x
        p["moves"] -= 1
        self.settle()
        self.room.broadcast({"t": "moved", "id": pid, "x": r1(x), "y": r1(p["y"]), "moves": p["moves"]})
        lo, hi = min(x0, x) - 10, max(x0, x) + 10
        for c in list(self.crates):
            if lo <= c["x"] <= hi:
                self.collect(c, p)

    def forfeit(self, pid):
        p = self.players.get(pid)
        if p and not p["gone"]:
            if self.paused_by == p["name"] or not [o for o in self.active() if not o["bot"] and o is not p]:
                self.set_pause(pid, False)     # don't leave everyone stuck in a pause
            p["gone"] = True
            p["inv"] = []
            if self.current == pid:
                self.fired.set()
            if self.drafter == pid:
                self.pick_evt.set()

    def finish(self):
        ranking = sorted(self.players.values(), key=lambda p: (not p["gone"], not p["dead"], p["score"]), reverse=True)
        alive = [p for p in ranking if not p["gone"] and not p["dead"]]
        top = alive or [p for p in ranking if not p["gone"]]
        winner = top[0] if top and (len(top) < 2 or top[0]["score"] > top[1]["score"]) else None
        self.room.broadcast({
            "t": "over",
            "winner": {"id": winner["id"], "name": winner["name"], "color": winner["color"]} if winner else None,
            "ranking": [{"id": p["id"], "name": p["name"], "color": p["color"], "score": p["score"],
                         "gone": p["gone"], "dead": p["dead"]} for p in ranking],
        })
        self.room.game = None
        self.room.state = "lobby"
        self.room.broadcast_info()
        lobby_changed()

    # ---- bots
    def bot_pick(self):
        best, bv = None, -1
        for i, name in enumerate(self.pool):
            if self.taken[i] is not None:
                continue
            s = self.by_name.get(name, FALLBACK[0])
            v = s["damage"] * (s["count"] if s["type"] in ("spread", "stream", "split", "jackhammer", "teabag") else 1)
            v += s["frag_damage"] * s["count"] * 0.6 if s["type"] in ("cluster", "airstrike") else 0
            v += 15 if s["type"] in ("dirt", "teleport", "digger") else 0
            v *= random.uniform(0.6, 1.4)
            if v > bv:
                best, bv = i, v
        return best

    def trace(self, p, ang, power, spec, target):
        """Cheap ballistic preview for bots: distance from the target where a shot lands."""
        a = math.radians(ang)
        sp = power / 100 * VMAX * spec["speed"]
        x, y = self.muzzle(p, ang)
        vx, vy = math.cos(a) * sp, math.sin(a) * sp
        dt, g = 1 / 40, G * spec["gravity"]
        tx, ty = target["x"], target["y"] + 6
        for _ in range(600):
            vy -= g * dt
            x += vx * dt
            y += vy * dt
            if math.hypot(x - tx, y - ty) < TANK_R:
                return 0
            if 0 <= x < WW and y <= self.H[int(x)]:
                return math.hypot(x - tx, y - ty)
            if x < -40 or x > WW + 40 or y < -40:
                return 9999
        return 9999

    async def bot_turn(self, p):
        await asyncio.sleep(random.uniform(0.8, 1.4))
        if p["gone"] or not p["inv"]:
            return
        foes = [o for o in self.active() if o is not p]
        if not foes:
            return
        target = max(foes, key=lambda o: o["score"] + random.uniform(0, 40))
        w = random.randrange(len(p["inv"]))
        spec = self.by_name.get(p["inv"][w], FALLBACK[0])
        right = target["x"] > p["x"]
        best = (9999, 45 if right else 135, 60)
        for base in range(3, 88, 4):
            ang = base if right else 180 - base
            for power in range(14, 101, 3):
                d = self.trace(p, ang, power, spec, target)
                if d < best[0]:
                    best = (d, ang, power)
        _, ang, power = best
        for power2 in (power - 2, power - 1, power + 1, power + 2):
            d = self.trace(p, ang, power2, spec, target)
            if d < best[0]:
                best = (d, ang, power2)
        _, ang, power = best
        ang = clamp(ang + random.uniform(-2.5, 2.5), 0, 180)
        power = clamp(power + random.uniform(-3, 3), 5, 100)
        if p["gone"]:
            return
        p["w"] = w
        self.room.broadcast({"t": "aim", "id": p["id"], "angle": ang, "power": power * 0.4, "w": w})
        await asyncio.sleep(0.7)
        await self.gate()
        if p["gone"]:
            return
        # wind up like a human holding SPACE: clients animate the charge meter up to `power`
        self.room.broadcast({"t": "aim", "id": p["id"], "angle": ang, "power": power, "w": w, "c": True})
        await asyncio.sleep(power / 100 * CHARGE_SEC + 0.1)
        await self.gate()
        if p["gone"]:
            return
        self.fire_req = {"angle": ang, "power": power, "w": w}


# --------------------------------------------------------------------------- rooms

rooms = {}
clients = set()
_next_id = 0


def new_id():
    global _next_id
    _next_id += 1
    return f"p{_next_id}"


def room_code():
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    while True:
        c = "".join(random.choice(letters) for _ in range(4))
        if c not in rooms:
            return c


def clean(s, n):
    s = "".join(ch for ch in str(s or "") if ch.isprintable()).strip()
    return s[:n]


class Room:
    def __init__(self, name, host, turn_sec, public):
        self.code = room_code()
        self.name = name
        self.host = host.id
        self.turn_sec = turn_sec
        self.weapons = 10
        self.draft = True
        self.public = public
        self.members = []
        self.state = "lobby"
        self.game = None

    def free_color(self):
        used = {m["color"] for m in self.members}
        return next(i for i in range(6) if i not in used)

    def add_client(self, c):
        self.members.append({"id": c.id, "name": c.name, "color": self.free_color(), "bot": False, "client": c})
        c.room = self

    def humans(self):
        return [m for m in self.members if not m["bot"]]

    def broadcast(self, obj):
        data = json.dumps(obj)
        for m in self.members:
            if m["client"]:
                m["client"].send_raw(data)

    def info(self):
        return {"code": self.code, "name": self.name, "host": self.host, "turnSec": self.turn_sec,
                "weapons": self.weapons, "draft": self.draft, "state": self.state, "public": self.public,
                "players": [{"id": m["id"], "name": m["name"], "color": m["color"], "bot": m["bot"]}
                            for m in self.members]}

    def broadcast_info(self):
        self.broadcast({"t": "room", "room": self.info()})

    def remove(self, pid):
        self.members = [m for m in self.members if m["id"] != pid]
        if self.game:
            self.game.forfeit(pid)
        if not self.humans():
            if self.game and self.game.task:
                self.game.task.cancel()
            rooms.pop(self.code, None)
        else:
            if self.host == pid:
                self.host = self.humans()[0]["id"]
            self.broadcast_info()
        lobby_changed()


def room_list():
    return [{"code": r.code, "name": r.name, "count": len(r.members), "max": MAX_PLAYERS,
             "state": r.state, "turnSec": r.turn_sec}
            for r in rooms.values() if r.public]


def lobby_changed():
    data = json.dumps({"t": "rooms", "rooms": room_list()})
    for c in list(clients):
        if c.room is None and c.name:
            c.send_raw(data)


# --------------------------------------------------------------------------- websocket

class Client:
    def __init__(self, reader, writer):
        self.reader = reader
        self.writer = writer
        self.id = new_id()
        self.name = ""
        self.room = None
        self.closed = False
        self.last_chat = 0.0

    def send_raw(self, text):
        if self.closed:
            return
        data = text.encode()
        n = len(data)
        if n < 126:
            hdr = struct.pack("!BB", 0x81, n)
        elif n < 65536:
            hdr = struct.pack("!BBH", 0x81, 126, n)
        else:
            hdr = struct.pack("!BBQ", 0x81, 127, n)
        try:
            self.writer.write(hdr + data)
        except Exception:
            self.closed = True

    def send(self, obj):
        self.send_raw(json.dumps(obj))

    async def recv(self):
        buf = b""
        while True:
            h = await self.reader.readexactly(2)
            fin, op = h[0] & 0x80, h[0] & 0x0F
            masked, ln = h[1] & 0x80, h[1] & 0x7F
            if ln == 126:
                ln = struct.unpack("!H", await self.reader.readexactly(2))[0]
            elif ln == 127:
                ln = struct.unpack("!Q", await self.reader.readexactly(8))[0]
            if ln > 65536:
                return None
            mask = await self.reader.readexactly(4) if masked else b"\0\0\0\0"
            payload = bytearray(await self.reader.readexactly(ln))
            for i in range(ln):
                payload[i] ^= mask[i & 3]
            if op == 0x8:
                return None
            if op == 0x9:
                self.writer.write(struct.pack("!BB", 0x8A, len(payload)) + bytes(payload))
                continue
            if op == 0xA:
                continue
            buf += payload
            if fin:
                return buf.decode("utf-8", "replace")

    def error(self, msg):
        self.send({"t": "error", "msg": msg})

    async def handle(self, msg):
        t = msg.get("t")
        if t == "hello":
            self.name = clean(msg.get("name"), 14) or "Anonymous"
            self.send({"t": "welcome", "id": self.id, "name": self.name})
            self.send({"t": "rooms", "rooms": room_list()})
            return
        if not self.name:
            return
        room = self.room

        if t == "list":
            self.send({"t": "rooms", "rooms": room_list()})
        elif t == "create":
            if room:
                return
            sec = msg.get("turnSec", 60)
            sec = sec if sec in TURN_CHOICES else 60
            name = clean(msg.get("name"), 20) or f"{self.name}'s room"
            r = Room(name, self, sec, bool(msg.get("public", True)))
            rooms[r.code] = r
            r.add_client(self)
            r.broadcast_info()
            lobby_changed()
        elif t == "join":
            if room:
                return
            r = rooms.get(clean(msg.get("code"), 4).upper())
            if not r:
                return self.error("Room not found")
            if r.state != "lobby":
                return self.error("Game already in progress")
            if len(r.members) >= MAX_PLAYERS:
                return self.error("Room is full")
            r.add_client(self)
            r.broadcast_info()
            r.broadcast({"t": "chat", "sys": True, "text": f"{self.name} joined"})
            lobby_changed()
        elif not room:
            return
        elif t == "leave":
            self.room = None
            room.remove(self.id)
            room.broadcast({"t": "chat", "sys": True, "text": f"{self.name} left"})
            self.send({"t": "left"})
            self.send({"t": "rooms", "rooms": room_list()})
        elif t == "chat":
            text = clean(msg.get("text"), 120)
            now = time.time()
            if text and now - self.last_chat > 0.4:
                self.last_chat = now
                me = next((m for m in room.members if m["id"] == self.id), None)
                room.broadcast({"t": "chat", "name": self.name, "color": me["color"] if me else 0, "text": text})
        elif t in ("aim", "fire", "move", "pick", "pause"):
            g = room.game
            if not g:
                return
            if t == "aim" and isinstance(msg.get("a"), dict):
                g.aim(self.id, msg["a"])
            elif t == "fire":
                g.fire(self.id, msg.get("a"))
            elif t == "move":
                g.move(self.id, msg.get("dir"))
            elif t == "pick":
                g.pick(self.id, msg.get("i"))
            elif t == "pause":
                g.set_pause(self.id, bool(msg.get("on")))
        elif room.host != self.id or room.state != "lobby":
            return
        elif t == "addBot":
            if len(room.members) >= MAX_PLAYERS:
                return self.error("Room is full")
            used = {m["name"] for m in room.members}
            name = next((n for n in random.sample(BOT_NAMES, len(BOT_NAMES)) if n not in used), "Bot")
            room.members.append({"id": new_id(), "name": name, "color": room.free_color(), "bot": True, "client": None})
            room.broadcast_info()
            lobby_changed()
        elif t == "kick":
            pid = msg.get("id")
            if any(m["id"] == pid and m["bot"] for m in room.members):
                room.remove(pid)
        elif t == "settings":
            if msg.get("turnSec") in TURN_CHOICES:
                room.turn_sec = msg["turnSec"]
            if msg.get("weapons") in WEAPON_CHOICES:
                room.weapons = msg["weapons"]
            if isinstance(msg.get("draft"), bool):
                room.draft = msg["draft"]
            room.broadcast_info()
            lobby_changed()
        elif t == "start":
            if len(room.members) < 2:
                return self.error("Need at least 2 players (add a bot!)")
            room.state = "playing"
            room.game = Game(room)
            room.game.task = asyncio.create_task(room.game.run())
            room.broadcast_info()
            lobby_changed()


# --------------------------------------------------------------------------- http

async def serve_static(writer, path, method="GET"):
    path = path.split("?", 1)[0].split("#", 1)[0]
    if path in ("", "/"):
        path = "/index.html"
    full = os.path.normpath(os.path.join(PUBLIC, path.lstrip("/")))
    if not full.startswith(PUBLIC) or not os.path.isfile(full):
        body, status, ctype = b"Not found", "404 Not Found", "text/plain"
    else:
        with open(full, "rb") as f:
            body = f.read()
        status = "200 OK"
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
    writer.write((f"HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
                  f"Cache-Control: no-cache\r\nConnection: close\r\n\r\n").encode()
                 + (b"" if method == "HEAD" else body))
    await writer.drain()


async def on_connection(reader, writer):
    client = None
    try:
        raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        lines = raw.decode("latin1").split("\r\n")
        parts = lines[0].split(" ")
        path = parts[1] if len(parts) > 1 else "/"
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if headers.get("upgrade", "").lower() != "websocket":
            await serve_static(writer, path, parts[0])
            return

        accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"] + WS_GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
        await writer.drain()

        client = Client(reader, writer)
        clients.add(client)
        while True:
            text = await client.recv()
            if text is None:
                break
            try:
                msg = json.loads(text)
            except ValueError:
                continue
            if isinstance(msg, dict):
                await client.handle(msg)
            await writer.drain()
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, ConnectionError, asyncio.LimitOverrunError, KeyError):
        pass
    except Exception as e:  # keep the server alive no matter what one socket does
        print("connection error:", repr(e))
    finally:
        if client:
            client.closed = True
            clients.discard(client)
            if client.room:
                r = client.room
                client.room = None
                r.remove(client.id)
                r.broadcast({"t": "chat", "sys": True, "text": f"{client.name} disconnected"})
        try:
            writer.close()
        except Exception:
            pass


async def main():
    mimetypes.add_type("application/javascript", ".js")
    n = len(load_powers())
    server = await asyncio.start_server(on_connection, HOST, PORT)
    print(f"BATTLE DONGS server running on http://localhost:{PORT}  ({n} powers loaded from powers.txt)")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
