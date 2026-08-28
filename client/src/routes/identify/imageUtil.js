// Still-image helpers for the face search. Everything runs in the browser on
// a canvas and calls nothing: an upload is downscaled and re-encoded as PNG
// (the server's local engine reads PNG pixels; a 512 px PNG of a face is
// ~100 KB against the 4 MB limit), and a "sample capture" is a gallery
// stand-in re-rendered with a small rotation, scale and brightness change —
// the same kind of second capture the calibration probes use.

export const MAX_SIDE = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to decode'));
    img.src = src;
  });
}

function canvasFor(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** File → { dataUrl (image/png), width, height, bytes, name }. */
export async function fileToProbe(file, maxSide = MAX_SIDE) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('not-an-image');
  if (/^video\//.test(file.type || '')) throw new Error('still-images-only');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = canvasFor((img.naturalWidth || 1) * scale, (img.naturalHeight || 1) * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/png');
    return { dataUrl, width: c.width, height: c.height, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75), name: file.name || 'upload' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Gallery stand-in SVG → a "second capture" PNG: rotated ±7°, scaled 0.9–1.06,
 * shifted a little, brightness 0.88–1.12 (deterministic from `seedNum` so a
 * judge sees the same sample twice).
 */
export async function svgToProbe(svgText, size = 256, seedNum = 1) {
  const r = (n) => { const x = Math.sin(seedNum * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const c = canvasFor(size, size);
    const ctx = c.getContext('2d');
    const bg = /<rect[^>]*fill="(rgb\([^)]*\))"/.exec(svgText);
    ctx.fillStyle = bg ? bg[1] : '#e2e8f0';
    ctx.fillRect(0, 0, size, size);
    const angle = ((r(1) - 0.5) * 14 * Math.PI) / 180;
    const scale = 0.9 + r(2) * 0.16;
    const dx = (r(3) - 0.5) * size * 0.08;
    const dy = (r(4) - 0.5) * size * 0.06;
    ctx.save();
    ctx.translate(size / 2 + dx, size / 2 + dy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
    const bright = 0.88 + r(5) * 0.24;
    if (Math.abs(bright - 1) > 0.01) {
      const px = ctx.getImageData(0, 0, size, size);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * bright);
        d[i + 1] = Math.min(255, d[i + 1] * bright);
        d[i + 2] = Math.min(255, d[i + 2] * bright);
      }
      ctx.putImageData(px, 0, 0);
    }
    const dataUrl = c.toDataURL('image/png');
    return { dataUrl, width: size, height: size, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75), name: 'sample-capture.png' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
