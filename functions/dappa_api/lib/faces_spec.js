'use strict';
// JS twin of pipeline/faces_generate.py — seed string -> face parameter set.
//
// The gallery images that Zia sees are PNGs drawn by the Python generator and
// stored in Stratus. This module re-derives the SAME parameter set from the
// stored Seed (same FNV-1a hash, same mulberry32 PRNG, same pick order and
// weights), so the API can (a) render an SVG stand-in thumbnail when the
// object store is unreachable or in fixture/test mode — no binary asset lives
// in the repository — and (b) compute the analytic descriptor the local
// similarity engine compares probe images against. The two files MUST change
// together; test/run.mjs pins the P00001 / P001 specs printed by the Python side.

const SKIN = [
  [255, 224, 196], [245, 208, 178], [232, 190, 160], [222, 176, 143],
  [205, 158, 120], [190, 140, 105], [170, 120, 88], [150, 104, 72],
  [128, 86, 58], [108, 70, 46], [88, 56, 36], [70, 44, 28]
];
const HAIR = [[28, 24, 22], [60, 40, 28], [100, 68, 42], [150, 150, 150], [225, 225, 222], [120, 50, 30]];
const EYE = [[50, 32, 20], [90, 55, 30], [110, 90, 40], [90, 100, 110]];
const BG = [[226, 232, 240], [214, 226, 236], [236, 228, 214], [222, 236, 226], [232, 222, 236], [240, 240, 236]];
const SHIRT = [[52, 72, 110], [90, 60, 60], [60, 90, 70], [110, 90, 50], [70, 70, 80], [140, 60, 90]];
const SHAPES = [
  ['oval', 0.62, 0.82, 1.0],
  ['round', 0.70, 0.76, 1.0],
  ['square', 0.68, 0.80, 1.15],
  ['long', 0.58, 0.88, 0.95],
  ['heart', 0.66, 0.80, 0.80]
];
const HAIR_STYLES = ['bald', 'buzz', 'short', 'side-part', 'curly', 'long', 'bun', 'receding'];
const HAIR_MASS = [0.0, 0.15, 0.4, 0.45, 0.55, 0.9, 0.5, 0.25];
const GLASSES = ['none', 'round', 'square'];
const FACIAL_HAIR = ['none', 'moustache', 'goatee', 'full-beard'];
const MARKS = ['none', 'mole-left', 'mole-right', 'scar'];

function fnv1a32(str) {
  let h = 2166136261;
  for (const b of Buffer.from(String(str), 'utf8')) {
    h ^= b;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t) >>> 0;
    t = (t + (Math.imul(t ^ (t >>> 7), 61 | t) >>> 0)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}

function pick(rnd, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  const r = rnd() * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}

/** Seed string -> spec. Draw order and weights mirror faces_generate.py. */
function specFromSeed(seed) {
  const rnd = mulberry32(fnv1a32(seed));
  return {
    shape: pick(rnd, [3, 3, 2, 2, 2]),
    skin: pick(rnd, SKIN.map(() => 1)),
    hairStyle: pick(rnd, [1, 2, 4, 3, 2, 2, 1, 1]),
    hairColor: pick(rnd, [5, 4, 3, 2, 1, 1]),
    browThick: pick(rnd, [1, 2, 1]),
    browAngle: pick(rnd, [1, 2, 1]) - 1,
    eyeSize: pick(rnd, [1, 2, 1]),
    eyeSpacing: pick(rnd, [1, 2, 1]),
    eyeColor: pick(rnd, [4, 3, 2, 1]),
    noseWidth: pick(rnd, [1, 2, 1]),
    noseLen: pick(rnd, [1, 2, 1]),
    mouthWidth: pick(rnd, [1, 2, 1]),
    lipThick: pick(rnd, [1, 2, 1]),
    smile: pick(rnd, [3, 2]),
    glasses: pick(rnd, [13, 4, 3]),
    facialHair: pick(rnd, [11, 4, 3, 2]),
    mark: pick(rnd, [14, 2, 2, 2]),
    earSize: pick(rnd, [1, 2, 1]),
    bg: pick(rnd, BG.map(() => 1)),
    shirt: pick(rnd, SHIRT.map(() => 1))
  };
}

/** Analytic descriptor of a spec — what the local engine measures on pixels. */
function descriptor(spec) {
  const [, wf, hf, jaw] = SHAPES[spec.shape];
  return {
    skin: SKIN[spec.skin].slice(),
    hair: spec.hairStyle === 0 ? SKIN[spec.skin].slice() : HAIR[spec.hairColor].slice(),
    widthRatio: Math.round(wf * 1000) / 1000,
    heightRatio: Math.round(hf * 1000) / 1000,
    jaw,
    glasses: spec.glasses ? 1 : 0,
    facialHair: spec.facialHair ? 1 : 0,
    hairMass: HAIR_MASS[spec.hairStyle]
  };
}

/** Human-readable trait words for the UI (never demographic inference — these
 * are the drawing parameters, i.e. what the picture literally contains). */
function traits(spec) {
  const out = [SHAPES[spec.shape][0] + ' face', HAIR_STYLES[spec.hairStyle] + ' hair'];
  if (spec.glasses) out.push(GLASSES[spec.glasses] + ' glasses');
  if (spec.facialHair) out.push(FACIAL_HAIR[spec.facialHair]);
  if (spec.mark) out.push(MARKS[spec.mark]);
  return out;
}

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const f1 = (n) => Math.round(n * 10) / 10;

function outline(cx, cy, rx, ry, jaw, n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const t = (2 * Math.PI * i) / n;
    let x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    if (y > 0) x *= Math.max(0.55, Math.min(1.35, 1 - (1 - jaw) * (y / ry)));
    pts.push(`${f1(cx + x)},${f1(cy + y)}`);
  }
  return pts.join(' ');
}

