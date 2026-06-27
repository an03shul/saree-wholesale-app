const fs = require('fs');
const path = require('path');
const { Jimp, loadFont, measureText } = require('jimp');
const fonts = require('jimp/fonts');
const { UPLOADS_DIR } = require('../config/paths');

const WM_TEXT = 'Powered by Nayvert AI';
const WM_DIR = path.join(UPLOADS_DIR, 'wm');
const MAX_WIDTH = 1080;

let fontWhite = null;
let fontBlack = null;
async function getFonts() {
  if (!fontWhite) fontWhite = await loadFont(fonts.SANS_32_WHITE);
  if (!fontBlack) fontBlack = await loadFont(fonts.SANS_32_BLACK);
  return { fontWhite, fontBlack };
}

// Serialize generation so we never hold many large images in memory at once.
let queue = Promise.resolve();
const inFlight = new Map();

async function generate(photoPath, outPath) {
  const src = path.join(UPLOADS_DIR, photoPath);
  if (!fs.existsSync(src)) throw new Error('source missing');
  if (!fs.existsSync(WM_DIR)) fs.mkdirSync(WM_DIR, { recursive: true });

  const { fontWhite: white, fontBlack: black } = await getFonts();
  const img = await Jimp.read(src);
  if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });

  const tw = measureText(white, WM_TEXT);
  const pad = 14, lineH = 34;
  const x = Math.max(0, img.width - tw - pad);
  const y = Math.max(0, img.height - lineH - pad);
  img.print({ font: black, x: x + 2, y: y + 2, text: WM_TEXT }); // shadow
  img.print({ font: white, x, y, text: WM_TEXT });
  await img.write(outPath);
}

// Returns the relative path (under UPLOADS_DIR) of a watermarked, web-sized copy
// of the given photo. Generated once and cached. On any failure, falls back to
// the original photo path so sharing never breaks.
function getWatermarkedPath(photoPath) {
  if (!photoPath) return Promise.resolve(photoPath);
  const rel = path.join('wm', photoPath);
  const out = path.join(UPLOADS_DIR, rel);
  if (fs.existsSync(out)) return Promise.resolve(rel);
  if (inFlight.has(rel)) return inFlight.get(rel);

  const p = queue
    .then(() => generate(photoPath, out))
    .then(() => rel)
    .catch(() => photoPath)
    .finally(() => inFlight.delete(rel));
  // keep the chain going regardless of this item's outcome
  queue = p.catch(() => {});
  inFlight.set(rel, p);
  return p;
}

module.exports = { getWatermarkedPath };
