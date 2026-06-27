const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');
const { UPLOADS_DIR } = require('../config/paths');

// Small, plain (no watermark) resized copies for fast in-app display. Generated
// once and cached. Originals are kept for detail views; watermarked copies are
// used for customer sharing.
const THUMB_DIR = path.join(UPLOADS_DIR, 'thumb');
const MAX_WIDTH = 560;

let queue = Promise.resolve();
const inFlight = new Map();

async function generate(photoPath, outPath) {
  const src = path.join(UPLOADS_DIR, photoPath);
  if (!fs.existsSync(src)) throw new Error('source missing');
  if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
  const img = await Jimp.read(src);
  if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });
  const ext = path.extname(outPath).toLowerCase();
  if (ext === '.png') {
    await img.write(outPath);
  } else {
    // JPEG at moderate quality — small files for fast grid loading
    const buf = await img.getBuffer('image/jpeg', { quality: 68 });
    fs.writeFileSync(outPath, buf);
  }
}

// Returns the relative path (under UPLOADS_DIR) of a thumbnail for the photo,
// generating it on first request. Falls back to the original on any error.
function getThumbPath(photoPath) {
  if (!photoPath) return Promise.resolve(null);
  const safe = path.basename(photoPath); // guard against path traversal
  const rel = path.join('thumb', safe);
  const out = path.join(UPLOADS_DIR, rel);
  if (fs.existsSync(out)) return Promise.resolve(rel);
  if (inFlight.has(rel)) return inFlight.get(rel);

  const p = queue
    .then(() => generate(safe, out))
    .then(() => rel)
    .catch(() => safe) // fall back to original filename
    .finally(() => inFlight.delete(rel));
  queue = p.catch(() => {});
  inFlight.set(rel, p);
  return p;
}

module.exports = { getThumbPath };
