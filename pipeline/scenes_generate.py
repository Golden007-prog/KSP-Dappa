"""Synthetic evidence scenes for Zia Object Recognition (backlog rows 169/151).

Draws three procedural scenes with Pillow — a bag on a floor, a two-wheeler
silhouette on a road, a knife outline on a table — and writes:

  client/public/samples/scenes/scene_01.png … scene_03.png   (the images)
  client/public/samples/scenes/manifest.json                 (what was drawn)
  functions/dappa_api/assets/scenes_manifest.json            (same manifest,
      bundled with the function because the client tree is not deployed
      with it — lib/objects.js reads this copy for the fixture path)

No photograph, no person, no real evidence: every pixel is generated here.
Boxes are [x1, y1, x2, y2] in image pixels, the same convention Zia's
`co_ordinates` uses, so the panel can draw either set the same way.

Run:  python3.12 pipeline/scenes_generate.py
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_CLIENT = ROOT / "client" / "public" / "samples" / "scenes"
OUT_FN = ROOT / "functions" / "dappa_api" / "assets"
W, H = 960, 640
SEED = 20260828


def paper(rng: random.Random, base: tuple[int, int, int]) -> Image.Image:
    """Flat colour with faint noise so the image is not a single-colour block."""
    img = Image.new("RGB", (W, H), base)
    px = img.load()
    for _ in range(9000):
        x, y = rng.randrange(W), rng.randrange(H)
        r, g, b = px[x, y]
        d = rng.randint(-10, 10)
        px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))
    return img


def shadow(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x1, y1, x2, y2 = box
    d.ellipse((x1 - 20, y2 - 30, x2 + 20, y2 + 24), fill=(0, 0, 0, 70))
    layer = layer.filter(ImageFilter.GaussianBlur(14))
    img.paste(layer, (0, 0), layer)


def scene_bag(rng: random.Random) -> tuple[Image.Image, list[dict]]:
    img = paper(rng, (196, 186, 170))
    d = ImageDraw.Draw(img)
    # floor tiles
    for x in range(0, W, 120):
        d.line((x, 0, x, H), fill=(178, 168, 152), width=2)
    for y in range(0, H, 120):
        d.line((0, y, W, y), fill=(178, 168, 152), width=2)
    box = (330, 210, 640, 500)
    shadow(img, box)
    # body
    d.rounded_rectangle((box[0], box[1] + 70, box[2], box[3]), radius=26, fill=(72, 52, 40), outline=(40, 28, 20), width=4)
    # flap
    d.rounded_rectangle((box[0] + 10, box[1] + 60, box[2] - 10, box[1] + 170), radius=18, fill=(92, 66, 50), outline=(40, 28, 20), width=4)
    # handles
    d.arc((box[0] + 60, box[1], box[2] - 60, box[1] + 150), start=180, end=360, fill=(40, 28, 20), width=14)
    d.arc((box[0] + 80, box[1] + 12, box[2] - 80, box[1] + 150), start=180, end=360, fill=(120, 90, 66), width=6)
    # clasp
    d.rectangle((box[0] + 140, box[1] + 150, box[0] + 170, box[1] + 190), fill=(200, 170, 80), outline=(120, 100, 40), width=2)
    # stitching
    for y in (box[1] + 200, box[3] - 24):
        for x in range(box[0] + 24, box[2] - 24, 18):
            d.line((x, y, x + 8, y), fill=(140, 110, 84), width=2)
    return img, [{"label": "handbag", "family": "item", "box": list(box)}]


def scene_two_wheeler(rng: random.Random) -> tuple[Image.Image, list[dict]]:
    img = paper(rng, (118, 122, 126))
    d = ImageDraw.Draw(img)
    # road with a centre line
    d.rectangle((0, 380, W, H), fill=(74, 76, 80))
    for x in range(0, W, 90):
        d.rectangle((x, 500, x + 50, 512), fill=(230, 220, 120))
    box = (210, 170, 770, 470)
    shadow(img, box)
    black = (24, 24, 28)
    # wheels
    for cx in (300, 690):
        d.ellipse((cx - 70, 330, cx + 70, 470), fill=black)
        d.ellipse((cx - 44, 356, cx + 44, 444), fill=(96, 96, 100))
        d.ellipse((cx - 10, 390, cx + 10, 410), fill=black)
        for k in range(8):
            a = k * math.pi / 4
            d.line((cx, 400, cx + 40 * math.cos(a), 400 + 40 * math.sin(a)), fill=black, width=3)
    # frame + body
    d.polygon([(300, 400), (400, 250), (560, 250), (690, 400), (560, 400), (470, 330), (380, 400)], fill=(168, 32, 40), outline=black)
    d.line((300, 400, 420, 250), fill=black, width=10)
    d.line((690, 400, 560, 250), fill=black, width=10)
    # seat
    d.rounded_rectangle((420, 214, 600, 250), radius=12, fill=black)
    # tank
    d.ellipse((380, 230, 520, 300), fill=(200, 40, 50), outline=black, width=3)
    # handlebar + headlamp
    d.line((600, 250, 660, 190), fill=black, width=8)
    d.line((640, 190, 720, 200), fill=black, width=8)
    d.ellipse((700, 230, 760, 290), fill=(250, 240, 180), outline=black, width=3)
    # exhaust
    d.line((470, 400, 640, 430), fill=(190, 190, 196), width=12)
    # number plate deliberately blank
    d.rectangle((236, 300, 320, 336), fill=(235, 235, 230), outline=black, width=2)
    return img, [{"label": "motorcycle", "family": "vehicle", "box": list(box)}]


def scene_knife(rng: random.Random) -> tuple[Image.Image, list[dict]]:
    img = paper(rng, (150, 118, 84))
    d = ImageDraw.Draw(img)
    # wood grain
    for y in range(0, H, 28):
        d.line((0, y + rng.randint(-4, 4), W, y + rng.randint(-4, 4)), fill=(136, 104, 72), width=2)
    # evidence ruler (numbers only, synthetic)
    d.rectangle((80, 560, 880, 596), fill=(245, 245, 240), outline=(60, 60, 60), width=2)
    for i, x in enumerate(range(90, 880, 40)):
        d.line((x, 560, x, 578 if i % 5 else 592), fill=(50, 50, 50), width=2)
    box = (160, 250, 810, 370)
    shadow(img, box)
    # blade
    d.polygon([(160, 300), (560, 262), (600, 250), (600, 340), (560, 350), (160, 330)], fill=(214, 218, 224), outline=(70, 74, 80))
    d.line((175, 316, 560, 300), fill=(150, 154, 160), width=3)
    # bolster
    d.rectangle((596, 252, 626, 352), fill=(60, 60, 64))
    # handle with rivets
    d.rounded_rectangle((622, 262, 810, 360), radius=22, fill=(44, 36, 30), outline=(20, 16, 12), width=3)
    for cx in (665, 720, 775):
        d.ellipse((cx - 7, 304, cx + 7, 318), fill=(200, 200, 200))
    return img, [{"label": "knife", "family": "weapon", "box": list(box)}]


def main() -> None:
    rng = random.Random(SEED)
    OUT_CLIENT.mkdir(parents=True, exist_ok=True)
    OUT_FN.mkdir(parents=True, exist_ok=True)
    scenes = []
    for i, (title, fn) in enumerate([
        ("Recovered handbag on a station floor", scene_bag),
        ("Two-wheeler with a blank number plate", scene_two_wheeler),
        ("Knife on a table beside an evidence ruler", scene_knife),
    ], start=1):
        img, objects = fn(rng)
        file = f"scene_{i:02d}.png"
        img.save(OUT_CLIENT / file, optimize=True)
        scenes.append({
            "sceneId": f"scene_{i:02d}",
            "file": file,
            "title": title,
            "width": W,
            "height": H,
            "synthetic": True,
            "generator": "pipeline/scenes_generate.py",
            "objects": objects,
        })
    manifest = {"generatedBy": "pipeline/scenes_generate.py", "seed": SEED, "note": "procedural drawings, no photographs; boxes are [x1,y1,x2,y2] px", "scenes": scenes}
    (OUT_CLIENT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (OUT_FN / "scenes_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    for s in scenes:
        print(f"{s['file']}  {W}x{H}  {[o['label'] for o in s['objects']]}")


if __name__ == "__main__":
    main()