/**
 * SVG rendering of a spec — the same geometry as draw_face() in Python,
 * expressed as vector primitives. Used for fixture/demo thumbnails only; the
 * PNG in Stratus stays the image of record for Zia.
 */
function renderSvg(spec, size) {
  const S = Number(size) || 96;
  const skin = SKIN[spec.skin];
  const shade = skin.map((c) => Math.max(0, c - 28));
  const hair = HAIR[spec.hairColor];
  const [, wf, hf, jaw] = SHAPES[spec.shape];
  const cx = S * 0.5;
  const cy = S * 0.47;
  const rx = S * wf * 0.5;
  const ry = S * hf * 0.5;
  const style = HAIR_STYLES[spec.hairStyle];
  const parts = [];
  const add = (s) => parts.push(s);
  add(`<rect width="${S}" height="${S}" fill="${rgb(BG[spec.bg])}"/>`);
  add(`<ellipse cx="${f1(S * 0.5)}" cy="${f1(S * 1.105)}" rx="${f1(S * 0.45)}" ry="${f1(S * 0.245)}" fill="${rgb(SHIRT[spec.shirt])}"/>`);
  add(`<rect x="${f1(cx - rx * 0.28)}" y="${f1(cy + ry * 0.7)}" width="${f1(rx * 0.56)}" height="${f1(S * 0.95 - (cy + ry * 0.7))}" fill="${rgb(shade)}"/>`);
  if (style === 'long') add(`<ellipse cx="${f1(cx)}" cy="${f1(cy + ry * 0.1)}" rx="${f1(rx * 1.15)}" ry="${f1(ry * 1.15)}" fill="${rgb(hair)}"/>`);
  if (style === 'bun') add(`<circle cx="${f1(cx)}" cy="${f1(cy - ry * 1.065)}" r="${f1(rx * 0.3)}" fill="${rgb(hair)}"/>`);
  const er = rx * (0.13 + 0.03 * spec.earSize);
  const ey = cy - ry * 0.02;
  for (const sx of [-1, 1]) {
    add(`<ellipse cx="${f1(cx + sx * (rx - er * 0.15))}" cy="${f1(ey)}" rx="${f1(er * 0.75)}" ry="${f1(er)}" fill="${rgb(skin)}" stroke="${rgb(shade)}" stroke-width="${f1(S / 256)}"/>`);
  }
  add(`<polygon points="${outline(cx, cy, rx, ry, jaw, 72)}" fill="${rgb(skin)}" stroke="${rgb(shade)}" stroke-width="1"/>`);
  const top = cy - ry;
  if (style !== 'bald') {
    // hair cap: the upper part of a wider ellipse, clipped at a horizontal line
    const capBottom = style === 'buzz' ? cy + ry * 0.12 : style === 'receding' ? cy + ry * 0.05 : cy + ry * 0.25;
    const capRy = (capBottom - (top - ry * 0.06)) / 2;
    const capCy = top - ry * 0.06 + capRy;
    const cutY = capCy - capRy * Math.sin((style === 'buzz' ? 10 : 5) * Math.PI / 180) * 0 + capRy * 0.17;
    add(`<clipPath id="cap"><rect x="0" y="0" width="${S}" height="${f1(cutY)}"/></clipPath>`);
    add(`<ellipse cx="${f1(cx)}" cy="${f1(capCy)}" rx="${f1(rx * 1.02)}" ry="${f1(capRy)}" fill="${rgb(hair)}" clip-path="url(#cap)"/>`);
    if (style === 'receding') add(`<polygon points="${f1(cx - rx * 0.35)},${f1(top + ry * 0.02)} ${f1(cx + rx * 0.35)},${f1(top + ry * 0.02)} ${f1(cx)},${f1(top + ry * 0.24)}" fill="${rgb(skin)}"/>`);
    if (style === 'curly') {
      for (let k = -4; k <= 4; k += 1) {
        add(`<circle cx="${f1(cx + k * rx * 0.24)}" cy="${f1(top - ry * 0.02 + Math.abs(k) * ry * 0.05)}" r="${f1(rx * 0.14)}" fill="${rgb(hair)}"/>`);
      }
    }
    if (style === 'side-part') {
      add(`<polygon points="${f1(cx - rx * 0.9)},${f1(top + ry * 0.12)} ${f1(cx + rx * 0.2)},${f1(top + ry * 0.02)} ${f1(cx + rx * 0.55)},${f1(top + ry * 0.32)} ${f1(cx - rx * 0.75)},${f1(top + ry * 0.36)}" fill="${rgb(hair)}"/>`);
    }
    if (style === 'long') {
      add(`<rect x="${f1(cx - rx * 1.15)}" y="${f1(cy - ry * 0.2)}" width="${f1(rx * 0.29)}" height="${f1(ry * 1.4)}" fill="${rgb(hair)}"/>`);
      add(`<rect x="${f1(cx + rx * 0.86)}" y="${f1(cy - ry * 0.2)}" width="${f1(rx * 0.29)}" height="${f1(ry * 1.4)}" fill="${rgb(hair)}"/>`);
    }
  }
  const eyeY = cy - ry * 0.12;
  const spacing = rx * (0.36 + 0.06 * spec.eyeSpacing);
  const ew = rx * (0.15 + 0.03 * spec.eyeSize);
  const eh = ew * 0.62;
  const iris = EYE[spec.eyeColor];
  const browColor = spec.hairStyle ? hair : [50, 40, 35];
  for (const sx of [-1, 1]) {
    const ex = cx + sx * spacing;
    add(`<ellipse cx="${f1(ex)}" cy="${f1(eyeY)}" rx="${f1(ew)}" ry="${f1(eh)}" fill="rgb(248,246,242)" stroke="rgb(60,45,35)" stroke-width="${f1(S / 300)}"/>`);
    add(`<circle cx="${f1(ex)}" cy="${f1(eyeY)}" r="${f1(eh * 0.82)}" fill="${rgb(iris)}"/>`);
    add(`<circle cx="${f1(ex)}" cy="${f1(eyeY)}" r="${f1(eh * 0.82 * 0.48)}" fill="rgb(15,12,10)"/>`);
    add(`<circle cx="${f1(ex - eh * 0.82 * 0.45)}" cy="${f1(eyeY - eh * 0.82 * 0.45)}" r="${f1(eh * 0.82 * 0.48 * 0.45)}" fill="#fff"/>`);
    const bt = Math.max(1, S * (0.006 + 0.004 * spec.browThick));
    const by = eyeY - eh * 2.1;
    const tilt = spec.browAngle * eh * 0.45 * sx;
    add(`<line x1="${f1(ex - ew * 1.15)}" y1="${f1(by + tilt)}" x2="${f1(ex + ew * 1.15)}" y2="${f1(by - tilt)}" stroke="${rgb(browColor)}" stroke-width="${f1(bt)}" stroke-linecap="round"/>`);
  }
  const nw = rx * (0.10 + 0.04 * spec.noseWidth);
  const nl = ry * (0.20 + 0.05 * spec.noseLen);
  const ny = cy + ry * 0.05;
  const sw = Math.max(1, S / 220);
  add(`<line x1="${f1(cx - nw * 0.15)}" y1="${f1(eyeY + eh)}" x2="${f1(cx - nw * 0.2)}" y2="${f1(ny + nl * 0.6)}" stroke="${rgb(shade)}" stroke-width="${f1(sw)}"/>`);
  add(`<path d="M ${f1(cx - nw)} ${f1(ny + nl * 0.6)} A ${f1(nw)} ${f1(nl * 0.4)} 0 0 0 ${f1(cx + nw)} ${f1(ny + nl * 0.6)}" fill="none" stroke="${rgb(shade)}" stroke-width="${f1(sw)}"/>`);
  const mw = rx * (0.28 + 0.06 * spec.mouthWidth);
  const my = cy + ry * 0.48;
  const lip = [Math.max(0, skin[0] - 60), Math.max(0, skin[1] - 80), Math.max(0, skin[2] - 70)];
  const lt = Math.max(1, S * (0.005 + 0.004 * spec.lipThick));
  const fh = FACIAL_HAIR[spec.facialHair];
  if (fh === 'moustache') add(`<path d="M ${f1(cx - mw * 1.1)} ${f1(my - mw * 0.05)} A ${f1(mw * 1.1)} ${f1(mw * 0.375)} 0 0 1 ${f1(cx + mw * 1.1)} ${f1(my - mw * 0.05)} Z" fill="${rgb(hair)}"/>`);
  if (fh === 'goatee') add(`<ellipse cx="${f1(cx)}" cy="${f1((my + mw * 0.15 + cy + ry * 0.98) / 2)}" rx="${f1(mw * 0.55)}" ry="${f1((cy + ry * 0.98 - (my + mw * 0.15)) / 2)}" fill="${rgb(hair)}"/>`);
  if (fh === 'full-beard') {
    add(`<clipPath id="beard"><rect x="0" y="${f1(cy + ry * 0.18)}" width="${S}" height="${S}"/></clipPath>`);
    add(`<polygon points="${outline(cx, cy + ry * 0.02, rx * 0.99, ry * 0.99, jaw, 72)}" fill="${rgb(hair)}" clip-path="url(#beard)"/>`);
  }
  if (spec.smile) {
    add(`<path d="M ${f1(cx - mw)} ${f1(my - mw * 0.1)} Q ${f1(cx)} ${f1(my + mw * 0.45)} ${f1(cx + mw)} ${f1(my - mw * 0.1)}" fill="none" stroke="${rgb(lip)}" stroke-width="${f1(lt)}" stroke-linecap="round"/>`);
  } else {
    add(`<line x1="${f1(cx - mw)}" y1="${f1(my)}" x2="${f1(cx + mw)}" y2="${f1(my)}" stroke="${rgb(lip)}" stroke-width="${f1(lt)}" stroke-linecap="round"/>`);
  }
  const g = GLASSES[spec.glasses];
  if (g !== 'none') {
    const gw = Math.max(1, S / 200);
    const r = ew * 1.35;
    for (const sx of [-1, 1]) {
      const ex = cx + sx * spacing;
      if (g === 'round') add(`<ellipse cx="${f1(ex)}" cy="${f1(eyeY)}" rx="${f1(r)}" ry="${f1(r * 0.85)}" fill="none" stroke="rgb(40,40,45)" stroke-width="${f1(gw)}"/>`);
      else add(`<rect x="${f1(ex - r)}" y="${f1(eyeY - r * 0.85)}" width="${f1(r * 2)}" height="${f1(r * 1.7)}" rx="${f1(r * 0.25)}" fill="none" stroke="rgb(40,40,45)" stroke-width="${f1(gw)}"/>`);
    }
    add(`<line x1="${f1(cx - spacing + r)}" y1="${f1(eyeY)}" x2="${f1(cx + spacing - r)}" y2="${f1(eyeY)}" stroke="rgb(40,40,45)" stroke-width="${f1(gw)}"/>`);
  }
  const m = MARKS[spec.mark];
  if (m === 'mole-left') add(`<circle cx="${f1(cx - rx * 0.55)}" cy="${f1(cy + ry * 0.3)}" r="${f1(S * 0.008)}" fill="rgb(60,40,30)"/>`);
  if (m === 'mole-right') add(`<circle cx="${f1(cx + rx * 0.5)}" cy="${f1(cy + ry * 0.22)}" r="${f1(S * 0.008)}" fill="rgb(60,40,30)"/>`);
  if (m === 'scar') add(`<line x1="${f1(cx + rx * 0.45)}" y1="${f1(cy - ry * 0.05)}" x2="${f1(cx + rx * 0.7)}" y2="${f1(cy + ry * 0.22)}" stroke="rgb(150,90,80)" stroke-width="${f1(Math.max(1, S / 260))}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="synthetic face">${parts.join('')}</svg>`;
}

module.exports = {
  fnv1a32, mulberry32, pick, specFromSeed, descriptor, traits, renderSvg,
  SKIN, HAIR, EYE, BG, SHIRT, SHAPES, HAIR_STYLES, GLASSES, FACIAL_HAIR, MARKS
};
