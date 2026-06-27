const path = require('path');
const { Jimp } = require('jimp');
const storage = require('./storage');

// Small, plain (no watermark) resized copies for fast in-app display. Generated
// once and cached in storage (R2 or disk). Originals stay for detail views.
const MAX_WIDTH = 560;

let queue = Promise.resolve();
const inFlight = new Map();

async function generate(filename) {
  const orig = await storage.getFile(filename);
  if (!orig) throw new Error('source missing');
  const img = await Jimp.read(orig);
  if (img.width > MAX_WIDTH) img.resize({ w: MAX_WIDTH });
  const ext = path.extname(filename).toLowerCase();
  const buf = ext === '.png'
    ? await img.getBuffer('image/png')
    : await img.getBuffer('image/jpeg', { quality: 68 });
  await storage.putFile(`thumb/${filename}`, buf);
  return buf;
}

// Returns a Buffer of the thumbnail, generating + caching it on first request.
// Falls back to the original image on any error so display never breaks.
function getThumbBuffer(photoPath) {
  if (!photoPath) return Promise.resolve(null);
  const filename = path.basename(photoPath); // guard against traversal
  const thumbKey = `thumb/${filename}`;

  const run = async () => {
    const cached = await storage.getFile(thumbKey);
    if (cached) return cached;
    try {
      return await generate(filename);
    } catch {
      return await storage.getFile(filename); // fall back to original bytes
    }
  };

  if (inFlight.has(thumbKey)) return inFlight.get(thumbKey);
  const p = queue.then(run).finally(() => inFlight.delete(thumbKey));
  queue = p.catch(() => {});
  inFlight.set(thumbKey, p);
  return p;
}

module.exports = { getThumbBuffer };
