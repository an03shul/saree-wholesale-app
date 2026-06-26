const path = require('path');

// Folder where uploaded design photos are stored. In production set UPLOADS_DIR
// to a path on the persistent disk (e.g. a Railway volume → UPLOADS_DIR=/data/uploads)
// so photos survive restarts and redeploys. Defaults to backend/uploads for dev.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Temp folder for the "identify piece" feature's transient uploads.
const TEMP_UPLOADS_DIR = path.join(UPLOADS_DIR, 'temp');

module.exports = { UPLOADS_DIR, TEMP_UPLOADS_DIR };
