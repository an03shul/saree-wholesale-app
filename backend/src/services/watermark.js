const path = require('path');
const { Jimp, loadFont, measureText } = require('jimp');
const fonts = require('jimp/fonts');
const storage = require('./storage');

// Bakes the Gopiram Saree logo into the top-left corner of a web-sized copy of
// a photo, plus a "Powered by Nayvert AI" credit in the bottom-right, for
// customer-facing sharing (catalog, PDF, WhatsApp). Cached in storage.
const WM_TEXT = 'Powered by Nayvert AI';
const MAX_WIDTH = 1080;
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');

let fontWhite = null;
let fontBlack = null;
async function getFonts() {
  if (!fontWhite) fontWhite = await loadFont(fonts.SANS_32_WHITE);
  if (!fontBlack) fontBlack = await loadFont(fonts.SANS_32_BLACK);
  return { fontWhite, fontBlack };
}

// The brand logo is loaded once and reused (cloned per-render) to avoid disk IO.
let logo = null;
async function getLogo() {
  if (!logo) {
    try { logo = await Jimp.read(LOGO_PATH); }
    catch { logo = false; } // missing/unreadable → skip header, don't crash
  }
  return logo || null;
}

let queue = Promise.resolve();
const inFlight = new Map();

async function generate(filename) {
  const orig = await storage.getFile(filename);
  if (!orig) throw new Error('source missing');
  const { fontWhite: white, fontBlack: black } = await getFonts();
  const img = await Jimp.read(orig);
  if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });

  // Overlay the brand logo in the top-left corner (keeps the photo's original
  // shape/size). A soft translucent chip sits behind it so the logo stays
  // legible on dark sarees.
  const brand = await getLogo();
  if (brand) {
    const margin = Math.round(img.width * 0.025);
    const targetW = Math.round(img.width * 0.26);
    const targetH = Math.round(brand.height * (targetW / brand.width));
    const mark = brand.clone().resize({ w: targetW, h: targetH });

    const chipPad = Math.round(targetW * 0.08);
    const chip = new Jimp({ width: targetW + chipPad * 2, height: targetH + chipPad * 2, color: 0xffffffff });
    chip.opacity(0.72);
    img.composite(chip, margin, margin);
    img.composite(mark, margin + chipPad, margin + chipPad);
  }

  const tw = measureText(white, WM_TEXT);
  const pad = 14, lineH = 34;
  const x = Math.max(0, img.width - tw - pad);
  const y = Math.max(0, img.height - lineH - pad);
  img.print({ font: black, x: x + 2, y: y + 2, text: WM_TEXT }); // shadow
  img.print({ font: white, x, y, text: WM_TEXT });

  const ext = path.extname(filename).toLowerCase();
  const buf = ext === '.png'
    ? await img.getBuffer('image/png')
    : await img.getBuffer('image/jpeg', { quality: 72 });
  await storage.putFile(`wm/${filename}`, buf);
  return buf;
}

// Ensures a watermarked copy exists in storage and returns its relative key
// (e.g. "wm/x.jpg") for building a URL. Falls back to the original on error.
function getWatermarkedPath(photoPath) {
  if (!photoPath) return Promise.resolve(photoPath);
  const filename = path.basename(photoPath);
  const wmKey = `wm/${filename}`;

  const run = async () => {
    if (await storage.exists(wmKey)) return wmKey;
    try { await generate(filename); return wmKey; }
    catch { return filename; } // fall back to original
  };

  if (inFlight.has(wmKey)) return inFlight.get(wmKey);
  const p = queue.then(run).finally(() => inFlight.delete(wmKey));
  queue = p.catch(() => {});
  inFlight.set(wmKey, p);
  return p;
}

// Returns the watermarked image bytes (for embedding in the PDF).
async function getWatermarkedBuffer(photoPath) {
  if (!photoPath) return null;
  const filename = path.basename(photoPath);
  const cached = await storage.getFile(`wm/${filename}`);
  if (cached) return cached;
  try { return await generate(filename); }
  catch { return await storage.getFile(filename); }
}

module.exports = { getWatermarkedPath, getWatermarkedBuffer };
