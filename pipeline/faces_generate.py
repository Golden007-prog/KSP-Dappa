#!/usr/bin/env python3.12
"""KSP DAPPA - synthetic face gallery generator (Round 2, Phase 6).

Draws one procedural, parametric face per OffenderProfile PersonKey with
Pillow only - no model, no photo source, no external service. Every face is a
cartoon built from a deterministic parameter set ("spec") derived from a seed
string, so the same seed always yields the same face and the JS twin
(functions/dappa_api/lib/faces_spec.js) can re-derive the same spec for the
fixture/demo thumbnails without any binary asset in the repository.

Outputs (under --out, default pipeline/out/faces):
  <PersonKey>.png          512x512 gallery image (what Zia sees)
  thumbs/<PersonKey>.png   96x96 thumbnail for the gallery grid
  probes/<PersonKey>.png   a "second capture" of the same person (rotated,
                           rescaled, re-lit, other expression) for the
                           same-person / different-person calibration pairs
  manifest.json            one entry per face: keys, seed, spec, descriptor
  ../FaceGallery.csv       rows matching the FaceGallery Data Store columns
                           (PersonKey, ObjectKey, ThumbKey, Source, Seed,
                           QualityJson, Active) for `catalyst ds:import`

Deterministic under --seed. The spec derivation MUST stay in lockstep with
faces_spec.js (same FNV-1a hash, same mulberry32 PRNG, same draw order).

Usage:
  python3.12 pipeline/faces_generate.py [--count 200] [--seed 2026]
                                        [--keys P001,P002] [--out DIR]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, "out", "faces")
PROFILE_CSV = os.path.join(HERE, "out", "OffenderProfile.csv")
SOURCE = "procedural-v1"
SIZE = 512
SS = 2  # supersampling factor for anti-aliased edges
THUMB = 96
KEY_PREFIX = "face-gallery/v1"

# --------------------------------------------------------------- palettes
# Kept identical (order and values) in faces_spec.js.
SKIN = [
    (255, 224, 196), (245, 208, 178), (232, 190, 160), (222, 176, 143),
    (205, 158, 120), (190, 140, 105), (170, 120, 88), (150, 104, 72),
    (128, 86, 58), (108, 70, 46), (88, 56, 36), (70, 44, 28),
]
HAIR = [(28, 24, 22), (60, 40, 28), (100, 68, 42), (150, 150, 150), (225, 225, 222), (120, 50, 30)]
EYE = [(50, 32, 20), (90, 55, 30), (110, 90, 40), (90, 100, 110)]
BG = [(226, 232, 240), (214, 226, 236), (236, 228, 214), (222, 236, 226), (232, 222, 236), (240, 240, 236)]
SHIRT = [(52, 72, 110), (90, 60, 60), (60, 90, 70), (110, 90, 50), (70, 70, 80), (140, 60, 90)]
# (width factor, height factor, jaw factor) of the face outline, as a share of the canvas.
SHAPES = [
    ("oval", 0.62, 0.82, 1.00),
    ("round", 0.70, 0.76, 1.00),
    ("square", 0.68, 0.80, 1.15),
    ("long", 0.58, 0.88, 0.95),
    ("heart", 0.66, 0.80, 0.80),
]
HAIR_STYLES = ["bald", "buzz", "short", "side-part", "curly", "long", "bun", "receding"]
GLASSES = ["none", "round", "square"]
FACIAL_HAIR = ["none", "moustache", "goatee", "full-beard"]
MARKS = ["none", "mole-left", "mole-right", "scar"]


# ------------------------------------------------------------ determinism
def fnv1a32(s: str) -> int:
    h = 2166136261
    for ch in s.encode("utf-8"):
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def mulberry32(seed: int):
    """Exact port of the JS mulberry32 PRNG (unsigned 32-bit arithmetic)."""
    a = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t ^= 0  # keep the bit pattern explicit
        t = t ^ (t >> 14)
        return (t & 0xFFFFFFFF) / 4294967296.0

    return rnd


def pick(rnd, weights):
    """Weighted index pick; weights are relative, consumed in one rnd() call."""
    total = float(sum(weights))
    r = rnd() * total
    acc = 0.0
    for i, w in enumerate(weights):
        acc += w
        if r < acc:
            return i
    return len(weights) - 1


def spec_from_seed(seed: str) -> dict:
    """Seed string -> parameter set. Draw ORDER is part of the contract."""
    rnd = mulberry32(fnv1a32(seed))
    return {
        "shape": pick(rnd, [3, 3, 2, 2, 2]),
        "skin": pick(rnd, [1] * len(SKIN)),
        "hairStyle": pick(rnd, [1, 2, 4, 3, 2, 2, 1, 1]),
        "hairColor": pick(rnd, [5, 4, 3, 2, 1, 1]),
        "browThick": pick(rnd, [1, 2, 1]),
        "browAngle": pick(rnd, [1, 2, 1]) - 1,
        "eyeSize": pick(rnd, [1, 2, 1]),
        "eyeSpacing": pick(rnd, [1, 2, 1]),
        "eyeColor": pick(rnd, [4, 3, 2, 1]),
        "noseWidth": pick(rnd, [1, 2, 1]),
        "noseLen": pick(rnd, [1, 2, 1]),
        "mouthWidth": pick(rnd, [1, 2, 1]),
        "lipThick": pick(rnd, [1, 2, 1]),
        "smile": pick(rnd, [3, 2]),
        "glasses": pick(rnd, [13, 4, 3]),
        "facialHair": pick(rnd, [11, 4, 3, 2]),
        "mark": pick(rnd, [14, 2, 2, 2]),
        "earSize": pick(rnd, [1, 2, 1]),
        "bg": pick(rnd, [1] * len(BG)),
        "shirt": pick(rnd, [1] * len(SHIRT)),
    }


def spec_key(spec: dict) -> str:
    return "|".join(f"{k}={spec[k]}" for k in sorted(spec))


# ---------------------------------------------------------------- geometry
def face_outline(cx, cy, rx, ry, jaw, n=72):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = rx * math.cos(t)
        y = ry * math.sin(t)
        if y > 0:  # lower half: jaw / chin modulation
            f = 1.0 - (1.0 - jaw) * (y / ry)
            x *= max(0.55, min(1.35, f))
        pts.append((cx + x, cy + y))
    return pts


def descriptor(spec: dict) -> dict:
    """Analytic descriptor used by the local (non-Zia) similarity engine."""
    _, wf, hf, jaw = SHAPES[spec["shape"]]
    return {
        "skin": list(SKIN[spec["skin"]]),
        "hair": list(HAIR[spec["hairColor"]]) if spec["hairStyle"] != 0 else list(SKIN[spec["skin"]]),
        "widthRatio": round(wf, 3),
        "heightRatio": round(hf, 3),
        "jaw": jaw,
        "glasses": 1 if spec["glasses"] else 0,
        "facialHair": 1 if spec["facialHair"] else 0,
        "hairMass": [0.0, 0.15, 0.4, 0.45, 0.55, 0.9, 0.5, 0.25][spec["hairStyle"]],
    }


# ------------------------------------------------------------------ drawing
def draw_face(spec: dict, size: int = SIZE, smile_override=None) -> Image.Image:
    S = size * SS
    img = Image.new("RGB", (S, S), BG[spec["bg"]])
    d = ImageDraw.Draw(img)
    skin = SKIN[spec["skin"]]
    shade = tuple(max(0, c - 28) for c in skin)
    hair = HAIR[spec["hairColor"]]
    _, wf, hf, jaw = SHAPES[spec["shape"]]
    cx, cy = S * 0.5, S * 0.47
    rx, ry = S * wf * 0.5, S * hf * 0.5
    smile = spec["smile"] if smile_override is None else smile_override

    # shoulders / shirt
    d.ellipse([S * 0.05, S * 0.86, S * 0.95, S * 1.35], fill=SHIRT[spec["shirt"]])
    # neck
    d.rectangle([cx - rx * 0.28, cy + ry * 0.7, cx + rx * 0.28, S * 0.95], fill=shade)

    # hair mass behind the head (long / bun)
    style = HAIR_STYLES[spec["hairStyle"]]
    if style == "long":
        d.ellipse([cx - rx * 1.15, cy - ry * 1.05, cx + rx * 1.15, cy + ry * 1.25], fill=hair)
    if style == "bun":
        d.ellipse([cx - rx * 0.32, cy - ry * 1.28, cx + rx * 0.32, cy - ry * 0.85], fill=hair)

    # ears
    er = rx * (0.13 + 0.03 * spec["earSize"])
    ey = cy - ry * 0.02
    d.ellipse([cx - rx - er * 0.9, ey - er, cx - rx + er * 0.6, ey + er], fill=skin, outline=shade, width=max(1, S // 256))
    d.ellipse([cx + rx - er * 0.6, ey - er, cx + rx + er * 0.9, ey + er], fill=skin, outline=shade, width=max(1, S // 256))

    # face
    d.polygon(face_outline(cx, cy, rx, ry, jaw), fill=skin, outline=shade)

    # hair on top of the head
    if style in ("buzz", "short", "side-part", "curly", "bun", "receding", "long"):
        top = cy - ry
        if style == "buzz":
            d.chord([cx - rx * 0.98, top - ry * 0.02, cx + rx * 0.98, cy + ry * 0.12], 190, 350, fill=hair)
        elif style == "receding":
            d.chord([cx - rx * 0.98, top - ry * 0.02, cx + rx * 0.98, cy + ry * 0.05], 200, 340, fill=hair)
            d.polygon([(cx - rx * 0.35, top + ry * 0.02), (cx + rx * 0.35, top + ry * 0.02), (cx, top + ry * 0.24)], fill=skin)
        elif style == "curly":
            d.chord([cx - rx * 1.02, top - ry * 0.08, cx + rx * 1.02, cy + ry * 0.2], 185, 355, fill=hair)
            for k in range(-4, 5):
                px = cx + k * rx * 0.24
                py = top - ry * 0.02 + abs(k) * ry * 0.05
                r = rx * 0.14
                d.ellipse([px - r, py - r, px + r, py + r], fill=hair)
        else:
            d.chord([cx - rx * 1.02, top - ry * 0.06, cx + rx * 1.02, cy + ry * 0.25], 185, 355, fill=hair)
            if style == "side-part":
                d.polygon([(cx - rx * 0.9, top + ry * 0.12), (cx + rx * 0.2, top + ry * 0.02), (cx + rx * 0.55, top + ry * 0.32), (cx - rx * 0.75, top + ry * 0.36)], fill=hair)
            if style == "long":
                d.rectangle([cx - rx * 1.15, cy - ry * 0.2, cx - rx * 0.86, cy + ry * 1.2], fill=hair)
                d.rectangle([cx + rx * 0.86, cy - ry * 0.2, cx + rx * 1.15, cy + ry * 1.2], fill=hair)

    # eyes
    eye_y = cy - ry * 0.12
    spacing = rx * (0.36 + 0.06 * spec["eyeSpacing"])
    ew = rx * (0.15 + 0.03 * spec["eyeSize"])
    eh = ew * 0.62
    iris = EYE[spec["eyeColor"]]
    for sx in (-1, 1):
        ex = cx + sx * spacing
        d.ellipse([ex - ew, eye_y - eh, ex + ew, eye_y + eh], fill=(248, 246, 242), outline=(60, 45, 35), width=max(1, S // 300))
        ir = eh * 0.82
        d.ellipse([ex - ir, eye_y - ir, ex + ir, eye_y + ir], fill=iris)
        pr = ir * 0.48
        d.ellipse([ex - pr, eye_y - pr, ex + pr, eye_y + pr], fill=(15, 12, 10))
        hr = pr * 0.45
        d.ellipse([ex - ir * 0.45 - hr, eye_y - ir * 0.45 - hr, ex - ir * 0.45 + hr, eye_y - ir * 0.45 + hr], fill=(255, 255, 255))
        # brow
        bt = max(2, int(S * (0.006 + 0.004 * spec["browThick"])))
        by = eye_y - eh * 2.1
        tilt = spec["browAngle"] * eh * 0.45 * sx
        d.line([(ex - ew * 1.15, by + tilt), (ex + ew * 1.15, by - tilt)], fill=hair if spec["hairStyle"] else (50, 40, 35), width=bt)

    # nose
    nw = rx * (0.10 + 0.04 * spec["noseWidth"])
    nl = ry * (0.20 + 0.05 * spec["noseLen"])
    ny = cy + ry * 0.05
    d.line([(cx - nw * 0.15, eye_y + eh), (cx - nw * 0.2, ny + nl * 0.6)], fill=shade, width=max(2, S // 220))
    d.arc([cx - nw, ny + nl * 0.2, cx + nw, ny + nl], 10, 170, fill=shade, width=max(2, S // 220))

    # mouth
    mw = rx * (0.28 + 0.06 * spec["mouthWidth"])
    my = cy + ry * 0.48
    lip = (max(0, skin[0] - 60), max(0, skin[1] - 80), max(0, skin[2] - 70))
    lt = max(2, int(S * (0.005 + 0.004 * spec["lipThick"])))
    if smile:
        d.arc([cx - mw, my - mw * 0.55, cx + mw, my + mw * 0.35], 15, 165, fill=lip, width=lt)
    else:
        d.line([(cx - mw, my), (cx + mw, my)], fill=lip, width=lt)
        d.line([(cx - mw * 0.7, my + lt * 1.3), (cx + mw * 0.7, my + lt * 1.3)], fill=lip, width=max(1, lt // 2))

    # facial hair
    fh = FACIAL_HAIR[spec["facialHair"]]
    if fh == "moustache":
        d.chord([cx - mw * 1.1, my - mw * 0.8, cx + mw * 1.1, my - mw * 0.05], 180, 360, fill=hair)
    elif fh == "goatee":
        d.ellipse([cx - mw * 0.55, my + mw * 0.15, cx + mw * 0.55, cy + ry * 0.98], fill=hair)
    elif fh == "full-beard":
        beard = [p for p in face_outline(cx, cy + ry * 0.02, rx * 0.99, ry * 0.99, jaw) if p[1] > cy + ry * 0.18]
        beard = [(cx - rx * 0.93, cy + ry * 0.18)] + beard + [(cx + rx * 0.93, cy + ry * 0.18)]
        d.polygon(beard, fill=hair)
        # keep the mouth visible
        if smile:
            d.arc([cx - mw, my - mw * 0.55, cx + mw, my + mw * 0.35], 15, 165, fill=lip, width=lt)
        else:
            d.line([(cx - mw, my), (cx + mw, my)], fill=lip, width=lt)

    # glasses
    g = GLASSES[spec["glasses"]]
    if g != "none":
        gw = max(2, S // 200)
        r = ew * 1.35
        for sx in (-1, 1):
            ex = cx + sx * spacing
            box = [ex - r, eye_y - r * 0.85, ex + r, eye_y + r * 0.85]
            if g == "round":
                d.ellipse(box, outline=(40, 40, 45), width=gw)
            else:
                d.rounded_rectangle(box, radius=r * 0.25, outline=(40, 40, 45), width=gw)
        d.line([(cx - spacing + r, eye_y), (cx + spacing - r, eye_y)], fill=(40, 40, 45), width=gw)
        d.line([(cx - spacing - r, eye_y - r * 0.1), (cx - rx - er * 0.3, eye_y - r * 0.1)], fill=(40, 40, 45), width=gw)
        d.line([(cx + spacing + r, eye_y - r * 0.1), (cx + rx + er * 0.3, eye_y - r * 0.1)], fill=(40, 40, 45), width=gw)

    # marks
    m = MARKS[spec["mark"]]
    if m == "mole-left":
        r = S * 0.008
        d.ellipse([cx - rx * 0.55 - r, cy + ry * 0.3 - r, cx - rx * 0.55 + r, cy + ry * 0.3 + r], fill=(60, 40, 30))
    elif m == "mole-right":
        r = S * 0.008
        d.ellipse([cx + rx * 0.5 - r, cy + ry * 0.22 - r, cx + rx * 0.5 + r, cy + ry * 0.22 + r], fill=(60, 40, 30))
    elif m == "scar":
        d.line([(cx + rx * 0.45, cy - ry * 0.05), (cx + rx * 0.7, cy + ry * 0.22)], fill=(150, 90, 80), width=max(2, S // 260))

    return img.resize((size, size), Image.LANCZOS)


def probe_variant(spec: dict, rnd) -> Image.Image:
    """A second capture of the same person: rotated, rescaled, re-lit, flipped
    expression - what a different still of the same face looks like."""
    base = draw_face(spec, SIZE, smile_override=1 - spec["smile"])
    angle = (rnd() - 0.5) * 14
    scale = 0.9 + rnd() * 0.16
    dx, dy = int((rnd() - 0.5) * 40), int((rnd() - 0.5) * 30)
    img = base.rotate(angle, resample=Image.BICUBIC, fillcolor=BG[spec["bg"]])
    w = int(SIZE * scale)
    img = img.resize((w, w), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), BG[spec["bg"]])
    canvas.paste(img, ((SIZE - w) // 2 + dx, (SIZE - w) // 2 + dy))
    canvas = ImageEnhance.Brightness(canvas).enhance(0.88 + rnd() * 0.24)
    return canvas


# --------------------------------------------------------------------- main
def read_person_keys(limit: int) -> list[str]:
    if not os.path.exists(PROFILE_CSV):
        sys.exit(f"missing {PROFILE_CSV} - run pipeline/generate.py + analytics.py first, or pass --keys")
    keys = []
    with open(PROFILE_CSV, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            keys.append(row["PersonKey"])
            if len(keys) >= limit:
                break
    return keys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=200, help="faces to draw from OffenderProfile.csv (default 200)")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--keys", default="", help="explicit comma-separated PersonKeys instead of the CSV head")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--no-probes", action="store_true", help="skip the second-capture probe variants")
    args = ap.parse_args()

    keys = [k.strip() for k in args.keys.split(",") if k.strip()] if args.keys else read_person_keys(args.count)
    out = args.out
    os.makedirs(os.path.join(out, "thumbs"), exist_ok=True)
    if not args.no_probes:
        os.makedirs(os.path.join(out, "probes"), exist_ok=True)

    manifest = []
    seen = set()
    for pk in keys:
        salt = 0
        while True:
            seed = f"v1:{args.seed}:{pk}" + (f":{salt}" if salt else "")
            spec = spec_from_seed(seed)
            sk = spec_key(spec)
            if sk not in seen:
                seen.add(sk)
                break
            salt += 1  # identical parameter set already used -> re-salt so every face is distinct
        img = draw_face(spec)
        img.save(os.path.join(out, f"{pk}.png"), optimize=True)
        img.resize((THUMB, THUMB), Image.LANCZOS).save(os.path.join(out, "thumbs", f"{pk}.png"), optimize=True)
        if not args.no_probes:
            probe_variant(spec, mulberry32(fnv1a32(seed + ":probe"))).save(os.path.join(out, "probes", f"{pk}.png"), optimize=True)
        manifest.append({
            "personKey": pk,
            "seed": seed,
            "objectKey": f"{KEY_PREFIX}/{pk}.png",
            "thumbKey": f"{KEY_PREFIX}/thumbs/{pk}.png",
            "source": SOURCE,
            "spec": spec,
            "descriptor": descriptor(spec),
            "quality": {"gate": "pending", "generator": SOURCE, "width": SIZE, "height": SIZE},
            "active": True,
        })

    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump({"source": SOURCE, "seed": args.seed, "size": SIZE, "thumb": THUMB, "faces": manifest}, fh, indent=1)

    # The Data Store rows sit next to the images; the default run also drops a
    # copy at pipeline/out/FaceGallery.csv where `catalyst ds:import` expects it.
    csv_paths = [os.path.join(out, "FaceGallery.csv")]
    if os.path.abspath(out) == os.path.abspath(DEFAULT_OUT):
        csv_paths.append(os.path.join(HERE, "out", "FaceGallery.csv"))
    for csv_path in csv_paths:
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["PersonKey", "ObjectKey", "ThumbKey", "Source", "Seed", "QualityJson", "Active"])
            for m in manifest:
                w.writerow([m["personKey"], m["objectKey"], m["thumbKey"], m["source"], m["seed"], json.dumps(m["quality"], separators=(",", ":")), "true"])
    csv_path = csv_paths[-1]

    distinct = len({spec_key(m["spec"]) for m in manifest})
    print(f"faces: {len(manifest)} drawn ({distinct} distinct parameter sets) -> {out}")
    print(f"manifest: {os.path.join(out, 'manifest.json')}")
    print(f"data store rows: {csv_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
