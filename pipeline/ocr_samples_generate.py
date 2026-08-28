"""Synthetic FIR-like scans for the Zia OCR client surface (backlog row 158).

Renders three "scanned complaint" stills with Pillow — paper texture, a
typed English body, a Kannada line (Nirmala UI carries the Kannada block on
Windows; Noto Sans Kannada is tried first on other hosts), a light skew and
scanner noise — and writes:

  client/public/samples/ocr/fir_01.jpg … fir_03.jpg
  client/public/samples/ocr/manifest.json            (ground-truth text)
  functions/dappa_api/assets/ocr_manifest.json       (same, for /ocr/samples)

Every name, number and address is invented. The bodies reuse the MO
vocabulary lib/zia.js already extracts (two-wheeler, gas-cutter, OTP …) so
the recovered text lights up the same entity/keyword/MO panel a real scan
would.

Run:  python3.12 pipeline/ocr_samples_generate.py
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_CLIENT = ROOT / "client" / "public" / "samples" / "ocr"
OUT_FN = ROOT / "functions" / "dappa_api" / "assets"
W, H = 992, 1403  # A4 at 120 dpi; JPEG q85 keeps each scan under the API's 1 MB JSON body limit once base64-encoded
SEED = 20260828

FONT_CANDIDATES_LATIN = [
    "C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf", "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]
FONT_CANDIDATES_KANNADA = [
    "/usr/share/fonts/truetype/noto/NotoSansKannada-Regular.ttf",
    ("C:/Windows/Fonts/Nirmala.ttc", 0),
    "C:/Windows/Fonts/tunga.ttf",
]

SAMPLES = [
    {
        "sampleId": "fir_01",
        "title": "Chain snatching, Devaraja Market",
        "district": "Mysuru City",
        "station": "Devaraja PS",
        "crimeNo": "1010310312026000412",
        "sections": "BNS 304, 351",
        "kannada": "ದೂರುದಾರರು: ಲಕ್ಷ್ಮಮ್ಮ ಗೌಡ · ಸರ ಕಳ್ಳತನ · ದೇವರಾಜ ಮಾರುಕಟ್ಟೆ",
        "body": [
            "The complainant Lakshmamma Gowda, aged 52, resident of Nazarbad, states",
            "that on 14-07-2026 at about 21:40 hrs while she was walking near Devaraja",
            "Market two unknown persons on a two-wheeler without number plate came from",
            "behind and snatched her gold mangalsutra weighing about 24 grams. One of",
            "the accused brandished a knife and threatened her before they fled towards",
            "Sayyaji Rao Road. Property worth Rs. 1,45,000 was stolen. Hence this",
            "complaint. Requested to take necessary action.",
        ],
    },
    {
        "sampleId": "fir_02",
        "title": "House-breaking by night, Peenya",
        "district": "Bengaluru City",
        "station": "Peenya PS",
        "crimeNo": "1010110122026001188",
        "sections": "BNS 331(4), 305",
        "kannada": "ರಾತ್ರಿ ಮನೆ ಒಡೆತ · ಪೀಣ್ಯ ಠಾಣೆ · ಆಸ್ತಿ ಅಪರಾಧ",
        "body": [
            "Complainant Shivakumar Hegde, aged 46, of 2nd Stage Peenya, reports that",
            "between 23:30 hrs on 02-08-2026 and 05:15 hrs on 03-08-2026 unknown persons",
            "committed house breaking by lock-breaking the rear door with a gas-cutter",
            "while the family was away at Tumakuru. Cash of Rs. 60,000 and gold",
            "ornaments of about 40 grams kept in the bedroom almirah were stolen.",
            "Neighbours heard a motorcycle leaving at around 04:00 hrs. Requested",
            "to register a case and investigate.",
        ],
    },
    {
        "sampleId": "fir_03",
        "title": "OTP fraud posing as bank staff",
        "district": "Mangaluru City",
        "station": "Kadri PS",
        "crimeNo": "1010510522026000731",
        "sections": "BNS 318(4), IT Act 66D",
        "kannada": "ಸೈಬರ್ ಅಪರಾಧ · ಆನ್‌ಲೈನ್ ವಂಚನೆ · ಕದ್ರಿ ಠಾಣೆ",
        "body": [
            "The complainant Rekha Shetty, aged 34, states that on 19-08-2026 at 11:20",
            "hrs she received a call from a person posing as bank staff who said her",
            "KYC update was pending and asked for the OTP sent to her phone. After she",
            "shared the one-time password an amount of Rs. 1,20,000 was transferred",
            "from her savings account in three transactions. The caller then switched",
            "off the phone. She requests action against the unknown accused and",
            "recovery of the amount.",
        ],
    },
]


def load_font(cands, size):
    for c in cands:
        try:
            if isinstance(c, tuple):
                return ImageFont.truetype(c[0], size, index=c[1])
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()


def paper(rng: random.Random) -> Image.Image:
    img = Image.new("L", (W, H), 236)
    px = img.load()
    for _ in range(60000):
        x, y = rng.randrange(W), rng.randrange(H)
        px[x, y] = max(200, min(255, px[x, y] + rng.randint(-14, 10)))
    # a faint fold line and a coffee-ring style blotch
    d = ImageDraw.Draw(img)
    d.line((0, H // 2 + rng.randint(-20, 20), W, H // 2 + rng.randint(-20, 20)), fill=222, width=3)
    d.ellipse((W - 380, 140, W - 180, 340), outline=214, width=6)
    return img.filter(ImageFilter.GaussianBlur(0.6)).convert("RGB")


def render(sample: dict, rng: random.Random) -> Image.Image:
    img = paper(rng)
    d = ImageDraw.Draw(img)
    mono = load_font(FONT_CANDIDATES_LATIN, 22)  # 75-char lines fit inside 992 px
    small = load_font(FONT_CANDIDATES_LATIN, 19)
    kn = load_font(FONT_CANDIDATES_KANNADA, 30)
    ink = (28, 30, 40)
    x0, y = 80, 100
    d.text((x0, y), "FIRST INFORMATION REPORT (FIR)", font=mono, fill=ink)
    y += 46
    d.text((x0, y), "(Under Section 173 BNSS, 2023)  --  SYNTHETIC SAMPLE", font=small, fill=ink)
    y += 60
    d.text((x0, y), sample["kannada"], font=kn, fill=ink)
    y += 70
    d.line((x0, y, W - x0, y), fill=(90, 90, 100), width=2)
    y += 26
    for label, val in [
        ("District", sample["district"]),
        ("Police Station", sample["station"]),
        ("Crime No.", sample["crimeNo"]),
        ("Sections", sample["sections"]),
    ]:
        d.text((x0, y), f"{label:<16}: {val}", font=mono, fill=ink)
        y += 42
    y += 20
    d.text((x0, y), "Brief facts:", font=mono, fill=ink)
    y += 50
    for line in sample["body"]:
        d.text((x0, y), line, font=mono, fill=ink)
        y += 36
    y += 40
    d.text((x0, y), "Signature of complainant: __________", font=small, fill=ink)
    d.text((x0 + 560, y), "SHO: __________", font=small, fill=ink)
    # station round stamp (text only)
    d.ellipse((W - 420, H - 420, W - 140, H - 140), outline=(120, 40, 60), width=5)
    d.text((W - 372, H - 300), sample["station"].upper(), font=small, fill=(120, 40, 60))
    # slight scanner skew + re-noise
    img = img.rotate(rng.uniform(-0.8, 0.8), resample=Image.BICUBIC, fillcolor=(230, 230, 226))
    return img


def main() -> None:
    rng = random.Random(SEED)
    OUT_CLIENT.mkdir(parents=True, exist_ok=True)
    OUT_FN.mkdir(parents=True, exist_ok=True)
    out = []
    for s in SAMPLES:
        img = render(s, rng)
        file = f"{s['sampleId']}.jpg"
        img.save(OUT_CLIENT / file, quality=85, optimize=True)
        out.append({
            "sampleId": s["sampleId"],
            "file": file,
            "title": s["title"],
            "district": s["district"],
            "station": s["station"],
            "crimeNo": s["crimeNo"],
            "language": "eng",
            "kannadaLine": s["kannada"],
            "truthText": " ".join(s["body"]),
            "synthetic": True,
            "generator": "pipeline/ocr_samples_generate.py",
        })
        print(f"{file}  {W}x{H}  {s['title']}")
    manifest = {"generatedBy": "pipeline/ocr_samples_generate.py", "seed": SEED, "note": "invented names, numbers and addresses; typed text over a synthetic paper texture", "samples": out}
    (OUT_CLIENT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUT_FN / "ocr_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
