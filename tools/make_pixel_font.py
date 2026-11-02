"""Build public/fonts/craftax-pixel.woff: the game's 5x7 pixel font (js/pixeltitle.ts FONT) as a real web font, so whole screens (Settings,
Controls) can be set in it with plain CSS. Each lit font pixel becomes a square; a few extra glyphs (brackets, slash, percent...)
are added here. Run: node dumps FONT, fontTools builds the font.

    PYTHONPATH=<fonttools> python3 make_pixel_font.py
"""
import json, os, subprocess
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = subprocess.check_output(["node", "-e", """
const s = require('fs').readFileSync(process.argv[1], 'utf8');
const m = s.match(/const FONT(?::[^=]+)? = (\\{[\\s\\S]*?\\n\\});/);
process.stdout.write(JSON.stringify(eval('(' + m[1] + ')')));
""", os.path.join(ROOT, "js", "pixeltitle.ts")])
FONT = json.loads(src)
EXTRA = {
    "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
    ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
    ";": ["00", "11", "11", "00", "11", "01", "10"],
    "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
    "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
    ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
    "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
    "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
    "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
    "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
    "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01111"],
    "[": ["111", "100", "100", "100", "100", "100", "111"],
    "]": ["111", "001", "001", "001", "001", "001", "111"],
    "…": ["00000", "00000", "00000", "00000", "00000", "00000", "10101"],
    "·": ["0", "0", "0", "1", "0", "0", "0"],
    "×": ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
    "↗": ["00000", "01111", "00011", "00101", "01001", "10000", "00000"],
    "→": ["00000", "00100", "00010", "11111", "00010", "00100", "00000"],
    "←": ["00000", "00100", "01000", "11111", "01000", "00100", "00000"],
    "↑": ["00100", "01110", "10101", "00100", "00100", "00100", "00100"],
    "↓": ["00100", "00100", "00100", "00100", "10101", "01110", "00100"],
    "−": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "–": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "—": ["0000000", "0000000", "0000000", "1111111", "0000000", "0000000", "0000000"],
    "’": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
    "|": ["1", "1", "1", "1", "1", "1", "1"],
    "~": ["00000", "00000", "01000", "10101", "00010", "00000", "00000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
}
glyphs = {**FONT, **{k: v for k, v in EXTRA.items() if k not in FONT}}
P = 125                                        # a font pixel, in units: 8 a em, so 16px text draws 2px pixels, crisp
names, cmap, adv, outlines = [".notdef", "space"], {32: "space"}, {".notdef": (6 * P, 0), "space": (4 * P, 0)}, {}
for ch, rows in glyphs.items():
    if ch == " ":
        continue
    name = "u%04X" % ord(ch)
    names.append(name); cmap[ord(ch)] = name
    w = max(len(r) for r in rows)
    adv[name] = ((w + 1) * P, 0)
    rects = []
    for y, row in enumerate(rows):               # row 0 is the top of the cap height (7 rows); rows 7, 8 hang below the baseline
        for x, b in enumerate(row):
            if b == "1":
                top = (7 - y) * P
                rects.append((x * P, top - P, (x + 1) * P, top))
    outlines[name] = rects
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap(cmap)
glyf = {}
for n in names:
    pen = TTGlyphPen(None)
    for x0, y0, x1, y1 in outlines.get(n, []):
        pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    glyf[n] = pen.glyph()
fb.setupGlyf(glyf)
fb.setupHorizontalMetrics(adv)
fb.setupHorizontalHeader(ascent=8 * P, descent=-3 * P)
fb.setupNameTable({"familyName": "Craftax Pixel", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=8 * P, sTypoDescender=-3 * P, usWinAscent=8 * P, usWinDescent=3 * P)
fb.setupPost()
fb.font.flavor = "woff"
fb.save(os.path.join(ROOT, "public", "fonts", "craftax-pixel.woff"))
print(len(names), "glyphs")
