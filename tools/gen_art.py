#!/usr/bin/env python3
"""Generates The Last Light's non-hand-made sprites in the style of the
hand-drawn assets: grainy per-pixel colour variation, soft dark edges and
simple side shading.

Run:  python3 tools/gen_art.py            (writes PNGs into Assets/)
Needs: pillow, numpy
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Assets')
RNG = np.random.default_rng(7)


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


class Sprite:
    """Paint shapes as 'materials'; finish() turns them into grainy pixel art."""

    def __init__(self, w, h, k=1.0):
        # k scales everything drawn: shapes are given in the unscaled design
        # coordinates and land on a canvas k times the size.
        self.k = k
        w, h = int(np.ceil(w * k)), int(np.ceil(h * k))
        self.w, self.h = w, h
        self.mat = np.full((h, w), -1, dtype=int)   # material index per pixel
        self.mats = []                               # (base rgb, grain, shade dir)
        self.extra = np.zeros((h, w))                # extra light (+) / dark (-)

    def material(self, color, grain=18, speckle=0.06):
        self.mats.append((hexrgb(color), grain, speckle))
        return len(self.mats) - 1

    # ── shape primitives (all paint a material into the mask) ──────────────
    def _paint(self, draw_fn, m):
        mask = Image.new('L', (self.w, self.h), 0)
        draw_fn(ImageDraw.Draw(mask))
        sel = np.array(mask) > 0
        self.mat[sel] = m
        return sel

    # design coords -> canvas pixels (a box always keeps at least one pixel)
    def _box(self, x0, y0, x1, y1):
        k = self.k
        if k == 1.0:
            return x0, y0, x1, y1
        X0, Y0 = int(np.floor(x0 * k)), int(np.floor(y0 * k))
        return X0, Y0, max(X0, int(np.floor((x1 + 1) * k)) - 1), max(Y0, int(np.floor((y1 + 1) * k)) - 1)

    def _pts(self, pts):
        k = self.k
        return pts if k == 1.0 else [(round(x * k), round(y * k)) for x, y in pts]

    def rect(self, x0, y0, x1, y1, m):
        b = self._box(x0, y0, x1, y1)
        return self._paint(lambda d: d.rectangle(list(b), fill=255), m)

    def ellipse(self, x0, y0, x1, y1, m):
        b = self._box(x0, y0, x1, y1)
        return self._paint(lambda d: d.ellipse(list(b), fill=255), m)

    def poly(self, pts, m):
        q = self._pts(pts)
        return self._paint(lambda d: d.polygon(q, fill=255), m)

    def line(self, pts, m, width=1):
        q = self._pts(pts)
        return self._paint(lambda d: d.line(q, fill=255, width=width), m)

    def px(self, x, y, m):
        # a design pixel covers a k x k block, so pixel text and details stay solid when scaled
        x0, y0, x1, y1 = self._box(x, y, x, y)
        if 0 <= x0 < self.w and 0 <= y0 < self.h:
            self.mat[y0:min(self.h, y1 + 1), x0:min(self.w, x1 + 1)] = m

    def clear(self, x0, y0, x1, y1):
        x0, y0, x1, y1 = self._box(x0, y0, x1, y1)
        self.mat[y0:y1 + 1, x0:x1 + 1] = -1

    def shade(self, x0, y0, x1, y1, amount):
        """Lighten (+) or darken (-) an area after painting."""
        self.extra[max(0, y0):y1 + 1, max(0, x0):x1 + 1] += amount

    def shade_gradient(self, axis='x', strength=0.25):
        """Light from the upper-left: darken towards the right / bottom of each shape."""
        opaque = self.mat >= 0
        ys, xs = np.nonzero(opaque)
        if len(xs) == 0:
            return
        if axis == 'x':
            t = (np.arange(self.w) - xs.min()) / max(1, xs.max() - xs.min())
            self.extra -= strength * t[None, :] * opaque
        else:
            t = (np.arange(self.h) - ys.min()) / max(1, ys.max() - ys.min())
            self.extra -= strength * t[:, None] * opaque

    # ── finishing ─────────────────────────────────────────────────────────
    def finish(self, outline=0.45, edge_light=0.0, grain_scale=1.0, mottle=0.0):
        h, w = self.h, self.w
        img = np.zeros((h, w, 4), dtype=float)
        opaque = self.mat >= 0
        for i, (base, grain, speckle) in enumerate(self.mats):
            sel = self.mat == i
            n = sel.sum()
            if not n:
                continue
            grain = grain * grain_scale
            col = np.tile(base, (n, 1))
            # per-pixel grain: mostly luminance, a little hue drift
            lum = RNG.normal(0, grain, n)
            hue = RNG.normal(0, grain * 0.25, (n, 3))
            col = col + lum[:, None] + hue
            # occasional dark speckles, like the hand-drawn textures
            spk = RNG.random(n) < speckle
            col[spk] *= RNG.uniform(0.45, 0.7, spk.sum())[:, None]
            img[sel, :3] = col
            img[sel, 3] = 255
        # broad shading
        img[..., :3] *= (1 + self.extra)[..., None]
        # low-frequency blotches so big surfaces look painted, not like static
        if mottle:
            cell = 6
            small = RNG.normal(0, 1, (h // cell + 2, w // cell + 2))
            field = np.array(Image.fromarray(((small + 3) * 40).clip(0, 255).astype(np.uint8))
                             .resize(((w // cell + 2) * cell, (h // cell + 2) * cell), Image.BILINEAR),
                             dtype=float)[:h, :w] / 40 - 3
            img[..., :3] *= (1 + mottle * field)[..., None]
        # outline: opaque pixels that touch transparency get darkened
        pad = np.pad(opaque, 1)
        neigh = (pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        edge = opaque & ~neigh
        img[edge, :3] *= (1 - outline)
        if edge_light:
            top = opaque & ~np.pad(opaque, ((1, 0), (0, 0)))[:-1]
            img[top & ~edge, :3] *= (1 + edge_light)
        img[..., :3] = np.clip(img[..., :3], 0, 255)
        return Image.fromarray(img.astype(np.uint8), 'RGBA')


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path)
    print('wrote', name, img.size)


# ════════════════════════════════════════════════════════════════════════════
# Characters & creatures  (scale: an adult is ~48 px tall, like the hand-made
# player and survivor sprites). All face RIGHT; the game mirrors them.
# ════════════════════════════════════════════════════════════════════════════

# Creature scale next to the ~47 px hand-drawn player (design coords stay the same)
CREATURE_K = {'raider': 0.94, 'robot': 0.85, 'drone': 0.75, 'wolf': 0.8, 'dog': 0.75}


def raider():
    # Slim build to match the hand-drawn survivors, a touch shorter than the player
    s = Sprite(26, 50, CREATURE_K['raider'])
    skin = s.material('#b07a52', 14, 0.03)
    hair = s.material('#2a1c14', 14)
    hood = s.material('#5e2c22', 20, 0.08)
    jacket = s.material('#4c3b2a', 22, 0.12)
    strap = s.material('#22180f', 10)
    pants = s.material('#3e412c', 22, 0.14)
    boot = s.material('#1e150e', 10)
    rag = s.material('#8a2c22', 16)
    # legs
    s.rect(8, 29, 10, 45, pants); s.rect(13, 29, 15, 45, pants)
    s.rect(7, 45, 10, 48, boot); s.rect(13, 45, 16, 48, boot)
    # torso
    s.rect(6, 13, 17, 29, jacket)
    s.line([(7, 13), (16, 27)], strap)              # bandolier
    s.rect(6, 27, 17, 28, strap)                    # belt
    # both arms hang; the game draws the held weapon in the front hand (18, 27)
    s.rect(4, 14, 5, 26, jacket); s.rect(4, 26, 5, 28, skin)
    s.rect(18, 14, 19, 26, jacket); s.rect(18, 26, 19, 28, skin)
    # head: hood, face, rag over mouth
    s.ellipse(8, 1, 16, 12, hood)
    s.rect(11, 4, 16, 11, skin)
    s.rect(12, 3, 16, 4, hair)
    s.rect(11, 8, 16, 11, rag)
    s.px(14, 6, strap)                              # eye
    s.rect(8, 10, 10, 14, hood)
    s.shade_gradient('x', 0.30)
    return s.finish()


def robot():
    s = Sprite(40, 62, CREATURE_K['robot'])
    plate = s.material('#4e5660', 16, 0.08)
    dark = s.material('#262b31', 10)
    joint = s.material('#33383e', 12)
    rust = s.material('#7a4a2a', 22, 0.15)
    eye = s.material('#e0402a', 8, 0)
    glow = s.material('#ff8a5a', 6, 0)
    # legs
    s.rect(11, 40, 17, 56, plate); s.rect(23, 40, 29, 56, plate)
    s.rect(12, 46, 16, 48, joint); s.rect(24, 46, 28, 48, joint)
    s.rect(9, 56, 18, 60, dark); s.rect(22, 56, 31, 60, dark)
    # hips & torso
    s.rect(10, 36, 30, 41, joint)
    s.poly([(7, 15), (33, 15), (31, 37), (9, 37)], plate)
    s.rect(13, 21, 27, 31, dark)                  # chest vent
    for y in range(22, 31, 2):
        s.rect(14, y, 26, y, joint)
    s.rect(9, 33, 15, 36, rust); s.rect(27, 16, 31, 20, rust)
    # arms
    s.rect(2, 16, 7, 34, plate); s.rect(2, 34, 7, 40, dark)
    s.rect(33, 16, 38, 34, plate); s.rect(33, 34, 38, 40, dark)
    s.rect(3, 24, 6, 26, joint); s.rect(34, 24, 37, 26, joint)
    # head
    s.rect(13, 4, 27, 14, plate)
    s.rect(15, 7, 27, 11, dark)
    s.rect(21, 8, 26, 10, eye); s.rect(23, 8, 25, 9, glow)
    s.rect(19, 0, 20, 4, joint)                   # antenna
    s.shade_gradient('x', 0.28)
    return s.finish(outline=0.5)


def drone():
    s = Sprite(48, 26, CREATURE_K['drone'])
    body = s.material('#3a4048', 14, 0.07)
    dark = s.material('#1c2025', 8)
    rotor = s.material('#5a6068', 10)
    lens = s.material('#d8402a', 6, 0)
    glow = s.material('#ffb08a', 4, 0)
    # rotor arms + blurred rotors
    s.rect(4, 6, 44, 7, dark)
    s.ellipse(0, 3, 14, 6, rotor); s.ellipse(34, 3, 48, 6, rotor)
    s.rect(6, 6, 8, 10, dark); s.rect(40, 6, 42, 10, dark)
    # body
    s.ellipse(12, 7, 36, 21, body)
    s.rect(16, 18, 32, 22, dark)
    s.line([(20, 22), (17, 25)], dark); s.line([(28, 22), (31, 25)], dark)  # skids
    # camera eye
    s.ellipse(26, 11, 33, 18, dark)
    s.ellipse(28, 13, 32, 17, lens); s.px(29, 14, glow)
    s.shade_gradient('y', 0.25)
    return s.finish(outline=0.5)


def wolf(fur='#5c5048', belly='#7a6c60', name='wolf'):
    s = Sprite(46, 30, CREATURE_K['wolf'])
    f = s.material(fur, 22, 0.12)
    b = s.material(belly, 18, 0.06)
    d = s.material('#241c18', 10)
    eye = s.material('#e0b040', 6, 0)
    # long legs
    for x in (8, 12, 29, 33):
        s.rect(x, 15, x + 2, 27, f)
        s.rect(x, 27, x + 3, 28, d)
    # lean body, tail hanging
    s.ellipse(6, 8, 37, 19, f)
    s.ellipse(12, 13, 32, 19, b)
    s.poly([(7, 11), (1, 16), (2, 19), (8, 14)], f)
    # neck & head (facing right)
    s.poly([(31, 9), (38, 3), (42, 8), (37, 15)], f)
    s.poly([(38, 4), (46, 8), (45, 12), (38, 11)], f)   # snout
    s.rect(44, 9, 45, 10, d)                            # nose
    s.poly([(35, 0), (38, 5), (34, 5)], f)              # ears
    s.poly([(38, 0), (40, 4), (37, 4)], f)
    s.px(40, 6, eye)
    s.line([(40, 12), (44, 12)], d)                     # mouth
    s.shade_gradient('y', 0.30)
    return s.finish()


def dog():
    s = Sprite(38, 26, CREATURE_K['dog'])
    f = s.material('#8a5a32', 20, 0.08)
    b = s.material('#b88a5a', 16, 0.05)
    d = s.material('#2a1a10', 10)
    col = s.material('#a02a22', 10, 0)
    for x in (7, 11, 24, 28):
        s.rect(x, 16, x + 2, 24, f)
        s.rect(x, 23, x + 2, 25, d)
    s.ellipse(4, 8, 32, 19, f)
    s.ellipse(9, 13, 28, 19, b)
    s.poly([(5, 11), (0, 4), (2, 3), (7, 9)], f)          # tail up
    s.poly([(26, 9), (32, 3), (36, 8), (31, 15)], f)
    s.poly([(32, 5), (38, 9), (37, 12), (32, 11)], b)     # muzzle
    s.rect(36, 9, 37, 10, d)
    s.poly([(30, 1), (33, 7), (28, 6)], d)                # ear
    s.px(33, 6, d)
    s.rect(27, 9, 30, 10, col)                            # collar
    s.shade_gradient('y', 0.28)
    return s.finish()


# ════════════════════════════════════════════════════════════════════════════
# Props
# ════════════════════════════════════════════════════════════════════════════

def car_wreck():
    s = Sprite(84, 34)
    rust = s.material('#7a3e22', 24, 0.16)
    paint = s.material('#4a5a5e', 20, 0.12)
    dark = s.material('#161210', 8)
    glass = s.material('#2a3a40', 14, 0.2)
    tyre = s.material('#1c1a18', 10)
    chrome = s.material('#8a8478', 14)
    # body
    s.poly([(2, 17), (8, 12), (24, 11), (32, 3), (58, 3), (68, 12), (82, 14), (83, 26), (2, 26)], paint)
    s.rect(2, 24, 83, 27, rust)
    # rust patches
    for (x, y, r) in [(10, 16, 4), (44, 20, 5), (74, 18, 3), (36, 6, 2)]:
        s.ellipse(x - r, y - r, x + r, y + r, rust)
    # windows (one smashed)
    s.poly([(34, 5), (46, 5), (46, 12), (27, 12)], glass)
    s.poly([(49, 5), (57, 5), (64, 12), (49, 12)], dark)
    s.rect(47, 4, 48, 12, rust)
    # wheel arches + flat tyres
    s.ellipse(9, 18, 25, 34, dark); s.ellipse(58, 18, 74, 34, dark)
    s.ellipse(11, 22, 23, 33, tyre); s.ellipse(60, 22, 72, 33, tyre)
    s.rect(11, 31, 23, 33, tyre); s.rect(60, 31, 72, 33, tyre)  # flattened
    s.rect(78, 17, 83, 19, chrome)                            # bumper scrap
    s.clear(0, 26, 8, 33); s.clear(76, 28, 83, 33)
    s.shade_gradient('y', 0.30)
    return s.finish()


def tent():
    s = Sprite(72, 46)
    can = s.material('#4e5634', 22, 0.10)
    can2 = s.material('#3c4428', 22, 0.10)
    patch = s.material('#6a4a2a', 18)
    dark = s.material('#120f0a', 8)
    pole = s.material('#5a4a36', 10)
    rope = s.material('#8a7a5a', 10)
    s.poly([(36, 4), (70, 45), (2, 45)], can)
    s.poly([(36, 4), (52, 45), (36, 45)], can2)            # shaded flap side
    s.poly([(36, 16), (46, 45), (27, 45)], dark)           # opening
    s.rect(18, 28, 25, 33, patch)
    s.line([(35, 0), (36, 8)], pole, width=2)
    s.line([(4, 44), (0, 38)], rope); s.line([(68, 44), (71, 38)], rope)
    s.shade_gradient('y', 0.20)
    return s.finish()


def debris():
    s = Sprite(52, 22)
    conc = s.material('#6a665e', 20, 0.12)
    brick = s.material('#7a4430', 22, 0.12)
    wood = s.material('#5a4228', 20, 0.10)
    rebar = s.material('#3a2a20', 8)
    dark = s.material('#1e1a16', 8)
    s.poly([(2, 21), (10, 10), (20, 13), (30, 5), (40, 11), (50, 21)], conc)
    s.poly([(8, 21), (14, 14), (22, 17), (18, 21)], brick)
    s.poly([(30, 21), (34, 12), (44, 14), (46, 21)], brick)
    s.line([(14, 10), (34, 3)], wood, width=3)
    s.line([(28, 8), (38, 0)], rebar); s.line([(31, 9), (43, 2)], rebar)
    for (x, y) in [(24, 16), (38, 17), (11, 18)]:
        s.rect(x, y, x + 2, y + 1, dark)
    s.shade_gradient('y', 0.30)
    return s.finish()


# ════════════════════════════════════════════════════════════════════════════
# Building facades. Doors are always centred horizontally (the game places
# the door hotspot at the middle of the building) and ~30 px tall.
# ════════════════════════════════════════════════════════════════════════════

FONT = {  # 3x5 pixel font for signs
    'A': ['010', '101', '111', '101', '101'], 'C': ['011', '100', '100', '100', '011'],
    'E': ['111', '100', '110', '100', '111'], 'H': ['101', '101', '111', '101', '101'],
    'I': ['111', '010', '010', '010', '111'], 'L': ['100', '100', '100', '100', '111'],
    'M': ['101', '111', '111', '101', '101'], 'O': ['010', '101', '101', '101', '010'],
    'P': ['110', '101', '110', '100', '100'], 'R': ['110', '101', '110', '101', '101'],
    'S': ['011', '100', '010', '001', '110'], 'T': ['111', '010', '010', '010', '010'],
    'Y': ['101', '101', '010', '010', '010'], 'U': ['101', '101', '101', '101', '111'],
    'N': ['101', '111', '111', '111', '101'], 'D': ['110', '101', '101', '101', '110'],
    'F': ['111', '100', '110', '100', '100'], 'G': ['011', '100', '101', '101', '011'],
    'K': ['101', '101', '110', '101', '101'], 'V': ['101', '101', '101', '101', '010'],
    'W': ['101', '101', '111', '111', '101'], 'B': ['110', '101', '110', '101', '110'],
    ' ': ['000', '000', '000', '000', '000'],
}


def text(s, x, y, msg, m, missing=()):
    """Pixel text; letter indices in `missing` are left out (fallen letters)."""
    for i, ch in enumerate(msg):
        if i in missing:
            continue
        for r, row in enumerate(FONT[ch]):
            for c, bit in enumerate(row):
                if bit == '1':
                    s.px(x + i * 4 + c, y + r, m)


def window(s, x, y, w, h, frame, glass, dark, kind=None):
    kind = kind or RNG.choice(['dark', 'dark', 'broken', 'boarded', 'lit'])
    s.rect(x - 1, y - 1, x + w, y + h, frame)
    s.rect(x, y, x + w - 1, y + h - 1, dark)
    if kind == 'dark':
        s.rect(x, y, x + w // 2 - 1, y + h // 2 - 1, glass)      # glint pane
    elif kind == 'broken':
        s.poly([(x, y), (x + w - 1, y), (x + w // 2, y + h // 2), (x + 1, y + h - 2)], glass)
    elif kind == 'boarded':
        board = s.material('#6a5030', 18, 0.10)
        s.rect(x - 1, y + 1, x + w, y + 3, board)
        s.rect(x - 1, y + h - 4, x + w, y + h - 2, board)
    elif kind == 'lit':
        lit = s.material('#4a3c1c', 10, 0.05)
        s.rect(x, y, x + w - 1, y + h - 1, lit)
    s.rect(x, y + h // 2, x + w - 1, y + h // 2, frame)         # mullion


def door(s, cx, base, frame, wood, dark, w=16, h=34):
    x0 = cx - w // 2
    s.rect(x0 - 2, base - h - 2, x0 + w + 1, base, frame)
    s.rect(x0, base - h, x0 + w - 1, base, dark)
    s.rect(x0, base - h, x0 + w // 2, base, wood)                # half-open door
    s.px(x0 + w // 2 - 2, base - h // 2, frame)


def weather(s, w, h, base, cracks=4, dirt=0.35):
    """Grime gradient at the bottom, roof shadow at the top, and cracks."""
    crack = s.material('#120e0a', 6, 0)
    for _ in range(cracks):
        x = int(RNG.integers(4, w - 4)); y = int(RNG.integers(base // 3, base - 4))
        pts = [(x, y)]
        for _ in range(int(RNG.integers(3, 7))):
            x += int(RNG.integers(-2, 3)); y += int(RNG.integers(1, 4))
            pts.append((x, y))
        opaque_line = [(px, py) for px, py in pts if 0 <= px < w and 0 <= py < h and s.mat[py, px] >= 0]
        for px, py in opaque_line:
            s.px(px, py, crack)
    s.shade(0, base - 18, w, base, -dirt * 0.6)
    s.shade(0, base - 8, w, base, -dirt * 0.4)


# Facades are drawn at 1.4x their design size so doorways fit the ~47px characters
FACADE_K = 1.4


def house(variant=0):
    w, h = (150, 140) if variant == 0 else (132, 128)
    s = Sprite(w, h, FACADE_K)
    side = s.material(['#6a5844', '#5a6066'][variant], 18, 0.08)
    seam = s.material(['#4a3c2c', '#41464b'][variant], 10)
    roof = s.material('#3a2c26', 20, 0.12)
    trim = s.material('#8a7c66', 14)
    frame = s.material('#2a221a', 8); glass = s.material('#3c5058', 14, 0.15)
    dark = s.material('#0e0c0a', 6); wood = s.material('#5a3c22', 18, 0.1)
    base = h - 1
    wall_top = 44
    s.rect(4, wall_top, w - 5, base, side)
    for y in range(wall_top + 4, base, 5):                      # horizontal siding
        s.rect(4, y, w - 5, y, seam)
    s.poly([(0, wall_top + 2), (w // 2, 6), (w - 1, wall_top + 2)], roof)
    s.rect(0, wall_top, w - 1, wall_top + 2, trim)
    s.rect(w - 34, 10, w - 24, 30, roof)                         # chimney
    # holes in the roof
    s.clear(w // 2 - 24, 22, w // 2 - 16, 26)
    floor2 = wall_top + 10
    for x in (14, w - 36):
        window(s, x, floor2, 22, 18, frame, glass, dark)
    for x in (14, w - 36):
        window(s, x, base - 34, 22, 20, frame, glass, dark)
    window(s, w // 2 - 9, 14 + 12, 18, 10, frame, glass, dark, 'dark')   # attic
    door(s, w // 2, base, frame, wood, dark)
    s.rect(w // 2 - 12, base - 1, w // 2 + 11, base, trim)      # step
    weather(s, w, h, base, cracks=3)
    s.shade_gradient('x', 0.22)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def apartment():
    w, h = 140, 170
    s = Sprite(w, h, FACADE_K)
    brick = s.material('#6e3c2c', 20, 0.10)
    mortar = s.material('#4a2a20', 10)
    ledge = s.material('#7a7466', 14)
    frame = s.material('#22201c', 8); glass = s.material('#3a4c54', 14, 0.15)
    dark = s.material('#0c0b0a', 6); wood = s.material('#4a3420', 16)
    base = h - 1
    s.rect(2, 8, w - 3, base, brick)
    for y in range(10, base, 4):                                 # brick courses
        s.rect(2, y, w - 3, y, mortar)
        off = 0 if (y // 4) % 2 else 4
        for x in range(2 + off, w - 3, 8):
            s.px(x, y + 1, mortar); s.px(x, y + 2, mortar)
    s.rect(0, 4, w - 1, 9, ledge)
    s.clear(w - 30, 4, w - 1, 14)                                # collapsed corner
    s.poly([(w - 30, 9), (w - 1, 9), (w - 1, 26)], brick)
    for row, y in enumerate((20, 56, 92)):
        s.rect(4, y + 26, w - 5, y + 27, ledge)
        for x in range(12, w - 24, 30):
            window(s, x, y, 18, 22, frame, glass, dark)
    door(s, w // 2, base, frame, wood, dark)
    s.rect(w // 2 - 16, base - 34, w // 2 + 15, base - 33, ledge)
    weather(s, w, h, base, cracks=6)
    s.shade_gradient('x', 0.22)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def office(sign_text='OFFICES', band_col='#3e4044', missing=(3,), police=False):
    w, h = 170, 168
    s = Sprite(w, h, FACADE_K)
    conc = s.material('#5e6062', 16, 0.08)
    joint = s.material('#46484a', 10)
    band = s.material(band_col, 12)
    frame = s.material('#1c1e20', 8); glass = s.material('#34485a', 16, 0.18)
    dark = s.material('#0b0c0e', 6); wood = s.material('#3a3a3c', 12)
    sign = s.material('#2a2c2e', 10); letter = s.material('#9a9a8a', 10, 0)
    base = h - 1
    s.rect(3, 6, w - 4, base, conc)
    for x in range(3, w - 4, 20):
        s.rect(x, 6, x, base, joint)
    s.rect(0, 2, w - 1, 6, band)
    for y in (16, 52, 88):
        s.rect(3, y - 4, w - 4, y - 3, band)
        for x in range(10, w - 22, 26):
            window(s, x, y, 18, 24, frame, glass, dark, RNG.choice(['dark', 'broken', 'dark', 'boarded']))
    s.rect(w // 2 - 34, base - 52, w // 2 + 33, base - 42, sign)
    text(s, w // 2 - len(sign_text) * 2 + 1, base - 50, sign_text, letter, missing=missing)
    if police:                                                   # dead light bar over the door
        red = s.material('#7a2420', 10, 0); blue = s.material('#24387a', 10, 0)
        s.rect(w // 2 - 12, base - 40, w // 2 - 1, base - 37, red)
        s.rect(w // 2, base - 40, w // 2 + 11, base - 37, blue)
    door(s, w // 2 - 10, base, frame, wood, dark)
    door(s, w // 2 + 10, base, frame, wood, dark)
    weather(s, w, h, base, cracks=6)
    s.shade_gradient('x', 0.20)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def church():
    w, h = 170, 200
    s = Sprite(w, h, FACADE_K)
    stone = s.material('#6a6458', 18, 0.10)
    joint = s.material('#4c473e', 10)
    roof = s.material('#2e2a28', 18, 0.12)
    frame = s.material('#1c1814', 8); glass = s.material('#5a3a4a', 18, 0.2)
    glass2 = s.material('#3a4a6a', 18, 0.2)
    dark = s.material('#0c0a08', 6); wood = s.material('#4a2e1a', 18)
    cross = s.material('#8a8274', 12)
    base = h - 1
    body_top = 92
    s.rect(6, body_top, w - 7, base, stone)
    s.poly([(0, body_top + 4), (w // 2, body_top - 34), (w - 1, body_top + 4)], roof)
    # bell tower
    tx0, tx1 = w // 2 - 18, w // 2 + 17
    s.rect(tx0, 30, tx1, body_top + 10, stone)
    s.poly([(tx0 - 4, 32), (w // 2, 6), (tx1 + 4, 32)], roof)
    s.rect(w // 2 - 1, 0, w // 2, 8, cross); s.rect(w // 2 - 3, 2, w // 2 + 2, 3, cross)
    s.ellipse(w // 2 - 8, 40, w // 2 + 7, 62, frame)            # belfry arch
    s.ellipse(w // 2 - 6, 42, w // 2 + 5, 62, dark)
    s.rect(w // 2 - 6, 52, w // 2 + 5, 64, dark)
    for y in range(body_top + 3, base, 6):                       # stone courses
        s.rect(6, y, w - 7, y, joint)
    # pointed stained-glass windows
    for x, g in ((22, glass), (w - 38, glass2)):
        s.poly([(x - 1, body_top + 48), (x - 1, body_top + 22), (x + 8, body_top + 10),
                (x + 17, body_top + 22), (x + 17, body_top + 48)], frame)
        s.poly([(x, body_top + 47), (x, body_top + 23), (x + 8, body_top + 12),
                (x + 16, body_top + 23), (x + 16, body_top + 47)], g)
        s.rect(x + 8, body_top + 14, x + 8, body_top + 47, frame)
        s.rect(x, body_top + 32, x + 16, body_top + 32, frame)
    # arched doorway
    s.ellipse(w // 2 - 12, base - 44, w // 2 + 11, base - 20, frame)
    s.rect(w // 2 - 12, base - 32, w // 2 + 11, base, frame)
    s.ellipse(w // 2 - 9, base - 41, w // 2 + 8, base - 22, dark)
    s.rect(w // 2 - 9, base - 32, w // 2 + 8, base, dark)
    s.rect(w // 2 - 9, base - 30, w // 2 - 1, base, wood)
    weather(s, w, h, base, cracks=5)
    s.shade_gradient('x', 0.22)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def factory():
    w, h = 210, 150
    s = Sprite(w, h, FACADE_K)
    metal = s.material('#5a5e58', 16, 0.08)
    rib = s.material('#3e423e', 10)
    rust = s.material('#7a4022', 24, 0.18)
    brick = s.material('#5e3428', 18, 0.10)
    frame = s.material('#1a1c1a', 8); glass = s.material('#3e4a40', 14, 0.18)
    dark = s.material('#0b0c0a', 6); wood = s.material('#4a4a44', 12)
    stack = s.material('#4a3a32', 18, 0.10)
    base = h - 1
    top = 50
    s.rect(4, top, w - 5, base, metal)
    for x in range(6, w - 5, 4):                                 # corrugation
        s.rect(x, top, x, base, rib)
    # sawtooth roof
    for i in range(5):
        x0 = 4 + i * 40
        s.poly([(x0, top), (x0 + 30, top - 22), (x0 + 30, top), ], metal)
        s.rect(x0 + 24, top - 18, x0 + 29, top - 2, glass)
    s.rect(0, top, w - 1, top + 3, rib)
    # chimney stack
    s.rect(w - 40, 0, w - 26, top, stack)
    for y in range(4, top, 6):
        s.rect(w - 40, y, w - 26, y, brick)
    # brick base and rust streaks
    s.rect(4, base - 16, w - 5, base, brick)
    for x in (30, 92, 150, 176):
        s.rect(x, top + 4, x + 3, top + 4 + int(RNG.integers(20, 50)), rust)
    # high windows
    for x in range(16, w - 30, 34):
        window(s, x, top + 14, 22, 14, frame, glass, dark, RNG.choice(['dark', 'broken']))
    # loading door (rolled half up) + man door
    s.rect(w // 2 - 26, base - 52, w // 2 + 25, base, frame)
    s.rect(w // 2 - 24, base - 50, w // 2 + 23, base - 22, rib)
    s.rect(w // 2 - 24, base - 22, w // 2 + 23, base, dark)
    door(s, w // 2, base, frame, wood, dark, w=14, h=20)
    weather(s, w, h, base, cracks=4)
    s.shade_gradient('x', 0.20)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def hospital():
    w, h = 190, 160
    s = Sprite(w, h, FACADE_K)
    tile = s.material('#8a8a82', 14, 0.10)
    joint = s.material('#6a6a64', 8)
    stain = s.material('#6a6248', 18, 0.12)
    band = s.material('#4a6a6a', 14)
    red = s.material('#a02a22', 12, 0.05)
    white = s.material('#c8c4b4', 10)
    frame = s.material('#22262a', 8); glass = s.material('#3a5058', 14, 0.16)
    dark = s.material('#0b0c0d', 6); wood = s.material('#3c4448', 12)
    base = h - 1
    s.rect(3, 12, w - 4, base, tile)
    for y in range(14, base, 8):
        s.rect(3, y, w - 4, y, joint)
    s.rect(0, 8, w - 1, 12, band)
    for x in (20, 70, 140):                                     # water stains
        s.rect(x, 13, x + 8, 13 + int(RNG.integers(25, 60)), stain)
    for y in (24, 62):
        for x in range(12, w - 22, 26):
            window(s, x, y, 18, 22, frame, glass, dark)
    # red cross sign on the roof
    s.rect(w // 2 - 11, 0, w // 2 + 10, 20, white)
    s.rect(w // 2 - 2, 3, w // 2 + 1, 17, red); s.rect(w // 2 - 8, 9, w // 2 + 7, 11, red)
    # entrance canopy
    s.rect(w // 2 - 30, base - 44, w // 2 + 29, base - 39, band)
    text(s, w // 2 - 28 + 13, base - 52, 'HOSPITAL', red, missing=(5,))
    door(s, w // 2 - 8, base, frame, wood, dark)
    door(s, w // 2 + 8, base, frame, wood, dark)
    weather(s, w, h, base, cracks=5)
    s.shade_gradient('x', 0.20)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def pharmacy():
    w, h = 150, 116
    s = Sprite(w, h, FACADE_K)
    wall = s.material('#6a6458', 16, 0.08)
    joint = s.material('#504a40', 8)
    awning = s.material('#2e5a3a', 18, 0.10)
    stripe = s.material('#b0a890', 12)
    green = s.material('#3aa04a', 10, 0)
    sign = s.material('#1e2420', 8)
    frame = s.material('#1c1e1c', 8); glass = s.material('#3a4c48', 14, 0.18)
    dark = s.material('#0b0c0b', 6); wood = s.material('#3a3a36', 12)
    base = h - 1
    s.rect(3, 22, w - 4, base, wall)
    for y in range(26, base, 6):
        s.rect(3, y, w - 4, y, joint)
    s.rect(10, 2, w - 11, 18, sign)
    text(s, 18, 7, 'PHARMACY', stripe, missing=(4,))
    s.rect(w - 26, 4, w - 16, 16, green)                        # green cross
    s.rect(w - 25, 4, w - 17, 6, sign); s.rect(w - 25, 14, w - 17, 16, sign)
    s.rect(w - 26, 4, w - 24, 6, sign); s.rect(w - 18, 4, w - 16, 6, sign)
    s.rect(w - 26, 14, w - 24, 16, sign); s.rect(w - 18, 14, w - 16, 16, sign)
    # striped awning, torn at one end
    s.poly([(6, 30), (w - 7, 30), (w - 1, 42), (0, 42)], awning)
    for x in range(4, w - 4, 12):
        s.poly([(x, 30), (x + 5, 30), (x + 7, 42), (x + 2, 42)], stripe)
    s.clear(w - 30, 38, w - 1, 42)
    # shop windows
    for x in (10, w - 52):
        s.rect(x - 1, 50, x + 42, base - 10, frame)
        s.rect(x, 51, x + 41, base - 11, dark)
        s.poly([(x, 51), (x + 20, 51), (x, 70)], glass)
    door(s, w // 2, base, frame, wood, dark)
    weather(s, w, h, base, cracks=3)
    s.shade_gradient('x', 0.20)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def mall():
    w, h = 230, 128
    s = Sprite(w, h, FACADE_K)
    panel = s.material('#7a7064', 14, 0.08)
    joint = s.material('#5a524a', 8)
    band = s.material('#5a2e2a', 14)
    letter = s.material('#d0b070', 8, 0)
    frame = s.material('#1c1c1c', 8); glass = s.material('#3a4a54', 16, 0.18)
    dark = s.material('#0b0b0b', 6); wood = s.material('#3c3c3c', 12)
    base = h - 1
    s.rect(3, 14, w - 4, base, panel)
    for x in range(3, w - 4, 24):
        s.rect(x, 14, x, base, joint)
    s.rect(0, 10, w - 1, 30, band)
    text(s, w // 2 - 50, 16, 'SUNNY MALL', letter, missing=(2, 8))
    # long glass storefront, partly smashed
    s.rect(10, 44, w - 11, base - 4, frame)
    s.rect(12, 46, w - 13, base - 6, dark)
    for x in range(12, w - 13, 30):
        s.rect(x, 46, x + 1, base - 6, frame)
        if RNG.random() < 0.6:
            s.poly([(x + 2, 46), (x + 18, 46), (x + 2, 66)], glass)
    door(s, w // 2, base, frame, wood, dark, w=22)
    weather(s, w, h, base, cracks=5)
    s.shade_gradient('x', 0.18)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)


def cabin():
    w, h = 130, 104
    s = Sprite(w, h, FACADE_K)
    log = s.material('#5e3e24', 20, 0.12)
    gap = s.material('#3a2414', 10)
    roof = s.material('#2e3a26', 22, 0.14)
    moss = s.material('#4a5a2a', 22, 0.15)
    stone = s.material('#5a5650', 18, 0.10)
    frame = s.material('#22160c', 8); glass = s.material('#3a4038', 14, 0.15)
    dark = s.material('#0c0906', 6); wood = s.material('#4a3018', 18)
    base = h - 1
    wall_top = 40
    s.rect(6, wall_top, w - 7, base, log)
    for y in range(wall_top + 5, base, 6):
        s.rect(6, y, w - 7, y, gap)
    for y in range(wall_top + 2, base, 6):                      # log ends
        s.ellipse(2, y, 8, y + 5, log); s.ellipse(w - 9, y, w - 3, y + 5, log)
    s.poly([(0, wall_top + 3), (w // 2, 8), (w - 1, wall_top + 3)], roof)
    for (x, y) in [(30, 26), (70, 18), (96, 30)]:
        s.ellipse(x, y, x + 14, y + 6, moss)
    s.rect(w - 32, 0, w - 20, 26, stone)                         # chimney
    for x in (16, w - 40):
        window(s, x, wall_top + 16, 22, 18, frame, glass, dark, RNG.choice(['dark', 'boarded']))
    door(s, w // 2, base, frame, wood, dark)
    weather(s, w, h, base, cracks=2, dirt=0.25)
    s.shade_gradient('x', 0.22)
    return s.finish(outline=0.35, grain_scale=0.6, mottle=0.06)



# ════════════════════════════════════════════════════════════════════════════
# Furniture (same scale: a person is ~48 px tall)
# ════════════════════════════════════════════════════════════════════════════

def _wood(s, c='#5a3c22'):
    return s.material(c, 16, 0.10)


def hospital_bed():
    s = Sprite(64, 28)
    frame = s.material('#7a7e80', 12, 0.06); sheet = s.material('#a8a69a', 12, 0.08)
    stain = s.material('#6a5a40', 16); pil = s.material('#b8b6aa', 10)
    dark = s.material('#2a2c2e', 8)
    s.rect(2, 12, 61, 18, sheet); s.rect(4, 8, 16, 13, pil)
    s.ellipse(30, 13, 42, 17, stain)
    s.rect(0, 4, 2, 27, frame); s.rect(61, 9, 63, 27, frame)
    s.rect(0, 18, 63, 20, frame)
    for x in (4, 58):
        s.rect(x, 20, x + 1, 25, frame); s.ellipse(x - 1, 24, x + 2, 27, dark)
    s.shade_gradient('x', 0.2)
    return s.finish()


def iv_stand():
    s = Sprite(14, 48)
    pole = s.material('#8a8c8e', 10); bag = s.material('#8aa0a0', 10, 0.05)
    dark = s.material('#2a2c2e', 8)
    s.rect(6, 2, 7, 44, pole); s.rect(2, 2, 11, 3, pole)
    s.rect(1, 4, 5, 14, bag); s.line([(3, 14), (6, 30)], dark)
    s.rect(2, 44, 11, 45, pole); s.px(2, 46, dark); s.px(11, 46, dark)
    return s.finish(outline=0.3)


def wheelchair():
    s = Sprite(26, 24)
    frame = s.material('#6e7276', 12); seat = s.material('#2e3e4a', 14, 0.1)
    tyre = s.material('#1c1c1c', 6)
    s.rect(4, 0, 6, 12, frame); s.rect(4, 10, 18, 13, seat); s.rect(4, 4, 6, 12, seat)
    s.ellipse(1, 9, 15, 23, tyre); s.ellipse(4, 12, 12, 20, frame); s.ellipse(6, 14, 10, 18, tyre)
    s.ellipse(19, 18, 24, 23, tyre); s.line([(17, 13), (21, 19)], frame)
    return s.finish(outline=0.3)


def desk_monitor():
    s = Sprite(58, 42)
    wood = _wood(s, '#4e4234'); dark = s.material('#1c1a18', 8)
    case_ = s.material('#6a6a62', 10); screen = s.material('#1e2a2e', 10, 0.2)
    paper = s.material('#a8a48c', 12)
    s.rect(0, 20, 57, 24, wood); s.rect(2, 24, 6, 41, wood); s.rect(44, 24, 55, 41, wood)
    s.rect(45, 27, 54, 32, dark); s.rect(45, 34, 54, 39, dark)
    s.rect(10, 2, 34, 18, case_); s.rect(12, 4, 32, 16, screen)
    s.poly([(12, 4), (20, 4), (12, 11)], s.material('#3a4a50', 10))
    s.rect(20, 18, 24, 20, case_)
    s.rect(36, 17, 46, 19, paper); s.rect(38, 15, 47, 17, paper)
    s.shade_gradient('x', 0.2)
    return s.finish()


def office_chair():
    s = Sprite(20, 30)
    seat = s.material('#2a2c32', 14, 0.1); metal = s.material('#5a5c60', 10)
    s.rect(2, 0, 8, 16, seat); s.rect(2, 14, 17, 18, seat)
    s.rect(9, 18, 10, 25, metal); s.rect(3, 26, 16, 27, metal)
    s.px(3, 28, metal); s.px(16, 28, metal)
    return s.finish()


def filing_cabinet():
    s = Sprite(22, 42)
    body = s.material('#5a6058', 12, 0.08); drawer = s.material('#4a4e48', 10)
    handle = s.material('#9a9a90', 6); rust = s.material('#6a3c22', 18, 0.15)
    s.rect(0, 0, 21, 41, body)
    for y in (3, 16, 29):
        s.rect(2, y, 19, y + 10, drawer); s.rect(8, y + 4, 13, y + 5, handle)
    s.rect(2, 16, 19, 22, s.material('#14140f', 6))               # drawer hanging open
    s.ellipse(14, 33, 20, 40, rust)
    s.shade_gradient('x', 0.25)
    return s.finish()


def machine():
    s = Sprite(62, 56)
    body = s.material('#4a5248', 14, 0.10); dark = s.material('#1c1e1c', 8)
    panel = s.material('#2a302a', 10); rust = s.material('#7a4022', 22, 0.18)
    warn = s.material('#b08a2a', 12); pipe = s.material('#5a5e5a', 10)
    s.rect(2, 16, 59, 55, body); s.rect(6, 22, 34, 40, panel)
    for y in range(24, 40, 4):
        s.rect(8, y, 32, y, dark)
    s.ellipse(40, 22, 54, 36, dark); s.ellipse(43, 25, 51, 33, pipe)
    s.rect(14, 4, 20, 16, pipe); s.rect(12, 0, 22, 4, pipe)       # exhaust
    for x in range(2, 59, 8):
        s.rect(x, 50, x + 3, 54, warn)
    s.ellipse(44, 40, 58, 50, rust); s.ellipse(4, 44, 12, 52, rust)
    s.shade_gradient('x', 0.22)
    return s.finish()


def conveyor():
    s = Sprite(32, 14)
    belt = s.material('#262624', 10); roller = s.material('#5a5a56', 10)
    leg = s.material('#3e423e', 10)
    s.rect(0, 0, 31, 5, belt)
    for x in (2, 12, 22):
        s.ellipse(x, 1, x + 5, 6, roller)
    s.rect(4, 6, 6, 13, leg); s.rect(25, 6, 27, 13, leg)
    return s.finish(outline=0.2)


def store_shelf(stock=('#8a3a2a', '#3a6a8a', '#c4a43a', '#4a7a3a'), medicine=False):
    s = Sprite(46, 54)
    metal = s.material('#5a5e62', 10, 0.06); back = s.material('#2e3034', 10)
    items = [s.material(c, 14, 0.05) for c in stock]
    s.rect(0, 0, 45, 53, back)
    s.rect(0, 0, 2, 53, metal); s.rect(43, 0, 45, 53, metal)
    for i, y in enumerate((14, 30, 46)):
        s.rect(0, y, 45, y + 2, metal)
        x = 4
        while x < 40:
            if RNG.random() < 0.28:                      # mostly looted already
                m = items[int(RNG.integers(0, len(items)))]
                hgt = 5 if medicine else int(RNG.integers(5, 10))
                wid = 3 if medicine else int(RNG.integers(3, 7))
                s.rect(x, y - hgt, x + wid - 1, y - 1, m)
                x += wid + 1
            else:
                x += 7
    # a few items knocked onto the floor
    for x in (6, 30):
        s.rect(x, 51, x + 4, 53, items[0])
    s.shade_gradient('x', 0.2)
    return s.finish(outline=0.3)


def mannequin():
    s = Sprite(16, 50)
    body = s.material('#b8ae9a', 10, 0.05); stand = s.material('#3a3a3a', 8)
    cloth = s.material('#6a2a3a', 16, 0.08)
    s.ellipse(5, 0, 11, 7, body); s.rect(7, 7, 8, 9, body)
    s.rect(3, 9, 12, 28, cloth); s.rect(1, 10, 2, 22, body)          # one arm missing
    s.rect(5, 28, 10, 34, body)
    s.rect(7, 34, 8, 46, stand); s.rect(3, 46, 12, 48, stand)
    return s.finish(outline=0.35)


def sofa():
    s = Sprite(56, 28)
    fab = s.material('#5a3a3a', 18, 0.12); cush = s.material('#6e4a44', 16, 0.1)
    wood = _wood(s, '#3a2614'); tear = s.material('#b0a080', 10)
    s.rect(2, 2, 53, 16, fab); s.rect(0, 8, 6, 24, fab); s.rect(49, 8, 55, 24, fab)
    s.rect(6, 14, 49, 22, cush); s.rect(27, 14, 28, 22, fab)
    s.ellipse(34, 15, 40, 19, tear)
    s.rect(2, 24, 5, 27, wood); s.rect(50, 24, 53, 27, wood)
    s.shade_gradient('x', 0.2)
    return s.finish()


def table_chairs():
    s = Sprite(56, 30)
    wood = _wood(s, '#5a3c22'); wood2 = _wood(s, '#4a3018')
    cloth = s.material('#7a6a50', 14, 0.08); can = s.material('#8a8a80', 10)
    s.rect(12, 12, 43, 15, wood); s.rect(14, 15, 16, 29, wood); s.rect(39, 15, 41, 29, wood)
    s.rect(18, 9, 22, 11, can); s.rect(30, 10, 34, 11, cloth)
    for x0, back in ((0, 0), (46, 9)):
        s.rect(x0, 17, x0 + 9, 19, wood2)
        s.rect(x0 + back, 4, x0 + back + 1, 29, wood2)
        s.rect(x0 + (9 - back), 19, x0 + (9 - back) + 1, 29, wood2)
    s.shade_gradient('x', 0.2)
    return s.finish()


def bookshelf():
    s = Sprite(34, 52)
    wood = _wood(s, '#4a3018'); back = s.material('#22160c', 8)
    books = [s.material(c, 14, 0.05) for c in ('#6a2a22', '#2a4a6a', '#5a5a2a', '#3a5a3a', '#7a6a4a')]
    s.rect(0, 0, 33, 51, wood); s.rect(3, 3, 30, 48, back)
    for y in (16, 32, 48):
        s.rect(3, y, 30, y + 1, wood)
        x = 4
        while x < 29:
            if RNG.random() < 0.33:
                hgt = int(RNG.integers(7, 12)); wid = int(RNG.integers(2, 4))
                s.rect(x, y - hgt, x + wid - 1, y - 1, books[int(RNG.integers(0, len(books)))])
                x += wid
            else:
                x += 5
    s.line([(6, 50), (14, 46)], books[0], width=2)                 # fallen book
    s.shade_gradient('x', 0.2)
    return s.finish()


def pew():
    s = Sprite(72, 24)
    wood = _wood(s, '#4a2e18'); dark = _wood(s, '#34200f')
    s.rect(0, 0, 71, 4, wood); s.rect(0, 0, 3, 23, dark); s.rect(68, 0, 71, 23, dark)
    s.rect(0, 12, 71, 15, wood); s.rect(4, 4, 67, 12, dark)
    s.clear(30, 12, 38, 15)                                         # broken seat plank
    s.line([(30, 15), (34, 23)], wood, width=2)
    s.shade_gradient('x', 0.2)
    return s.finish()


def church_cross():
    s = Sprite(44, 88)
    wood = _wood(s, '#4a3018'); cloth = s.material('#3a3430', 14, 0.1)
    wax = s.material('#c8bc98', 8); flame = s.material('#ffd060', 6, 0)
    rope = s.material('#7a6a4a', 10); body = s.material('#2a2420', 10)
    s.rect(20, 2, 24, 87, wood); s.rect(4, 16, 40, 20, wood)
    # slumped figure bound to the cross (Singularity cult)
    s.ellipse(18, 18, 26, 26, body)
    s.poly([(17, 26), (27, 26), (26, 52), (18, 52)], cloth)
    s.line([(18, 27), (6, 20)], body, width=2); s.line([(26, 27), (38, 20)], body, width=2)
    s.rect(19, 52, 21, 66, body); s.rect(23, 52, 25, 66, body)
    s.rect(4, 18, 8, 21, rope); s.rect(36, 18, 40, 21, rope)
    for x in (4, 10, 32, 38):
        h = int(RNG.integers(6, 11))
        s.rect(x, 87 - h, x + 2, 87, wax); s.px(x + 1, 86 - h, flame)
    return s.finish()


def rubble_small():
    return debris()


# ── Shelter furniture ──────────────────────────────────────────────────────

def barrel():
    s = Sprite(20, 26)
    steel = s.material('#3a4e5a', 14, 0.10); band = s.material('#26343e', 8)
    rust = s.material('#7a4a2a', 18, 0.15)
    s.rect(1, 2, 18, 25, steel); s.rect(0, 0, 19, 3, band)
    s.rect(1, 9, 18, 10, band); s.rect(1, 17, 18, 18, band)
    s.ellipse(11, 19, 17, 24, rust)
    s.shade_gradient('x', 0.3)
    return s.finish()


def water_jug():
    s = Sprite(14, 22)
    plastic = s.material('#3a6a8a', 12, 0.06); cap = s.material('#2a3a4a', 8)
    water = s.material('#5a8aa8', 10, 0.04); label = s.material('#b0a890', 8)
    s.rect(1, 6, 12, 21, plastic); s.rect(1, 10, 12, 21, water)
    s.rect(4, 2, 9, 5, cap); s.rect(2, 13, 11, 16, label)
    s.line([(2, 6), (4, 2)], cap)
    s.shade_gradient('x', 0.3)
    return s.finish(outline=0.35)


def camp_stove():
    s = Sprite(26, 20)
    metal = s.material('#3a3a38', 12, 0.08); grate = s.material('#5a5a56', 8)
    pot = s.material('#5a5e62', 12, 0.06); flame = s.material('#e0702a', 10, 0)
    s.rect(1, 11, 24, 19, metal); s.rect(3, 9, 22, 10, grate)
    s.rect(6, 2, 19, 8, pot); s.rect(4, 2, 6, 3, pot); s.rect(19, 2, 21, 3, pot)
    s.rect(9, 9, 16, 10, flame)
    s.shade_gradient('x', 0.25)
    return s.finish()


def bed(upgraded=False):
    w = 54 if upgraded else 46
    s = Sprite(w, 22)
    frame = _wood(s, '#4a3420' if upgraded else '#3a2a18')
    mat = s.material('#5a4a60' if upgraded else '#4a4038', 16, 0.1)
    blanket = s.material('#4a5a3a' if upgraded else '#5a4a3a', 18, 0.12)
    pillow = s.material('#8a8070', 12)
    s.rect(0, 0, 3, 21, frame)
    if upgraded:
        s.rect(w - 4, 6, w - 1, 21, frame)
    s.rect(2, 10, w - 2, 15, mat); s.rect(15, 8, w - 3, 14, blanket)
    s.rect(4, 7, 13, 11, pillow)
    s.rect(2, 15, w - 2, 17, frame)
    s.rect(3, 17, 5, 21, frame); s.rect(w - 6, 17, w - 4, 21, frame)
    s.shade_gradient('x', 0.2)
    return s.finish()


def nightstand():
    s = Sprite(12, 20)
    wood = _wood(s, '#4a3420'); wax = s.material('#d0c4a0', 8); flame = s.material('#ffd060', 6, 0)
    s.rect(0, 8, 11, 19, wood); s.rect(2, 11, 9, 12, s.material('#22160c', 6))
    s.rect(5, 2, 7, 7, wax); s.px(6, 1, flame)
    return s.finish()


def storage_shelf():
    s = Sprite(44, 58)
    wood = _wood(s, '#5a4028'); back = s.material('#1e1610', 8)
    can = s.material('#8a8a7a', 10); box = s.material('#7a5a32', 16, 0.1)
    jar = s.material('#6a8a5a', 12)
    s.rect(0, 0, 43, 57, back); s.rect(0, 0, 2, 57, wood); s.rect(41, 0, 43, 57, wood)
    for y in (18, 37, 56):
        s.rect(0, y, 43, y + 1, wood)
    for x in range(4, 38, 5):
        s.rect(x, 12, x + 3, 17, can)
    s.rect(4, 26, 18, 36, box); s.rect(21, 29, 34, 36, box)
    for x in (5, 12, 19, 26):
        s.rect(x, 48, x + 4, 55, jar)
    s.shade_gradient('x', 0.2)
    return s.finish()


def crates():
    s = Sprite(40, 34)
    wood = _wood(s, '#6a4a2a'); slat = _wood(s, '#4a3018')
    s.rect(0, 12, 22, 33, wood); s.rect(22, 18, 39, 33, wood); s.rect(5, 0, 21, 12, wood)
    for (x0, y0, x1, y1) in ((0, 12, 22, 33), (22, 18, 39, 33), (5, 0, 21, 12)):
        s.rect(x0, y0, x1, y0 + 1, slat); s.rect(x0, y1 - 1, x1, y1, slat)
        s.line([(x0, y0), (x1, y1)], slat)
    s.shade_gradient('x', 0.2)
    return s.finish()


def workbench():
    s = Sprite(60, 40)
    wood = _wood(s, '#5a3e22'); metal = s.material('#6a6e72', 10); dark = s.material('#1e1a14', 8)
    board = s.material('#3a2c1c', 12)
    s.rect(4, 0, 55, 14, board)                                    # pegboard
    for x in range(8, 52, 6):
        s.px(x, 3, dark); s.px(x, 9, dark)
    s.line([(10, 2), (10, 12)], metal, width=2); s.rect(16, 4, 22, 6, metal)
    s.line([(30, 3), (36, 11)], metal); s.rect(44, 2, 46, 12, wood)
    s.rect(0, 16, 59, 20, wood); s.rect(2, 20, 5, 39, wood); s.rect(54, 20, 57, 39, wood)
    s.rect(6, 30, 53, 32, wood)
    s.rect(40, 12, 48, 16, metal)                                   # vice
    s.rect(10, 26, 20, 29, s.material('#8a3a2a', 12))               # toolbox
    s.shade_gradient('x', 0.2)
    return s.finish()


def med_cabinet():
    s = Sprite(26, 44)
    body = s.material('#9a9a8e', 10, 0.06); glass = s.material('#3a4a4a', 12, 0.15)
    red = s.material('#a02a22', 8, 0); bottle = s.material('#7a5a2a', 12)
    s.rect(0, 0, 25, 43, body); s.rect(3, 10, 22, 40, glass)
    s.rect(10, 2, 15, 8, red); s.rect(8, 4, 17, 6, red)
    for y in (20, 30, 40):
        s.rect(3, y, 22, y, body)
    for x in (5, 9, 15):
        s.rect(x, 14, x + 2, 19, bottle)
    s.shade_gradient('x', 0.2)
    return s.finish()


def cot():
    s = Sprite(50, 18)
    canvas = s.material('#5a6448', 16, 0.1); metal = s.material('#6a6e66', 10)
    blanket = s.material('#8a7a5a', 14, 0.1)
    s.rect(0, 6, 49, 10, canvas); s.rect(24, 4, 46, 9, blanket)
    s.line([(2, 10), (8, 17)], metal); s.line([(8, 10), (2, 17)], metal)
    s.line([(41, 10), (47, 17)], metal); s.line([(47, 10), (41, 17)], metal)
    return s.finish(outline=0.3)


def radio_desk():
    s = Sprite(52, 38)
    wood = _wood(s, '#4a3a2a'); radio = s.material('#3a3e34', 12, 0.08)
    dial = s.material('#c0a040', 8); screen = s.material('#2a4a2a', 10, 0.1)
    led = s.material('#40c040', 6, 0); dark = s.material('#161410', 8)
    s.rect(0, 16, 51, 19, wood); s.rect(2, 19, 5, 37, wood); s.rect(46, 19, 49, 37, wood)
    s.rect(4, 4, 26, 15, radio); s.ellipse(7, 7, 13, 13, dark); s.ellipse(9, 9, 11, 11, dial)
    s.rect(16, 7, 24, 10, screen); s.px(22, 12, led)
    s.line([(24, 4), (30, 0)], dark)                                 # antenna
    s.rect(30, 6, 46, 15, radio); s.rect(32, 8, 44, 13, screen)      # monitor
    return s.finish()


def gun_rack():
    s = Sprite(30, 44)
    wood = _wood(s, '#4a3018'); metal = s.material('#3a3c3e', 10); stock = _wood(s, '#6a4424')
    s.rect(0, 0, 29, 3, wood); s.rect(0, 38, 29, 43, wood)
    for x in (5, 14, 23):
        s.rect(x, 4, x + 1, 30, metal); s.rect(x - 1, 28, x + 2, 38, stock)
    s.rect(0, 0, 2, 43, wood); s.rect(27, 0, 29, 43, wood)
    return s.finish()


def sandbags():
    s = Sprite(44, 18)
    bag = s.material('#7a6a4a', 16, 0.1); bag2 = s.material('#6a5a3a', 16, 0.1)
    for i, x in enumerate(range(0, 40, 11)):
        s.ellipse(x, 9, x + 12, 17, bag if i % 2 else bag2)
    for i, x in enumerate(range(5, 34, 11)):
        s.ellipse(x, 1, x + 12, 10, bag2 if i % 2 else bag)
    s.shade_gradient('y', 0.25)
    return s.finish()


# ════════════════════════════════════════════════════════════════════════════
# Tileable textures (walls / floors). Grain is per-pixel so tiles seam cleanly;
# any lines repeat with periods that divide the tile size.
# ════════════════════════════════════════════════════════════════════════════

def tex(size, base, joint, pattern, grain=10):
    s = Sprite(size, size)
    a = s.material(base, grain, 0.06)
    j = s.material(joint, 6, 0.02)
    s.rect(0, 0, size - 1, size - 1, a)
    pattern(s, j, size)
    return s.finish(outline=0.0, grain_scale=0.8)


def _bricks(bw, bh):
    def f(s, j, n):
        for y in range(0, n, bh):
            s.rect(0, y, n - 1, y, j)
            off = 0 if (y // bh) % 2 == 0 else bw // 2
            for x in range(off, n, bw):
                s.rect(x, y, x, y + bh - 1, j)
    return f


def _tiles(t):
    def f(s, j, n):
        for k in range(0, n, t):
            s.rect(0, k, n - 1, k, j); s.rect(k, 0, k, n - 1, j)
    return f


def _planks(ph, vertical=False):
    def f(s, j, n):
        for k in range(0, n, ph):
            if vertical:
                s.rect(k, 0, k, n - 1, j)
            else:
                s.rect(0, k, n - 1, k, j)
                s.px((k * 7) % n, k + ph // 2, j)               # nail / knot
    return f


def _plain(s, j, n):
    for _ in range(6):
        x, y = int(RNG.integers(0, n)), int(RNG.integers(0, n))
        s.rect(x, y, min(n - 1, x + 1), y, j)



# ════════════════════════════════════════════════════════════════════════════
# Items (ground loot + inventory icons). Real-world scale next to a 48px person.
# ════════════════════════════════════════════════════════════════════════════

def _item(w, h):
    return Sprite(w, h)


def it_can(label, tall=False, open_=False, steam=False):
    h = 11 if tall else 9
    s = _item(9, h + (3 if steam else 0))
    y0 = 3 if steam else 0
    tin = s.material('#9a9a90', 10, 0.05); lab = s.material(label, 12, 0.05)
    rim = s.material('#6a6a62', 8)
    s.rect(0, y0, 8, y0 + h - 1, tin); s.rect(0, y0 + 2, 8, y0 + h - 3, lab)
    s.rect(0, y0, 8, y0, rim); s.rect(0, y0 + h - 1, 8, y0 + h - 1, rim)
    if open_:
        s.rect(1, y0, 7, y0, s.material('#3a2a1a', 8))
    if steam:
        st = s.material('#c8c8c0', 6, 0)
        s.px(2, 1, st); s.px(3, 0, st); s.px(6, 2, st); s.px(5, 1, st)
    s.shade_gradient('x', 0.3)
    return s.finish(outline=0.4)


def it_bottle(liquid, cap='#2a4a6a'):
    s = _item(6, 14)
    plast = s.material('#a8b8c0', 8, 0.03); liq = s.material(liquid, 12, 0.05); c = s.material(cap, 8)
    s.rect(2, 0, 3, 1, c); s.rect(1, 2, 4, 3, plast); s.rect(0, 4, 5, 13, plast); s.rect(0, 6, 5, 13, liq)
    s.rect(0, 8, 5, 9, s.material('#e0dcc8', 8))
    s.shade_gradient('x', 0.3)
    return s.finish(outline=0.35)


def it_pills(body, lid='#e8e4d8'):
    s = _item(6, 9)
    b = s.material(body, 12, 0.05); l = s.material(lid, 8); lab = s.material('#e0dcc8', 8)
    s.rect(0, 0, 5, 2, l); s.rect(0, 3, 5, 8, b); s.rect(0, 4, 5, 6, lab)
    return s.finish(outline=0.35)


def it_syringe():
    s = _item(14, 5)
    glass = s.material('#b8d0d0', 8); liq = s.material('#5ac0a0', 10, 0); metal = s.material('#9a9a9a', 6)
    s.rect(0, 1, 2, 3, metal); s.rect(3, 0, 10, 4, glass); s.rect(4, 1, 9, 3, liq); s.rect(11, 2, 13, 2, metal)
    return s.finish(outline=0.3)


def it_bandage():
    s = _item(10, 8)
    w = s.material('#d8d4c4', 10, 0.04); r = s.material('#a03a2a', 10)
    s.ellipse(0, 0, 9, 7, w); s.ellipse(3, 2, 6, 5, s.material('#a8a494', 8)); s.px(8, 3, r)
    return s.finish(outline=0.35)


def it_medkit():
    s = _item(14, 10)
    box = s.material('#c8c4b8', 10, 0.05); red = s.material('#b02a22', 8, 0); h = s.material('#4a4a4a', 8)
    s.rect(5, 0, 8, 1, h); s.rect(0, 2, 13, 9, box)
    s.rect(6, 3, 7, 8, red); s.rect(4, 5, 9, 6, red)
    s.shade_gradient('x', 0.25)
    return s.finish(outline=0.4)


def it_meat(raw):
    s = _item(12, 7)
    m = s.material('#a83a2a' if raw else '#7a3a1a', 14, 0.08); fat = s.material('#e0c8a8' if raw else '#b08050', 10)
    bone = s.material('#e8e0cc', 6)
    s.ellipse(0, 0, 10, 6, m); s.ellipse(2, 1, 6, 3, fat); s.rect(9, 2, 11, 3, bone)
    return s.finish(outline=0.4)


def it_bowl(soup):
    s = _item(12, 9)
    bowl = s.material('#8a6a4a', 12, 0.05); liq = s.material(soup, 12, 0.05); st = s.material('#c8c8c0', 6, 0)
    s.ellipse(0, 3, 11, 8, liq); s.poly([(0, 5), (11, 5), (9, 8), (2, 8)], bowl)
    s.px(3, 1, st); s.px(4, 0, st); s.px(8, 1, st)
    return s.finish(outline=0.35)


def it_berries():
    s = _item(10, 6)
    b = s.material('#6a2a4a', 14, 0.05); leaf = s.material('#4a6a2a', 12)
    for (x, y) in [(0, 3), (3, 2), (6, 3), (2, 0), (5, 0), (8, 2)]:
        s.ellipse(x, y, x + 2, y + 2, b)
    s.rect(4, 0, 5, 1, leaf)
    return s.finish(outline=0.3)


def it_bar():
    s = _item(12, 5)
    wrap = s.material('#c48a2a', 12, 0.05); stripe = s.material('#5a2a1a', 8)
    s.rect(1, 0, 10, 4, wrap); s.rect(0, 1, 0, 3, wrap); s.rect(11, 1, 11, 3, wrap); s.rect(3, 2, 8, 2, stripe)
    return s.finish(outline=0.35)


def it_jerky():
    s = _item(12, 6)
    j = s.material('#6a3a1a', 16, 0.1)
    s.line([(0, 4), (11, 1)], j, width=2); s.line([(1, 5), (10, 4)], j, width=2)
    return s.finish(outline=0.3)


def it_weapon(kind):
    sizes = {'bat': (28, 6), 'crowbar': (24, 6), 'knife': (14, 4), 'machete': (22, 5), 'pipe': (24, 4),
             'pistol': (14, 8), 'rifle': (34, 8), 'shotgun': (32, 8), 'spear': (38, 5), 'axe': (24, 10)}
    w, h = sizes[kind]
    s = _item(w, h)
    wood = s.material('#7a5030', 14, 0.08); steel = s.material('#8a8e92', 10, 0.04)
    dark = s.material('#2a2c2e', 8); grip = s.material('#3a2a1a', 10); rust = s.material('#7a4a2a', 14)
    if kind == 'bat':
        s.poly([(0, 2), (20, 0), (27, 0), (27, 5), (20, 5), (0, 3)], wood); s.rect(0, 1, 3, 4, grip)
    elif kind == 'crowbar':
        s.rect(0, 2, 21, 3, rust); s.line([(21, 2), (23, 0)], rust); s.line([(0, 3), (0, 5)], rust)
    elif kind == 'knife':
        s.rect(0, 1, 4, 3, grip); s.poly([(5, 1), (13, 1), (11, 3), (5, 3)], steel)
    elif kind == 'machete':
        s.rect(0, 1, 5, 3, grip); s.poly([(6, 0), (19, 0), (21, 2), (19, 4), (6, 3)], steel)
    elif kind == 'pipe':
        s.rect(0, 1, 23, 2, steel); s.rect(0, 0, 2, 3, dark); s.rect(21, 0, 23, 3, dark)
    elif kind == 'pistol':
        s.rect(0, 0, 13, 2, dark); s.rect(1, 3, 4, 7, grip); s.rect(5, 3, 7, 4, dark)
    elif kind == 'rifle':
        s.poly([(0, 3), (9, 2), (9, 6), (0, 7)], wood); s.rect(9, 2, 33, 3, dark); s.rect(10, 4, 22, 5, wood)
        s.rect(14, 0, 18, 1, dark)
    elif kind == 'shotgun':
        s.poly([(0, 3), (8, 2), (8, 6), (0, 7)], wood); s.rect(8, 2, 31, 4, dark); s.rect(14, 5, 22, 6, wood)
    elif kind == 'spear':
        s.rect(0, 2, 30, 2, wood); s.poly([(30, 0), (37, 2), (30, 4)], steel); s.rect(28, 1, 30, 3, grip)
    elif kind == 'axe':
        s.rect(0, 4, 19, 5, wood); s.rect(0, 3, 3, 6, grip)
        s.poly([(17, 1), (21, 0), (23, 0), (23, 9), (21, 9), (17, 7)], steel); s.rect(16, 3, 18, 6, dark)
    return s.finish(outline=0.35)


def it_ammo(label):
    s = _item(10, 7)
    box = s.material('#5a5a3a', 12, 0.05); lab = s.material(label, 10); brass = s.material('#c8a040', 8)
    s.rect(0, 1, 9, 6, box); s.rect(1, 3, 8, 4, lab); s.rect(2, 0, 3, 0, brass); s.rect(6, 0, 7, 0, brass)
    return s.finish(outline=0.4)


def it_pack(color, size):
    w, h = {'small': (10, 12), 'reg': (12, 15), 'mil': (14, 17)}[size]
    s = _item(w, h)
    c = s.material(color, 14, 0.08); strap = s.material('#2a2418', 8); pocket = s.material(color, 18, 0.1)
    s.ellipse(0, 0, w - 1, h - 1, c); s.rect(0, 3, w - 1, h - 1, c)
    s.rect(2, h // 2, w - 3, h - 2, pocket); s.rect(2, h // 2, w - 3, h // 2, strap)
    s.rect(w // 2 - 1, 0, w // 2, 2, strap)
    s.shade_gradient('x', 0.3)
    return s.finish(outline=0.4)


def it_simple(kind):
    if kind == 'chemicals':
        s = _item(9, 12); j = s.material('#c8c0a0', 10); l = s.material('#6a8a2a', 10)
        s.rect(0, 3, 8, 11, j); s.rect(5, 0, 7, 2, j); s.rect(1, 6, 7, 8, l)
    elif kind == 'cloth':
        s = _item(12, 6); c = s.material('#7a6a5a', 16, 0.08); c2 = s.material('#5a4a3a', 14)
        s.rect(0, 2, 11, 5, c); s.rect(1, 0, 10, 2, c2)
    elif kind == 'electronics':
        s = _item(12, 8); b = s.material('#2a5a3a', 10); chip = s.material('#1a1a1a', 6); cu = s.material('#c8a040', 6, 0)
        s.rect(0, 0, 11, 7, b); s.rect(3, 2, 6, 5, chip); s.px(9, 2, cu); s.px(9, 5, cu); s.px(1, 6, cu)
    elif kind == 'fuel':
        s = _item(11, 13); r = s.material('#8a2a1a', 14, 0.08); cap = s.material('#2a2a2a', 6)
        s.rect(0, 2, 10, 12, r); s.rect(1, 0, 4, 1, cap); s.line([(1, 4), (9, 10)], s.material('#6a1a10', 8))
    elif kind == 'metal':
        s = _item(14, 6); m = s.material('#7a7e80', 12, 0.08); r = s.material('#7a4a2a', 14, 0.1)
        s.poly([(0, 5), (4, 1), (13, 2), (12, 5)], m); s.rect(5, 2, 8, 4, r)
    elif kind == 'tools':
        s = _item(14, 8); st = s.material('#8a8e92', 8); h = s.material('#8a3a2a', 10)
        s.line([(0, 7), (8, 1)], st, width=2); s.rect(8, 0, 11, 2, st); s.rect(10, 3, 13, 7, h)
    elif kind == 'batteries':
        s = _item(9, 7); b = s.material('#2a2a2a', 8); t = s.material('#c8a040', 8)
        s.rect(0, 1, 3, 6, b); s.rect(5, 1, 8, 6, b); s.rect(0, 1, 3, 2, t); s.rect(5, 1, 8, 2, t)
    elif kind == 'book':
        s = _item(10, 8); c = s.material('#5a2a2a', 12, 0.06); pg = s.material('#d8d0b8', 8)
        s.rect(0, 0, 9, 7, c); s.rect(1, 6, 9, 7, pg)
    elif kind == 'matches':
        s = _item(9, 5); b = s.material('#c8a040', 10); r = s.material('#a02a22', 8)
        s.rect(0, 0, 8, 4, b); s.rect(0, 2, 8, 2, r)
    elif kind == 'photograph':
        s = _item(9, 7); f = s.material('#e0dcc8', 8); im = s.material('#6a5a4a', 14, 0.1)
        s.rect(0, 0, 8, 6, f); s.rect(1, 1, 7, 4, im)
    elif kind == 'toy':
        s = _item(9, 10); f = s.material('#9a6a3a', 14, 0.08); d = s.material('#2a1a10', 6)
        s.ellipse(2, 0, 7, 5, f); s.ellipse(1, 4, 8, 9, f); s.ellipse(1, 0, 3, 2, f); s.ellipse(6, 0, 8, 2, f)
        s.px(3, 2, d); s.px(6, 2, d)
    elif kind == 'map':
        s = _item(12, 8); p_ = s.material('#c8b890', 10, 0.05); ln = s.material('#6a5a3a', 8); r = s.material('#a02a22', 6, 0)
        s.rect(0, 0, 11, 7, p_); s.rect(4, 0, 4, 7, ln); s.rect(8, 0, 8, 7, ln); s.line([(1, 6), (6, 2), (10, 3)], r)
    elif kind == 'note':
        s = _item(8, 9); p_ = s.material('#d8d0b8', 8, 0.05); ln = s.material('#6a6a6a', 6)
        s.rect(0, 0, 7, 8, p_)
        for y in (2, 4, 6):
            s.rect(1, y, 6, y, ln)
    elif kind == 'flashlight':
        s = _item(14, 6); body = s.material('#3a3c40', 10); lens = s.material('#e8e0a0', 6, 0); grip = s.material('#2a2a2a', 8)
        s.rect(0, 1, 9, 4, body); s.rect(9, 0, 12, 5, body); s.rect(13, 1, 13, 4, lens); s.rect(2, 1, 6, 4, grip)
    elif kind == 'blueprint':
        s = _item(12, 6); b = s.material('#2a4a7a', 10); ln = s.material('#a8c0e0', 6)
        s.rect(0, 0, 11, 5, b); s.ellipse(0, 0, 3, 5, s.material('#3a5a8a', 10)); s.line([(4, 1), (10, 4)], ln)
    else:
        raise KeyError(kind)
    return s.finish(outline=0.35)


def it_top(base, kind='hoodie', trim=None):
    """Chest clothing: hoodie, shirt, jackets, coat, vest."""
    s = _item(16, 14)
    c = s.material(base, 14, 0.06)
    dark = s.material(trim or '#2a2a2a', 10, 0.04)
    if kind == 'vest':
        # sleeveless slab with straps and plate seams
        s.rect(2, 0, 4, 2, c); s.rect(9, 0, 11, 2, c)
        s.rect(1, 2, 12, 12, c)
        s.rect(5, 0, 8, 2, dark)                 # neck hole
        s.rect(1, 6, 12, 6, dark); s.rect(3, 8, 10, 11, s.material('#3a3e34', 10, 0.04))
        s.rect(5, 3, 8, 4, s.material('#d8d8c8', 6, 0))   # patch
        s.shade_gradient('x', 0.3)
        return s.finish(outline=0.4)
    s.rect(4, 1, 11, 13, c)                      # torso
    s.rect(3, 1, 12, 3, c)                       # shoulders
    s.poly([(3, 1), (0, 9), (2, 10), (4, 5)], c)  # sleeves
    s.poly([(12, 1), (15, 9), (13, 10), (11, 5)], c)
    s.rect(6, 0, 9, 1, dark)                     # collar
    if kind == 'hoodie':
        s.ellipse(5, 0, 10, 3, dark); s.rect(5, 8, 10, 10, dark)   # hood + pocket
    elif kind == 'shirt':
        chk = s.material(trim or '#5a1a14', 8, 0.02)
        for y in range(2, 13, 3):
            s.rect(4, y, 11, y, chk)
        for x in (5, 8, 11):
            s.rect(x, 2, x, 13, chk)
        s.rect(7, 0, 8, 2, s.material('#d8d0c0', 6, 0))
    elif kind == 'jacket':
        s.rect(7, 1, 8, 13, dark); s.poly([(5, 1), (7, 1), (7, 5)], dark); s.poly([(8, 1), (10, 1), (8, 5)], dark)
        s.rect(4, 12, 11, 13, dark)
    elif kind == 'coat':
        for y in (4, 7, 10):
            s.rect(4, y, 11, y, dark)
        s.rect(7, 1, 8, 13, dark)
    s.shade_gradient('x', 0.3)
    return s.finish(outline=0.4)


def it_pants(base, cargo=False, trim='#2a2a2a'):
    s = _item(10, 14)
    c = s.material(base, 14, 0.06); d = s.material(trim, 10, 0.04)
    s.rect(0, 0, 9, 2, c)                        # waist
    s.poly([(0, 2), (4, 2), (4, 13), (0, 13)], c)
    s.poly([(5, 2), (9, 2), (9, 13), (5, 13)], c)
    s.rect(0, 0, 9, 0, d)
    s.clear(4, 4, 5, 13)
    if cargo:
        s.rect(0, 6, 2, 8, d); s.rect(7, 6, 9, 8, d)
    else:
        s.rect(1, 1, 2, 2, d); s.rect(7, 1, 8, 2, d)
    s.shade_gradient('x', 0.25)
    return s.finish(outline=0.4)


ITEM_ART = {
    'canned_beans': lambda: it_can('#a04a2a'), 'canned_soup': lambda: it_can('#c8a040'),
    'canned_meat': lambda: it_can('#8a2a2a'), 'canned_fruit': lambda: it_can('#c86a2a'),
    'heated_beans': lambda: it_can('#a04a2a', open_=True, steam=True),
    'dog_food': lambda: it_can('#4a6a3a'),
    'cooked_meat': lambda: it_meat(False), 'raw_meat': lambda: it_meat(True),
    'cooked_soup': lambda: it_bowl('#c8a040'), 'heated_soup': lambda: it_bowl('#b07030'),
    'dried_berries': it_berries, 'energy_bar': it_bar, 'jerky': it_jerky,
    'water_bottle': lambda: it_bottle('#5a8ab0'), 'purified_water': lambda: it_bottle('#8ac0e0', '#2a6a4a'),
    'dirty_water': lambda: it_bottle('#7a6a3a', '#4a3a2a'),
    'painkiller': lambda: it_pills('#c8c4b8'), 'antibiotics': lambda: it_pills('#c87a2a'),
    'antiviral': it_syringe, 'bandage': it_bandage, 'medkit': it_medkit,
    'pistol_ammo': lambda: it_ammo('#c8a040'), 'rifle_ammo': lambda: it_ammo('#a03a2a'),
    'shotgun_ammo': lambda: it_ammo('#2a5aa0'),
    'small_backpack': lambda: it_pack('#6a5a3a', 'small'), 'backpack': lambda: it_pack('#3a4a5a', 'reg'),
    'mil_backpack': lambda: it_pack('#4a5a2a', 'mil'),
    # clothing
    'hoodie': lambda: it_top('#5a5e62', 'hoodie', '#3a3c40'),
    'flannel_shirt': lambda: it_top('#8a2e24', 'shirt', '#4a1410'),
    'leather_jacket': lambda: it_top('#3a2a20', 'jacket', '#1e1410'),
    'work_jacket': lambda: it_top('#8a6a3a', 'jacket', '#4a3a1e'),
    'padded_coat': lambda: it_top('#3a4a3a', 'coat', '#243024'),
    'bulletproof_vest': lambda: it_top('#2e3236', 'vest', '#1a1c1e'),
    'jeans': lambda: it_pants('#3a4a6a', False, '#24304a'),
    'cargo_pants': lambda: it_pants('#5a5a3a', True, '#3a3a22'),
    'work_trousers': lambda: it_pants('#4a3e30', True, '#2a2218'),
}
for _k in ('bat', 'crowbar', 'knife', 'machete', 'pipe', 'pistol', 'rifle', 'shotgun', 'spear', 'axe'):
    ITEM_ART[_k] = (lambda k: lambda: it_weapon(k))(_k)
for _k in ('chemicals', 'cloth', 'electronics', 'fuel', 'metal', 'tools', 'batteries', 'book',
           'matches', 'photograph', 'toy', 'flashlight'):
    ITEM_ART[_k] = (lambda k: lambda: it_simple(k))(_k)
# shared by whole categories (looked up by type in the game)
for _k in ('map', 'note', 'blueprint'):
    ITEM_ART['_' + _k] = (lambda k: lambda: it_simple(k))(_k)



# ════════════════════════════════════════════════════════════════════════════
# Nature & props (replace the early hand-made placeholders; characters stay
# hand-drawn). Same canvas sizes and bottom-centred placement as the originals
# so the game draws them unchanged. Muted greens: the world is desaturated.
# ════════════════════════════════════════════════════════════════════════════

LEAF = {'dark': '#22331e', 'mid': '#34492a', 'light': '#4c6236', 'hi': '#647a44'}


def _foliage(s, cx, cy, rx, ry, rng, pal=LEAF, clumps=26):
    """A canopy: dark mass, mid clumps, light clumps towards the upper left."""
    dark = s.material(pal['dark'], 14, 0.10)
    mid = s.material(pal['mid'], 16, 0.08)
    light = s.material(pal['light'], 16, 0.06)
    hi = s.material(pal['hi'], 12, 0.04)
    for _ in range(clumps):                                   # ragged outer mass
        a = rng.uniform(0, 2 * np.pi); r = rng.uniform(0.55, 0.95)
        x, y = cx + np.cos(a) * rx * r, cy + np.sin(a) * ry * r
        w, h = rng.uniform(0.25, 0.4) * rx, rng.uniform(0.25, 0.4) * ry
        s.ellipse(x - w, y - h, x + w, y + h, dark)
    s.ellipse(cx - rx * 0.8, cy - ry * 0.8, cx + rx * 0.8, cy + ry * 0.8, dark)
    for _ in range(clumps):
        a = rng.uniform(np.pi * 0.9, np.pi * 2.1); r = rng.uniform(0.1, 0.75)
        x, y = cx + np.cos(a) * rx * r, cy + np.sin(a) * ry * r - ry * 0.05
        w, h = rng.uniform(0.15, 0.3) * rx, rng.uniform(0.15, 0.28) * ry
        s.ellipse(x - w, y - h, x + w, y + h, mid)
    for _ in range(clumps // 2):
        a = rng.uniform(np.pi * 1.0, np.pi * 1.7); r = rng.uniform(0.2, 0.7)
        x, y = cx + np.cos(a) * rx * r, cy + np.sin(a) * ry * r
        w, h = rng.uniform(0.1, 0.2) * rx, rng.uniform(0.08, 0.16) * ry
        s.ellipse(x - w, y - h, x + w, y + h, light)
    for _ in range(clumps // 3):
        a = rng.uniform(np.pi * 1.1, np.pi * 1.5); r = rng.uniform(0.3, 0.7)
        x, y = cx + np.cos(a) * rx * r, cy + np.sin(a) * ry * r
        s.ellipse(x - 2, y - 1, x + 2, y + 1, hi)
    # leafy fringe: scattered single pixels just outside the mass
    for _ in range(int(rx * 3)):
        a = rng.uniform(0, 2 * np.pi)
        s.px(int(cx + np.cos(a) * rx * rng.uniform(0.9, 1.05)), int(cy + np.sin(a) * ry * rng.uniform(0.9, 1.05)), dark)


def _trunk(s, cx, top, bottom, w, rng, col='#4a3424', dark='#2a1c14'):
    bark = s.material(col, 18, 0.12); d = s.material(dark, 10, 0.05)
    s.poly([(cx - w // 2, top), (cx + w // 2, top), (cx + w // 2 + 3, bottom), (cx - w // 2 - 3, bottom)], bark)
    s.poly([(cx - w // 2 - 3, bottom - 4), (cx - w // 2 - 7, bottom), (cx - w // 2, bottom)], bark)   # roots
    s.poly([(cx + w // 2 + 3, bottom - 4), (cx + w // 2 + 8, bottom), (cx + w // 2, bottom)], bark)
    for _ in range(max(3, (bottom - top) // 8)):                                                  # bark grooves
        x = cx + int(rng.integers(-w // 2 + 1, w // 2))
        y0 = int(rng.integers(top, bottom - 6))
        s.line([(x, y0), (x + int(rng.integers(-1, 2)), y0 + int(rng.integers(4, 10)))], d)
    return bark


def round_tree(variant=0):
    rng = np.random.default_rng(100 + variant)
    s = Sprite(128, 128)
    if variant == 0:
        _trunk(s, 64, 60, 127, 10, rng)
        bark = s.material('#4a3424', 18, 0.12)
        s.line([(64, 78), (44, 58)], bark, width=4); s.line([(66, 72), (86, 54)], bark, width=4)
        _foliage(s, 64, 44, 50, 38, rng)
    else:
        _trunk(s, 62, 66, 127, 9, rng, '#524030', '#2e2218')
        bark = s.material('#524030', 18, 0.12)
        s.line([(62, 84), (40, 66)], bark, width=3)
        pal = {'dark': '#283a22', 'mid': '#3c5230', 'light': '#566c3c', 'hi': '#6e8048'}
        _foliage(s, 46, 54, 30, 24, rng, pal, 18)
        _foliage(s, 74, 40, 40, 32, rng, pal, 22)
    s.shade_gradient('x', 0.2)
    return s.finish(outline=0.35, mottle=0.06)


def pine(w, h, layers, seed, trunk_h, pal=None):
    rng = np.random.default_rng(seed)
    s = Sprite(w, h)
    pal = pal or {'dark': '#1e3022', 'mid': '#2c4430', 'light': '#405a3c'}
    cx = w // 2
    _trunk(s, cx, h - trunk_h - 10, h - 1, max(6, w // 18), rng, '#463022', '#261a12')
    dark = s.material(pal['dark'], 14, 0.10); mid = s.material(pal['mid'], 16, 0.08); light = s.material(pal['light'], 14, 0.05)
    top, base = 2, h - trunk_h
    for i in range(layers):
        t = i / max(1, layers - 1)
        y0 = top + (base - top) * t * 0.82
        y1 = y0 + (base - top) / layers * 1.9
        half = (w * 0.12) + (w * 0.36) * (t ** 0.85)
        jag = []
        n = 9
        for k in range(n + 1):                                   # jagged lower edge
            x = cx - half + 2 * half * k / n
            jag.append((x, y1 + (rng.integers(-3, 4) if 0 < k < n else -2)))
        s.poly([(cx, y0)] + jag[::-1][:0] + jag, dark)
        s.poly([(cx, y0 + 2), (cx - half * 0.75, y1 - 3), (cx + half * 0.2, y1 - 5)], mid)
        s.poly([(cx - 1, y0 + 4), (cx - half * 0.45, y1 - 7), (cx - half * 0.05, y1 - 8)], light)
    s.shade_gradient('x', 0.22)
    return s.finish(outline=0.35, mottle=0.05)


def dead_tree():
    rng = np.random.default_rng(55)
    s = Sprite(256, 256)
    bark = s.material('#4a3a30', 18, 0.12); d = s.material('#2a201a', 10, 0.05)
    cx = 128
    s.poly([(cx - 6, 40), (cx + 5, 40), (cx + 10, 255), (cx - 11, 255)], bark)
    s.poly([(cx - 11, 245), (cx - 22, 255), (cx - 6, 255)], bark); s.poly([(cx + 10, 245), (cx + 24, 255), (cx + 6, 255)], bark)

    def branch(x, y, ang, length, width, depth):
        x2, y2 = x + np.cos(ang) * length, y - np.sin(ang) * length
        s.line([(x, y), (x2, y2)], bark, width=max(1, int(width)))
        if depth > 0:
            for da in (-0.45, 0.4):
                if rng.random() < 0.85:
                    branch(x2, y2, ang + da + rng.uniform(-0.15, 0.15), length * rng.uniform(0.55, 0.7), width * 0.6, depth - 1)
    branch(cx - 2, 150, np.pi * 0.78, 60, 5, 3)
    branch(cx + 2, 120, np.pi * 0.2, 55, 5, 3)
    branch(cx, 70, np.pi * 0.62, 45, 4, 3)
    branch(cx + 1, 60, np.pi * 0.32, 40, 3, 2)
    branch(cx, 42, np.pi * 0.5, 20, 3, 2)
    for _ in range(14):
        y0 = int(rng.integers(50, 240)); x = cx + int(rng.integers(-4, 5))
        s.line([(x, y0), (x, y0 + int(rng.integers(6, 14)))], d)
    s.rect(cx - 3, 180, cx + 1, 186, d)                       # knot hole
    s.shade_gradient('x', 0.25)
    return s.finish(outline=0.4)


def bush(berries=False):
    rng = np.random.default_rng(7 if berries else 3)
    w, h = 64, 64
    s = Sprite(w, h)
    if berries:
        pal = {'dark': '#24341e', 'mid': '#34482a', 'light': '#4a5e34', 'hi': '#5c7040'}
        _foliage(s, 32, 50, 22, 14, rng, pal, 18)
        red = s.material('#8a2a2a', 10, 0); hi = s.material('#c05048', 6, 0)
        for _ in range(16):
            x, y = int(rng.integers(14, 50)), int(rng.integers(40, 62))
            if s.mat[y, x] >= 0:
                s.rect(x, y, x + 1, y + 1, red); s.px(x, y, hi)
    else:
        _foliage(s, 26, 50, 20, 13, rng, clumps=16)
        _foliage(s, 42, 47, 21, 16, rng, clumps=18)
    s.clear(0, 63, 63, 63)
    s.shade_gradient('y', 0.2)
    return s.finish(outline=0.35)


def grass(variant=0):
    rng = np.random.default_rng(20 + variant)
    s = Sprite(64, 64)
    blades = [s.material(c, 12, 0.04) for c in ('#2a3c22', '#3a5030', '#4c6438', '#5e7442')]
    s.rect(0, 62, 63, 63, blades[0])                         # soil-level tuft base
    for x in range(0, 64):
        for _ in range(2 if variant else 1):
            if rng.random() < 0.25:
                continue
            hgt = int(rng.integers(3, 12 if variant else 9))
            lean = int(rng.integers(-3, 4))
            col = blades[min(3, int(rng.integers(0, 3)) + (1 if hgt > 7 else 0))]
            s.line([(x, 63), (x + lean, 63 - hgt)], col)
    if variant == 0:                                          # a few wildflowers
        for col in ('#c8b040', '#a83a2a', '#c8c0b0', '#8a6ab0', '#c8b040'):
            x = int(rng.integers(4, 60)); hgt = int(rng.integers(8, 12))
            s.line([(x, 63), (x, 63 - hgt)], blades[1])
            f = s.material(col, 8, 0)
            s.rect(x - 1, 63 - hgt - 1, x + 1, 63 - hgt, f); s.px(x, 63 - hgt - 2, f)
    return s.finish(outline=0.08)


def bones(variant=0):
    s = Sprite(64, 64)
    b = s.material('#b8ae98', 10, 0.05); d = s.material('#5a5246', 8)
    if variant == 0:
        s.ellipse(22, 51, 31, 59, b); s.rect(24, 58, 29, 62, b)          # skull
        s.rect(24, 54, 25, 56, d); s.rect(28, 54, 29, 56, d); s.px(26, 58, d)
        for x in (34, 40, 46):                                          # ribs / long bones
            s.line([(x, 62), (x + 6, 58)], b, width=2)
        s.line([(32, 63), (52, 63)], b, width=2)
        s.rect(51, 61, 53, 63, b)
    else:
        s.line([(14, 62), (34, 60)], b, width=2); s.rect(12, 60, 14, 63, b); s.rect(34, 58, 36, 61, b)
        s.line([(22, 63), (44, 63)], b, width=2); s.rect(43, 61, 45, 63, b)
        s.ellipse(36, 55, 44, 62, b); s.rect(38, 57, 39, 58, d); s.rect(41, 57, 42, 58, d)
    s.shade_gradient('y', 0.2)
    return s.finish(outline=0.35)


def trash_pile():
    rng = np.random.default_rng(33)
    s = Sprite(64, 64)
    bag1 = s.material('#2a2c2a', 14, 0.06); bag2 = s.material('#3a3a34', 14, 0.06)
    paper = s.material('#a8a08a', 12, 0.05); can = s.material('#8a8a86', 8); rust = s.material('#7a4a2a', 14)
    box = s.material('#7a6044', 14, 0.06); rot = s.material('#4a5a2a', 16, 0.1)
    s.ellipse(4, 46, 30, 64, bag1); s.ellipse(22, 42, 46, 64, bag2); s.ellipse(38, 50, 58, 64, bag1)
    s.rect(28, 50, 40, 60, box); s.line([(28, 50), (34, 47)], box)
    s.px(16, 44, bag1); s.rect(15, 42, 17, 45, bag1)                          # tied knot
    for _ in range(6):
        x, y = int(rng.integers(6, 56)), int(rng.integers(50, 62))
        s.rect(x, y, x + 2, y + 1, paper)
    s.rect(46, 58, 49, 62, can); s.rect(10, 59, 13, 63, rust)
    s.ellipse(20, 58, 26, 63, rot)
    s.shade_gradient('x', 0.2)
    return s.finish(outline=0.4, mottle=0.08)


def crate():
    s = Sprite(28, 24)
    wood = s.material('#7a5a34', 16, 0.08); d = s.material('#4a3420', 10); n = s.material('#2a2a2a', 4, 0)
    s.rect(0, 0, 27, 23, wood)
    for y in (0, 22):
        s.rect(0, y, 27, y + 1, d)
    for x in (0, 26):
        s.rect(x, 0, x + 1, 23, d)
    for y in (7, 15):
        s.rect(2, y, 25, y, d)                                            # slats
    s.line([(2, 2), (25, 21)], d, width=2)                               # brace
    for x, y in ((1, 1), (26, 1), (1, 22), (26, 22)):
        s.px(x, y, n)
    s.shade_gradient('x', 0.25)
    return s.finish(outline=0.45)


def cardboard_box():
    s = Sprite(22, 16)
    c = s.material('#a07a4a', 14, 0.06); d = s.material('#6a4e2e', 10); tape = s.material('#c8b48a', 6, 0)
    s.rect(0, 2, 21, 15, c)
    s.poly([(0, 2), (4, 0), (10, 0), (10, 2)], d); s.poly([(11, 2), (11, 0), (18, 0), (21, 2)], c)   # open flaps
    s.rect(10, 2, 11, 15, tape)
    s.rect(3, 8, 7, 9, d)                                                 # scrawl
    s.shade_gradient('x', 0.25)
    return s.finish(outline=0.4)


def chest():
    s = Sprite(26, 18)
    wood = s.material('#6a4428', 16, 0.08); band = s.material('#3e3e3a', 8); brass = s.material('#b09040', 6, 0)
    s.rect(0, 6, 25, 17, wood)
    s.ellipse(0, 0, 25, 11, wood)
    s.rect(0, 5, 25, 6, band)
    for x in (3, 21):
        s.rect(x, 1, x + 1, 17, band)
    s.rect(11, 6, 14, 9, brass); s.px(12, 8, band)
    s.shade_gradient('x', 0.25)
    return s.finish(outline=0.45)


def locker():
    s = Sprite(16, 42)
    m = s.material('#6a7070', 10, 0.04); d = s.material('#3a3e40', 8); h = s.material('#a8a8a0', 4, 0)
    rust = s.material('#7a4a2a', 16, 0.1)
    s.rect(0, 0, 15, 41, m)
    s.rect(0, 0, 15, 1, d); s.rect(0, 40, 15, 41, d); s.rect(7, 2, 8, 39, d)    # door split
    for y in range(4, 12, 2):
        s.rect(2, y, 5, y, d); s.rect(10, y, 13, y, d)                      # vents
    s.rect(5, 20, 5, 23, h); s.rect(10, 20, 10, 23, h)                      # handles
    s.rect(1, 33, 3, 38, rust); s.px(12, 29, rust)
    s.shade_gradient('x', 0.3)
    return s.finish(outline=0.45)


def it_mushroom(variant=0):
    s = _item(9, 9)
    cap = s.material('#8a5a3a' if variant == 0 else '#a8885a', 12, 0.05)
    stem = s.material('#d8ccb0', 8, 0.03); spot = s.material('#e8dcc8', 4, 0)
    if variant == 0:                                          # one brown cap
        s.rect(3, 4, 4, 8, stem)
        s.ellipse(0, 0, 7, 5, cap); s.clear(0, 4, 7, 5); s.rect(3, 4, 4, 5, stem)
        s.px(2, 1, spot); s.px(5, 2, spot)
    else:                                                     # a pair of pale ones
        s.rect(2, 4, 3, 8, stem); s.ellipse(0, 1, 5, 5, cap); s.clear(0, 4, 5, 5); s.rect(2, 4, 3, 5, stem)
        s.rect(6, 6, 6, 8, stem); s.ellipse(4, 4, 8, 7, cap); s.clear(4, 7, 8, 7); s.rect(6, 7, 6, 7, stem)
    return s.finish(outline=0.35)


def it_wood(variant=0):
    rng = np.random.default_rng(60 + variant)
    s = _item(20, 7)
    bark = s.material('#5a3e28', 16, 0.1); end = s.material('#b08a5a', 10, 0.04); ring = s.material('#7a5a3a', 6)
    logs = [(0, 2, 17, 6)] if variant == 0 else [(0, 3, 15, 6), (4, 0, 19, 3)] if variant == 1 else [(2, 1, 13, 6)]
    for x0, y0, x1, y1 in logs:
        s.rect(x0 + 1, y0, x1, y1, bark)
        s.ellipse(x1 - 2, y0, x1 + 1, y1, end); s.px(x1, (y0 + y1) // 2, ring)
        x = int(rng.integers(x0 + 2, x1 - 3)); s.rect(x, y0, x + 1, y0, ring)
    return s.finish(outline=0.35)


def it_rope():
    s = _item(14, 8)
    r = s.material('#a08a5a', 12, 0.05); d = s.material('#6a5a3a', 8)
    s.ellipse(0, 0, 13, 7, r); s.ellipse(3, 2, 10, 5, d); s.ellipse(5, 3, 8, 4, r)
    s.line([(11, 6), (13, 7)], r)
    return s.finish(outline=0.35)


# ════════════════════════════════════════════════════════════════════════════
# World map backdrop (roads, markers and fog are drawn by the game on top).
# Location spots must match WORLD_MAP_POS in js/screens/exploreSelect.js.
# ════════════════════════════════════════════════════════════════════════════

MAP_W, MAP_H = 540, 360
MAP_POS = {'shelter': (270, 190), 'forest': (200, 222), 'church': (338, 222), 'rooftop': (355, 120),
           'suburb': (170, 120), 'pharmacy': (420, 175), 'mall': (445, 80), 'village': (90, 255),
           'police': (470, 270), 'factory': (110, 330), 'hospital': (500, 40), 'bunker': (60, 50)}


def world_map():
    rng = np.random.default_rng(404)
    W, H = MAP_W, MAP_H
    img = Image.new('RGB', (W, H), (40, 40, 32))
    d = ImageDraw.Draw(img)
    # broad terrain tint: greener west, greyer east
    base = np.zeros((H, W, 3))
    xs = np.linspace(0, 1, W)[None, :]
    base[..., 0] = 44 + 10 * xs; base[..., 1] = 46 - 2 * xs; base[..., 2] = 34 + 12 * xs
    img = Image.fromarray(base.clip(0, 255).astype(np.uint8)); d = ImageDraw.Draw(img)
    # fields
    for _ in range(26):
        x, y = rng.integers(0, W), rng.integers(0, H)
        w, h = rng.integers(20, 60), rng.integers(12, 34)
        c = tuple(int(v) for v in rng.choice([(58, 54, 38), (50, 52, 36), (62, 58, 44)]))
        d.rectangle([x, y, x + w, y + h], fill=c)
    # forests (west / around the forest & village)
    for cx, cy, r, n in [(200, 240, 55, 260), (90, 250, 60, 260), (150, 175, 40, 140), (40, 140, 45, 160), (250, 300, 40, 120)]:
        for _ in range(n):
            a = rng.uniform(0, 2 * np.pi); rr = r * np.sqrt(rng.random())
            x, y = cx + np.cos(a) * rr, cy + np.sin(a) * rr * 0.8
            s_ = rng.integers(2, 5)
            g = tuple(int(v) for v in rng.choice([(30, 44, 28), (36, 52, 32), (26, 38, 24), (44, 58, 36)]))
            d.ellipse([x - s_, y - s_, x + s_, y + s_], fill=g)
    # river: north to south, bending
    pts = [(250, -5), (240, 40), (262, 90), (300, 130), (296, 160), (262, 250), (282, 300), (300, 365)]
    d.line(pts, fill=(32, 40, 44), width=7)
    d.line(pts, fill=(44, 56, 62), width=3)
    # city blocks (north-east), ruined gaps
    for bx in range(330, 540, 13):
        for by in range(4, 320, 13):
            dist = np.sqrt(((bx - 485) / 130) ** 2 + ((by - 150) / 150) ** 2)
            if rng.random() > 1.25 - dist or rng.random() < 0.15:   # dense core, ragged edges
                continue
            x0, y0 = bx + int(rng.integers(-2, 3)), by + int(rng.integers(-2, 3))
            w, h = rng.integers(7, 12), rng.integers(7, 12)
            g = int(rng.integers(58, 84))
            d.rectangle([x0, y0, x0 + w, y0 + h], fill=(g, g, g + 4))
            if rng.random() < 0.3:
                d.rectangle([x0 + 2, y0 + 2, x0 + w - 2, y0 + h - 2], fill=(g - 22, g - 22, g - 18))
    # suburbs: small house dots around suburb / church
    for cx, cy in [(170, 120), (338, 222), (355, 120)]:
        for _ in range(26):
            x, y = cx + rng.normal(0, 22), cy + rng.normal(0, 16)
            d.rectangle([x, y, x + 3, y + 3], fill=(78, 70, 62))
    # industrial yards (south-west) and the bunker hill (north-west)
    for _ in range(14):
        x, y = 70 + rng.integers(0, 90), 300 + rng.integers(0, 50)
        d.rectangle([x, y, x + rng.integers(8, 18), y + rng.integers(5, 10)], fill=(74, 68, 58))
    d.ellipse([30, 25, 95, 80], fill=(56, 52, 44)); d.ellipse([42, 36, 80, 66], fill=(48, 46, 40))
    # grain, speckles and vignette
    a = np.array(img, dtype=float)
    a += rng.normal(0, 7, (H, W, 1)) + rng.normal(0, 2.5, (H, W, 3))
    spk = rng.random((H, W)) < 0.03
    a[spk] *= 0.7
    yy, xx = np.mgrid[0:H, 0:W]
    v = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2
    a *= (1 - 0.35 * np.clip(v - 0.3, 0, 1))[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8)).convert('RGBA')


def it_bike_part(kind):
    if kind == 'wheels':
        s = _item(16, 9)
        t = s.material('#2a2a2a', 8); r = s.material('#8a8e92', 8)
        for x0 in (0, 8):
            s.ellipse(x0, 1, x0 + 7, 8, t); s.ellipse(x0 + 2, 3, x0 + 5, 6, r); s.ellipse(x0 + 3, 4, x0 + 4, 5, t)
    elif kind == 'frame':
        s = _item(16, 10)
        f = s.material('#8a3a2a', 12, 0.05)
        s.line([(1, 9), (6, 2), (14, 2), (10, 9), (1, 9)], f, width=2); s.line([(6, 2), (10, 9)], f, width=2)
        s.rect(13, 0, 14, 3, f)
    elif kind == 'chain':
        s = _item(14, 8)
        c = s.material('#7a7a74', 8, 0.05); o = s.material('#4a4a46', 6)
        s.ellipse(0, 0, 13, 7, c); s.ellipse(2, 2, 11, 5, o)
        for x in range(1, 13, 2):
            s.px(x, 0, o); s.px(x, 7, o)
    elif kind == 'handlebars':
        s = _item(16, 8)
        m = s.material('#9a9a9a', 8, 0.03); g = s.material('#2a2a2a', 8)
        s.line([(1, 2), (6, 4), (10, 4), (15, 2)], m, width=2); s.rect(7, 4, 8, 7, m)
        s.rect(0, 1, 2, 3, g); s.rect(14, 1, 15, 3, g)
    elif kind == 'screws':
        s = _item(12, 7)
        m = s.material('#a8a8a0', 8, 0.03); d = s.material('#5a5a56', 6)
        for x, y in ((0, 3), (5, 1), (8, 4)):
            s.rect(x, y, x + 3, y + 2, m); s.px(x + 1, y + 1, d)
        s.line([(3, 0), (3, 6)], d)
    return s.finish(outline=0.35)


def surf_raincatcher():
    """A rain catcher disguised as rubble: a dented roofing sheet half buried in
    debris, tilted so water runs left into a gutter and down a cracked
    'drainpipe' that looks like junk sticking out of the ground."""
    rng = np.random.default_rng(91)
    s = Sprite(64, 36)
    conc = s.material('#5a5650', 16, 0.08); conc2 = s.material('#4a4640', 14, 0.08)
    brick = s.material('#6a3e2e', 16, 0.08); dirt = s.material('#3a3226', 16, 0.1)
    sheet = s.material('#6a6a62', 12, 0.05); ridge = s.material('#4a4a44', 8); rust = s.material('#7a4a2a', 16, 0.12)
    pipe = s.material('#3e3e3a', 10, 0.04); pipe_hi = s.material('#5a5a54', 8); tarp = s.material('#3a4030', 14, 0.08)
    # rubble mound along the bottom
    s.poly([(0, 35), (6, 26), (16, 24), (30, 22), (44, 24), (56, 27), (63, 31), (63, 35)], dirt)
    for _ in range(16):
        x, y = int(rng.integers(2, 60)), int(rng.integers(25, 33))
        w, h = int(rng.integers(3, 7)), int(rng.integers(2, 4))
        s.rect(x, y, x + w, y + h, [conc, conc2, brick][int(rng.integers(0, 3))])
    # broken concrete post propping up the high end, a cinder block mid-way
    s.rect(54, 8, 59, 26, conc2); s.rect(55, 8, 56, 26, conc)
    s.rect(33, 15, 38, 24, conc)
    # olive tarp corner peeking out (the funnel under the sheet)
    s.poly([(10, 22), (22, 15), (26, 19), (14, 25)], tarp)
    # the tilted roofing sheet: high on the right, low on the left
    s.poly([(12, 17), (60, 5), (61, 9), (13, 21)], sheet)
    for k in range(0, 46, 5):                      # corrugation ridges
        x = 14 + k
        s.line([(x, 20 - k * 12 // 48), (x + 1, 16 - k * 12 // 48)], ridge)
    for _ in range(5):
        x = int(rng.integers(16, 56)); y = 18 - (x - 12) * 12 // 48
        s.rect(x, y - 1, x + 2, y, rust)
    # camouflage: bricks and a dead branch lying on top of the sheet
    s.rect(30, 9, 34, 11, brick); s.rect(44, 6, 47, 8, conc); s.rect(52, 4, 54, 6, conc2)
    s.line([(20, 12), (40, 10), (46, 6)], dirt)
    # gutter at the low end and the "broken drainpipe" going into the ground
    s.rect(6, 19, 13, 21, ridge)
    s.rect(6, 20, 9, 35, pipe); s.rect(7, 20, 7, 35, pipe_hi)
    s.rect(5, 27, 10, 28, rust)                    # rusted collar
    s.shade_gradient('x', 0.18)
    return s.finish(outline=0.35, mottle=0.06)


# ════════════════════════════════════════════════════════════════════════════
# Animated enemies in the style of the hand-drawn characters: clean flat
# colours, light shading, slim side-view figures. Each sheet is a strip of
# frames: idle0, idle1, walk0..walk3. Hand positions per frame go to
# js/data/enemy_art.js so held weapons follow the animation.
# ════════════════════════════════════════════════════════════════════════════

def _flat(s, color):
    return s.material(color, 3, 0.0)


HUMAN_LOOKS = {
    'raider':  dict(skin='#d8a07a', hat='hood',   hat_c='#4a4a32', top='#5a4030', top2='#46321f', legs='#3a3a38', boots='#1e1a16', extra='bandana', extra_c='#8a2a22', hair='#2a1c14'),
    'armed':   dict(skin='#c08a64', hat='cap',    hat_c='#22262a', top='#2e3436', top2='#8a7a52', legs='#4a4e36', boots='#1a1a18', extra='vest',    extra_c='#8a7a52', hair='#1a1410'),
    'bandit':  dict(skin='#e4b490', hat='beanie', hat_c='#5a2a2a', top='#4a3a2e', top2='#3a2c22', legs='#3a4a6a', boots='#2a2018', extra='coat',    extra_c='#4a3a2e', hair='#6a4a2a'),
    'cultist': dict(skin='#d8a888', hat='bald',   hat_c='#d8a888', top='#8a8a80', top2='#6e6e66', legs='#8a8a80', boots='#2a2622', extra='robe',    extra_c='#a03a2a', hair='#3a2a20'),
    'chief':   dict(skin='#a87050', hat='beret',  hat_c='#8a2222', top='#2a2a2e', top2='#1e1e22', legs='#2e2e30', boots='#141414', extra='coat',    extra_c='#2a2a2e', hair='#1a1410'),
}
WALK_FRONT = [4, 1, -3, 1]     # foot offsets (px) through the walk cycle
WALK_BACK = [-3, 0, 4, 0]
WALK_ARM = [-2, 0, 2, 0]


def human_frame(L, frame):
    """Three-quarter view like the hand-drawn characters: head turned toward the
    facing side, body mostly toward the viewer, both arms hanging at the sides,
    both legs visible. frame 0,1 = idle (breathing), 2..5 = walk. 24x46 (a touch
    smaller than the 47px player)."""
    s = Sprite(24, 46)
    walk = frame >= 2
    ph = frame - 2 if walk else 0
    oy = (1 if frame == 1 else 0) + (1 if walk and ph in (1, 3) else 0)   # breathing / step bob
    skin = _flat(s, L['skin']); skin_d = _flat(s, _shade(L['skin'], 0.8))
    top = _flat(s, L['top']); top_d = _flat(s, L['top2']); top_l = _flat(s, _shade(L['top'], 1.2))
    legs = _flat(s, L['legs']); legs_d = _flat(s, _shade(L['legs'], 0.72))
    boots = _flat(s, L['boots']); dark = _flat(s, '#141210')
    hat = _flat(s, L['hat_c']); hat_d = _flat(s, _shade(L['hat_c'], 0.7)); hair = _flat(s, L['hair'])
    extra = _flat(s, L['extra_c'])
    # legs: left (far) and right (near); in the walk one steps forward as the other goes back
    stride = [2, 0, -2, 0][ph] if walk else 0
    lift = [0, 1, 0, 1][ph] if walk else 0
    hip = 25
    for x0, d, mat, l in ((7, -stride, legs_d, 0), (11, stride, legs, lift)):
        s.poly([(x0, hip), (x0 + 2, hip), (x0 + 2 + d, 42 - l), (x0 + d, 42 - l)], mat)
        s.rect(x0 + d, 42 - l, x0 + d + 3, 45 - l, boots)                    # boot, toe toward the facing side
    # torso: broad shoulders narrowing to the waist
    s.poly([(5, 9 + oy), (16, 9 + oy), (15, 12 + oy), (14, hip), (7, hip), (6, 12 + oy)], top)
    s.rect(14, 10 + oy, 14, hip - 1, top_l)                                   # lit near side
    s.rect(7, 12 + oy, 7, hip - 1, top_d)                                     # shaded far side
    s.rect(7, hip - 1, 14, hip, dark)                                         # belt
    if L['extra'] == 'vest':
        s.rect(8, 11 + oy, 13, hip - 2, top_d); s.rect(10, 11 + oy, 10, hip - 2, dark)
    if L['extra'] in ('coat', 'robe'):
        bottom = 42 if L['extra'] == 'robe' else 34
        sway = stride // 2
        s.poly([(6, 12 + oy), (15, 12 + oy), (16 + max(0, sway), bottom), (5 + min(0, sway), bottom)], top)
        s.line([(10, 12 + oy), (10, bottom)], top_d)
        if L['extra'] == 'robe':
            s.rect(7, 21, 14, 22, extra)                                      # sash
            s.ellipse(9, 13 + oy, 12, 16 + oy, extra)                         # sigil
    # arms hang at both sides and swing a little when walking; hands show skin
    sw = [-1, 0, 1, 0][ph] if walk else 0
    s.rect(5, 10 + oy, 5, 22 + oy, top_d); s.rect(5 - sw, 22 + oy, 5 - sw, 24 + oy, skin_d)    # far arm
    s.rect(15, 10 + oy, 16, 22 + oy, top); s.rect(15 + sw, 22 + oy, 16 + sw, 24 + oy, skin)    # near arm
    hand = (16 + sw, 24 + oy)
    # neck and head, turned toward the facing side
    s.rect(10, 7 + oy, 12, 9 + oy, skin)
    s.rect(9, 1 + oy, 14, 7 + oy, skin)                                       # face
    s.rect(15, 3 + oy, 15, 4 + oy, skin)                                      # nose
    s.px(13, 3 + oy, dark)                                                    # eye
    h = L['hat']
    if h != 'bald':
        s.rect(8, 0 + oy, 10, 5 + oy, hair); s.rect(8, 0 + oy, 14, 1 + oy, hair)  # hair framing the back
    if h == 'hood':
        s.poly([(6, 9 + oy), (7, 0 + oy), (13, -1 + oy), (15, 1 + oy), (11, 1 + oy), (10, 8 + oy)], hat)
        s.line([(7, 2 + oy), (7, 8 + oy)], hat_d)
    elif h == 'cap':
        s.rect(8, -1 + oy, 14, 1 + oy, hat); s.rect(14, 1 + oy, 17, 1 + oy, hat)
    elif h == 'beanie':
        s.ellipse(7, -2 + oy, 14, 3 + oy, hat); s.rect(7, 1 + oy, 14, 2 + oy, hat_d)
    elif h == 'beret':
        s.ellipse(7, -2 + oy, 15, 2 + oy, hat); s.rect(10, 5 + oy, 14, 7 + oy, hair)    # beard
    elif h == 'bald':
        s.rect(9, 0 + oy, 13, 0 + oy, skin_d); s.px(10, 2 + oy, extra)        # shaved, a painted mark
    if L['extra'] == 'bandana':
        s.rect(11, 5 + oy, 15, 7 + oy, extra)
    s.shade_gradient('x', 0.08)
    return s.finish(outline=0.18, grain_scale=0.6), hand


def _shade(hexc, k):
    r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02x%02x%02x' % (int(r * k), int(g * k), int(b * k))


def robot_frame(frame):
    s = Sprite(36, 54)
    walk = frame >= 2
    ph = frame - 2 if walk else 0
    plate = _flat(s, '#5a6672'); plate_d = _flat(s, '#424c56'); joint = _flat(s, '#2c3238')
    visor = _flat(s, '#1a1e22'); eye = _flat(s, '#e8742a' if frame != 1 else '#ffa05a'); rust = _flat(s, '#7a4e30')
    lift = [(2, 0), (0, 0), (0, 2), (0, 0)][ph] if walk else (0, 0)
    sway = [1, 0, -1, 0][ph] if walk else 0
    # legs (back one darker), each lifts in turn
    for x0, l, mat in ((19, lift[1], plate_d), (9, lift[0], plate)):
        s.rect(x0, 36 - l, x0 + 6, 49 - l, mat); s.rect(x0 + 1, 41 - l, x0 + 5, 43 - l, joint)
        s.rect(x0 - 1, 49 - l, x0 + 8, 53 - l, joint)
    # body
    s.rect(8, 32, 27, 37, joint)
    s.poly([(5 + sway, 12), (30 + sway, 12), (28 + sway, 33), (7 + sway, 33)], plate)
    s.rect(11 + sway, 17, 24 + sway, 27, plate_d)
    for y in range(18, 27, 2):
        s.rect(12 + sway, y, 23 + sway, y, joint)
    s.rect(7 + sway, 29, 12 + sway, 32, rust)
    # arms swing opposite the legs
    a = [2, 0, -2, 0][ph] if walk else 0
    s.rect(0 + sway, 13 + a, 4 + sway, 30 + a, plate_d); s.rect(0 + sway, 30 + a, 4 + sway, 35 + a, joint)
    s.rect(31 + sway, 13 - a, 35 + sway, 30 - a, plate); s.rect(31 + sway, 30 - a, 35 + sway, 35 - a, joint)
    # head with visor
    s.rect(11 + sway, 2, 25 + sway, 11, plate); s.rect(13 + sway, 5, 25 + sway, 8, visor)
    s.rect(19 + sway, 6, 24 + sway, 7, eye); s.rect(17 + sway, 0, 18 + sway, 2, joint)
    s.shade_gradient('x', 0.12)
    return s.finish(outline=0.3, grain_scale=0.6), None


def drone_frame(frame):
    s = Sprite(36, 20)
    body = _flat(s, '#4a5460'); dark = _flat(s, '#22262c'); rotor = _flat(s, '#8a929a')
    lens = _flat(s, '#e05a2a'); led = _flat(s, '#ff3a2a' if frame == 0 else '#5a1a14')
    s.rect(3, 5, 32, 5, dark)
    w = [6, 3, 5][frame % 3]                     # rotor blur changes width as it spins
    s.rect(5 - w, 3, 5 + w, 3, rotor); s.rect(30 - w, 3, 30 + w, 3, rotor)
    s.rect(4, 4, 6, 6, dark); s.rect(29, 4, 31, 6, dark)
    s.ellipse(9, 5, 27, 16, body); s.rect(12, 14, 24, 16, dark)
    s.line([(15, 16), (12, 19)], dark); s.line([(21, 16), (24, 19)], dark)
    s.ellipse(20, 8, 26, 14, dark); s.ellipse(21, 9, 25, 13, lens); s.px(12, 8, led)
    s.shade_gradient('y', 0.15)
    return s.finish(outline=0.3, grain_scale=0.6), None


def quad_frame(frame, fur, belly, dark_c, w=37, h=24, dog=False):
    s = Sprite(w, h)
    f = _flat(s, fur); b = _flat(s, belly); d = _flat(s, dark_c); fd = _flat(s, _shade(fur, 0.78)); eye = _flat(s, '#e0b040' if not dog else '#2a1a10')
    walk = frame >= 2
    ph = frame - 2 if walk else 0
    gy = h - 1
    sc = w / 37.0
    X = lambda v: int(round(v * sc))
    # legs: pairs move opposite (trot)
    off = [3, 0, -3, 0][ph] if walk else 0
    legs = [(X(7), -off, fd), (X(25), off, fd), (X(10), off, f), (X(28), -off, f)]
    for x0, o, mat in legs:
        s.line([(x0, X(13)), (x0 + o, gy - 1)], mat, width=2)
        s.rect(x0 + o, gy - 1, x0 + o + 2, gy, d)
    breath = 1 if frame == 1 else 0
    s.ellipse(X(5), X(6) + breath, X(30), X(15), f)
    s.ellipse(X(10), X(10) + breath, X(26), X(15), b)
    tail = [0, 1, 0, -1][ph] if walk else breath
    s.poly([(X(6), X(9)), (X(0), X(12) + tail), (X(1), X(15) + tail), (X(7), X(12))], f)
    s.poly([(X(25), X(7)), (X(31), X(2)), (X(34), X(6)), (X(30), X(12))], f)       # neck / head
    s.poly([(X(31), X(3)), (X(37) - 1, X(7)), (X(36), X(10)), (X(31), X(9))], b if dog else f)   # snout
    s.px(X(36) - 1, X(7), d)
    s.poly([(X(28), 0), (X(31), X(4)), (X(27), X(4))], d if dog else f)             # ear
    s.px(X(32), X(4), eye)
    s.shade_gradient('y', 0.15)
    return s.finish(outline=0.25, grain_scale=0.6), None


def enemy_sheets():
    """Write Assets/en_*.png strips and js/data/enemy_art.js (frame sizes + hands)."""
    import json
    meta = {}
    def strip(name, frames):
        imgs = [f[0] for f in frames]
        fw, fh = imgs[0].size
        sheet = Image.new('RGBA', (fw * len(imgs), fh), (0, 0, 0, 0))
        for i, im in enumerate(imgs):
            sheet.paste(im, (i * fw, 0))
        save(sheet, f'en_{name}.png')
        meta[name] = {'fw': fw, 'fh': fh, 'n': len(imgs), 'hand': [list(f[1]) if f[1] else None for f in frames]}
    for name, L in HUMAN_LOOKS.items():
        strip(name, [human_frame(L, i) for i in range(6)])
    strip('robot', [robot_frame(i) for i in range(6)])
    strip('drone', [drone_frame(i) for i in range(3)])
    strip('wolf', [quad_frame(i, '#6e665e', '#9a9286', '#2a2420') for i in range(6)])
    strip('dog', [quad_frame(i, '#8a5a32', '#b88a5a', '#2a1a10', 30, 20, dog=True) for i in range(6)])
    js = ('// enemy_art.js — generated by tools/gen_art.py (enemy_sheets). Frame sizes and\n'
          '// the front-hand position per frame for each animated enemy sheet.\n'
          "'use strict';\nconst ENEMY_ART = " + json.dumps(meta) + ';\n')
    with open(os.path.join(os.path.dirname(OUT), 'js', 'data', 'enemy_art.js'), 'w') as fh:
        fh.write(js)
    print('wrote js/data/enemy_art.js')
    return Image.new('RGBA', (1, 1))


# ════════════════════════════════════════════════════════════════════════════
# Parallax background layers (tile horizontally: width = 736, shapes wrap)
# and ground strips. Kept low-contrast so the playfield stays readable.
# ════════════════════════════════════════════════════════════════════════════

BG_W = 736


class WrapSprite(Sprite):
    """Sprite whose shapes wrap around the left/right edge (seamless tiling)."""
    def _paint(self, draw_fn, m):
        mask = Image.new('L', (self.w * 3, self.h), 0)
        d = ImageDraw.Draw(mask)
        # draw three copies offset by one width, then fold them together
        class Shift:
            def __init__(s2, dx): s2.dx = dx
            def rectangle(s2, xy, fill): d.rectangle([xy[0] + s2.dx, xy[1], xy[2] + s2.dx, xy[3]], fill=fill)
            def ellipse(s2, xy, fill): d.ellipse([xy[0] + s2.dx, xy[1], xy[2] + s2.dx, xy[3]], fill=fill)
            def polygon(s2, pts, fill): d.polygon([(x + s2.dx, y) for x, y in pts], fill=fill)
            def line(s2, pts, fill, width=1): d.line([(x + s2.dx, y) for x, y in pts], fill=fill, width=width)
        for k in (0, 1, 2):
            draw_fn(Shift(k * self.w))
        a = np.array(mask)
        sel = (a[:, :self.w] | a[:, self.w:2 * self.w] | a[:, 2 * self.w:]) > 0
        # shapes drawn at x in [0,W) land in the middle copy; fold edges into it
        sel = (np.roll(a[:, :self.w], 0, axis=1) > 0) | (a[:, self.w:2 * self.w] > 0) | (a[:, 2 * self.w:] > 0)
        self.mat[sel] = m
        return sel


def _ruin_tower(s, x, base, w, h, body, win, rng):
    s.rect(x, base - h, x + w, base, body)
    # jagged broken top
    pts = [(x, base - h)]
    for k in range(1, 5):
        pts.append((x + w * k // 4, base - h - int(rng.integers(0, 14))))
    pts.append((x + w, base - h))
    s.poly(pts + [(x + w, base - h + 2), (x, base - h + 2)], body)
    for wy in range(base - h + 6, base - 6, 9):
        for wx in range(x + 3, x + w - 4, 7):
            if rng.random() < 0.55:
                s.rect(wx, wy, wx + 2, wy + 3, win)


def bg_city_far():
    s = WrapSprite(BG_W, 140)
    body = s.material('#3a3c46', 6, 0.04); win = s.material('#2a2c34', 4)
    rng = np.random.default_rng(11); x = 0
    while x < BG_W:
        w = int(rng.integers(24, 56)); h = int(rng.integers(40, 128))
        _ruin_tower(s, x, 139, w, h, body, win, rng)
        x += w + int(rng.integers(2, 18))
    return s.finish(outline=0.15, grain_scale=0.7)


def bg_city_near():
    s = WrapSprite(BG_W, 110)
    body = s.material('#2a2a30', 8, 0.05); win = s.material('#1a1a20', 4)
    pole = s.material('#24201c', 6); wire = s.material('#1c1a18', 4)
    rng = np.random.default_rng(12); x = 10
    while x < BG_W:
        w = int(rng.integers(40, 90)); h = int(rng.integers(30, 90))
        _ruin_tower(s, x, 109, w, h, body, win, rng)
        x += w + int(rng.integers(30, 90))
    for px in range(40, BG_W, 150):                               # leaning power poles
        s.line([(px, 109), (px + 4, 30)], pole, width=2); s.rect(px - 4, 34, px + 10, 35, pole)
        s.line([(px + 5, 36), (px + 150, 40)], wire)
    return s.finish(outline=0.2, grain_scale=0.7)


def bg_suburb_near():
    s = WrapSprite(BG_W, 90)
    wall = s.material('#2e2c2c', 8, 0.05); roof = s.material('#241e1c', 8, 0.06)
    win = s.material('#16161a', 4); fence = s.material('#26221e', 6); pole = s.material('#22201c', 6)
    rng = np.random.default_rng(13); x = 0
    while x < BG_W:
        w = int(rng.integers(50, 80)); h = int(rng.integers(26, 40)); b = 89
        s.rect(x, b - h, x + w, b, wall)
        if rng.random() < 0.7:
            s.poly([(x - 4, b - h), (x + w // 2, b - h - 22), (x + w + 4, b - h)], roof)
        else:                                                      # collapsed roof
            s.poly([(x - 2, b - h), (x + w // 3, b - h - 14), (x + w // 2, b - h - 4), (x + w, b - h)], roof)
        for wx in (x + 8, x + w - 18):
            s.rect(wx, b - h + 8, wx + 9, b - h + 16, win)
        x += w + int(rng.integers(20, 50))
    for fx in range(0, BG_W, 6):                                   # picket fence
        s.rect(fx, 76, fx + 2, 89, fence)
    s.rect(0, 80, BG_W - 1, 81, fence)
    for px in range(90, BG_W, 200):
        s.line([(px, 89), (px, 10)], pole, width=2); s.rect(px - 6, 14, px + 6, 15, pole)
    return s.finish(outline=0.2, grain_scale=0.7)


def bg_industrial_near():
    s = WrapSprite(BG_W, 130)
    body = s.material('#2a2c2a', 8, 0.05); dark = s.material('#1c1e1c', 6)
    rust = s.material('#3a2a20', 8, 0.06)
    rng = np.random.default_rng(14); x = 0
    while x < BG_W:
        kind = rng.choice(['shed', 'stack', 'tank', 'crane'])
        if kind == 'shed':
            w = int(rng.integers(70, 120)); h = int(rng.integers(30, 55))
            s.rect(x, 129 - h, x + w, 129, body)
            for k in range(0, w - 14, 20):
                s.poly([(x + k, 129 - h), (x + k + 14, 129 - h - 12), (x + k + 14, 129 - h)], body)
            x += w + 20
        elif kind == 'stack':
            s.rect(x, 20, x + 10, 129, rust); s.rect(x - 2, 18, x + 12, 22, dark); x += 40
        elif kind == 'tank':
            s.ellipse(x, 70, x + 50, 129, body); s.rect(x, 100, x + 50, 129, body); x += 70
        else:
            s.rect(x + 10, 10, x + 14, 129, dark); s.rect(x - 30, 10, x + 60, 14, dark)
            s.line([(x + 50, 14), (x + 50, 60)], dark); x += 90
    return s.finish(outline=0.2, grain_scale=0.7)


def _pine(s, x, base, h, m, trunk):
    s.rect(x - 1, base - h // 5, x + 1, base, trunk)
    for k in range(4):
        top = base - h + k * h // 5
        half = 4 + k * h // 14
        s.poly([(x, top), (x - half, top + h // 3), (x + half, top + h // 3)], m)


def bg_forest_far():
    s = WrapSprite(BG_W, 120)
    m = s.material('#24302a', 8, 0.05); trunk = s.material('#1c1e1a', 4)
    rng = np.random.default_rng(15)
    for x in range(0, BG_W, 9):
        _pine(s, x + int(rng.integers(-3, 4)), 119, int(rng.integers(50, 110)), m, trunk)
    return s.finish(outline=0.1, grain_scale=0.7)


def bg_forest_near():
    s = WrapSprite(BG_W, 140)
    m = s.material('#1c2620', 10, 0.06); trunk = s.material('#20180f', 6)
    rng = np.random.default_rng(16)
    for x in range(0, BG_W, 26):
        _pine(s, x + int(rng.integers(-8, 9)), 139, int(rng.integers(80, 138)), m, trunk)
    return s.finish(outline=0.15, grain_scale=0.7)


def ground(base, joint, kind, w=96, h=48):
    s = WrapSprite(w, h)
    a = s.material(base, 12, 0.08)
    j = s.material(joint, 8, 0.03)
    s.rect(0, 0, w - 1, h - 1, a)
    rng = np.random.default_rng(len(kind) * 31)
    if kind == 'road':
        for _ in range(7):                                         # cracks
            x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
            pts = [(x, y)]
            for _ in range(5):
                x += int(rng.integers(-3, 4)); y += int(rng.integers(-1, 3)); pts.append((x, y))
            s.line(pts, j)
        s.rect(0, 6, w - 1, 6, j)
    elif kind == 'dirt':
        for _ in range(26):                                        # pebbles / clods
            x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
            s.rect(x, y, x + int(rng.integers(0, 2)), y, j)
    elif kind == 'grass':
        g = s.material('#3a4a26', 14, 0.08)
        for _ in range(40):
            x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
            s.line([(x, y), (x + int(rng.integers(-1, 2)), y - 2)], g)
    elif kind == 'concrete':
        for x in range(0, w, 32):
            s.rect(x, 0, x, h - 1, j)
        s.rect(0, 24, w - 1, 24, j)
    return s.finish(outline=0.0, grain_scale=0.9)



def exit_door():
    s = Sprite(24, 40, 1.5)    # 36x60
    frame = s.material('#3a3a36', 10); door = s.material('#4a3c2c', 14, 0.08)
    dark = s.material('#0e0c0a', 6); sign = s.material('#1e3a22', 8); letter = s.material('#7ac07a', 6, 0)
    handle = s.material('#a0a090', 6)
    s.rect(0, 8, 23, 39, frame); s.rect(3, 11, 20, 39, dark); s.rect(3, 11, 13, 39, door)
    s.px(11, 25, handle)
    s.rect(2, 0, 21, 6, sign)
    for i, ch in enumerate('EXIT'):
        for r, row in enumerate(FONT.get(ch, FONT[' '])):
            for c, bit in enumerate(row):
                if bit == '1':
                    s.px(4 + i * 4 + c, 1 + r, letter)
    return s.finish(outline=0.35)


def stairs(up=True):
    # Side view: bottom step sits on the walking floor (where feet are), the top
    # flight disappears into the back wall. Mirrored for "down".
    w, h, n = 62, 82, 8
    s = Sprite(w, h)
    tread = s.material('#5a524a', 12, 0.08); riser = s.material('#3e3832', 12, 0.08)
    edge = s.material('#7a7068', 10); side = s.material('#2c2824', 10, 0.06)
    rail = s.material('#24201c', 8); dark = s.material('#100e0c', 6)
    step_w, step_h = 7, 9
    for i in range(n):
        x0 = i * step_w
        y_top = h - 1 - (i + 1) * step_h
        s.rect(x0, y_top, w - 1, h - 1, side)              # solid mass under the flight
        s.rect(x0, y_top, x0 + step_w + 1, y_top + 2, tread)
        s.rect(x0, y_top + 3, x0 + 1, y_top + step_h, riser)
        s.rect(x0, y_top, x0 + step_w + 1, y_top, edge)
    s.rect(w - 4, 0, w - 1, h - 1, dark)                   # where it meets the wall
    # handrail with posts
    s.line([(3, h - 22), (w - 6, 4)], rail, width=2)
    for i in range(0, n, 2):
        x = i * step_w + 3
        y_top = h - 1 - (i + 1) * step_h
        s.rect(x, y_top - 18 + 2, x, y_top, rail)
    s.shade_gradient('y', 0.25)
    img = s.finish(outline=0.35)
    return img if up else img.transpose(Image.FLIP_LEFT_RIGHT)



def room_door():
    s = Sprite(22, 36, 1.55)   # 34x56: a doorway taller than a person
    frame = s.material('#3a322a', 10); door = s.material('#5a4028', 16, 0.1)
    dark = s.material('#0e0b08', 6); knob = s.material('#a09070', 6)
    s.rect(0, 0, 21, 35, frame); s.rect(2, 2, 19, 35, dark)
    s.rect(2, 2, 13, 35, door)                       # door left ajar
    s.rect(4, 5, 11, 15, s.material('#4a3420', 12)); s.rect(4, 19, 11, 31, s.material('#4a3420', 12))
    s.px(12, 20, knob)
    return s.finish(outline=0.35)


if __name__ == '__main__':
    only = set(sys.argv[1:])
    jobs = {
        'enemy_human.png': raider,
        'enemy_robot.png': robot,
        'enemy_drone.png': drone,
        'enemy_wolf.png': wolf,
        'dog.png': dog,
        'car_wreck.png': car_wreck,
        'tent.png': tent,
        'debris.png': debris,
        'bld_house_1.png': lambda: house(0),
        'bld_house_2.png': lambda: house(1),
        'bld_apartment.png': apartment,
        'bld_office.png': office,
        'bld_police.png': lambda: office('POLICE', '#22305a', (), True),
        'bld_church.png': church,
        'bld_factory.png': factory,
        'bld_hospital.png': hospital,
        'bld_pharmacy.png': pharmacy,
        'bld_mall.png': mall,
        'bld_cabin.png': cabin,
        # interior furniture
        'f_hospital_bed.png': hospital_bed, 'f_iv_stand.png': iv_stand, 'f_wheelchair.png': wheelchair,
        'f_desk.png': desk_monitor, 'f_office_chair.png': office_chair, 'f_filing.png': filing_cabinet,
        'f_machine.png': machine, 'f_conveyor.png': conveyor,
        'f_store_shelf.png': store_shelf,
        'f_med_shelf.png': lambda: store_shelf(('#e0dcc8', '#c04a3a', '#d8b040', '#4a8aa0'), medicine=True),
        'f_mannequin.png': mannequin, 'f_sofa.png': sofa, 'f_table.png': table_chairs,
        'f_bookshelf.png': bookshelf, 'f_pew.png': pew, 'f_church_cross.png': church_cross,
        # shelter furniture
        's_barrel.png': barrel, 's_water.png': water_jug, 's_stove.png': camp_stove,
        's_bed.png': bed, 's_bed_good.png': lambda: bed(True), 's_nightstand.png': nightstand,
        's_shelf.png': storage_shelf, 's_crates.png': crates, 's_workbench.png': workbench,
        's_medcab.png': med_cabinet, 's_cot.png': cot, 's_radio.png': radio_desk,
        's_gunrack.png': gun_rack, 's_sandbags.png': sandbags,
        # textures
        'tex_bunker.png': lambda: tex(48, '#3e3c36', '#2a2824', _bricks(24, 12)),
        'tex_wall_plaster.png': lambda: tex(48, '#4a443a', '#3a342c', _plain),
        'tex_wall_brick.png': lambda: tex(48, '#4e2e24', '#321c16', _bricks(12, 6)),
        'tex_wall_tile.png': lambda: tex(48, '#5a5e58', '#424640', _tiles(8)),
        'tex_wall_concrete.png': lambda: tex(48, '#3e4040', '#2c2e2e', _tiles(24)),
        'tex_wall_wood.png': lambda: tex(48, '#3e2a18', '#28180c', _planks(8, vertical=True)),
        'tex_wall_stone.png': lambda: tex(48, '#4a463e', '#34302a', _bricks(16, 8)),
        'tex_floor_wood.png': lambda: tex(48, '#3a2816', '#24180c', _planks(6)),
        'tex_floor_tile.png': lambda: tex(48, '#4e504a', '#363832', _tiles(12)),
        'tex_floor_concrete.png': lambda: tex(48, '#34332e', '#262520', _plain),
    }
    jobs.update({
        'bg_city_far.png': bg_city_far, 'bg_city_near.png': bg_city_near,
        'bg_suburb_near.png': bg_suburb_near, 'bg_industrial_near.png': bg_industrial_near,
        'bg_forest_far.png': bg_forest_far, 'bg_forest_near.png': bg_forest_near,
        'tex_ground_road.png': lambda: ground('#2e2c2a', '#1a1816', 'road'),
        'tex_ground_dirt.png': lambda: ground('#3a3022', '#241c12', 'dirt'),
        'tex_ground_grass.png': lambda: ground('#2e3220', '#1e2214', 'grass'),
        'tex_ground_concrete.png': lambda: ground('#3a3a36', '#26261f', 'concrete'),
        'tex_field.png': lambda: ground('#2a2620', '#1a1712', 'dirt', 128, 64),
    })
    jobs.update({'f_door.png': room_door, 'f_exit_door.png': exit_door, 'f_stairs_up.png': lambda: stairs(True),
                 'f_stairs_down.png': lambda: stairs(False)})
    jobs.update({
        'env_tree_1.png': lambda: round_tree(0), 'env_tree_2.png': lambda: round_tree(1),
        'env_tree_3.png': lambda: pine(128, 128, 6, 31, 22),
        'env_large_tree.png': lambda: pine(256, 256, 9, 41, 40),
        'env_dead_tree.png': dead_tree,
        'env_bush.png': lambda: bush(False), 'env_bush_berry.png': lambda: bush(True),
        'env_grass_1.png': lambda: grass(0), 'env_grass_2.png': lambda: grass(1),
        'env_bones_1.png': lambda: bones(0), 'env_bones_2.png': lambda: bones(1),
        'env_trash.png': trash_pile,
        'env_crate.png': crate, 'env_box.png': cardboard_box, 'env_chest.png': chest, 'env_locker.png': locker,
        'item_mushroom.png': lambda: it_mushroom(0), 'item_mushroom_2.png': lambda: it_mushroom(1),
        'item_wood.png': lambda: it_wood(0), 'item_wood_2.png': lambda: it_wood(1), 'item_wood_3.png': lambda: it_wood(2),
        'item_rope.png': it_rope,
    })
    jobs.update({'surf_raincatcher.png': surf_raincatcher})
    if not only or 'enemies' in only:
        enemy_sheets()
    jobs.update({'map_world.png': world_map,
                 'item_bike_wheels.png': lambda: it_bike_part('wheels'), 'item_bike_frame.png': lambda: it_bike_part('frame'),
                 'item_bike_chain.png': lambda: it_bike_part('chain'), 'item_bike_handlebars.png': lambda: it_bike_part('handlebars'),
                 'item_screws_nuts.png': lambda: it_bike_part('screws')})
    for _id, _fn in ITEM_ART.items():
        jobs['item_%s.png' % _id] = _fn
    for name, fn in jobs.items():
        if not only or name in only:
            save(fn(), name)
