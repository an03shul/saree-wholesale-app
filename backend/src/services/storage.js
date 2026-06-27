const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../config/paths');

// Image storage abstraction.
//   • Production: Cloudflare R2 (reuses the same R2 creds as the DB backup),
//     so photos don't consume the small Railway disk. Keys live under images/.
//   • Dev / no R2 configured: local disk under UPLOADS_DIR (unchanged behavior).
const R2_ENDPOINT = process.env.LITESTREAM_ENDPOINT;
const R2_KEY = process.env.LITESTREAM_ACCESS_KEY_ID;
const R2_SECRET = process.env.LITESTREAM_SECRET_ACCESS_KEY;
const R2_BUCKET = (process.env.LITESTREAM_REPLICA_URL || '').replace('s3://', '').split('/')[0]
  || process.env.R2_BUCKET || '';
const PREFIX = 'images/';

const useR2 = !!(R2_ENDPOINT && R2_KEY && R2_SECRET && R2_BUCKET);

let s3 = null;
let S3;
if (useR2) {
  S3 = require('@aws-sdk/client-s3');
  s3 = new S3.S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
    forcePathStyle: true,
  });
  console.log('Image storage: Cloudflare R2 (bucket:', R2_BUCKET + ')');
} else {
  console.log('Image storage: local disk', UPLOADS_DIR);
}

function contentTypeFor(key) {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function putFile(key, buffer) {
  if (useR2) {
    await s3.send(new S3.PutObjectCommand({
      Bucket: R2_BUCKET, Key: PREFIX + key, Body: buffer, ContentType: contentTypeFor(key),
    }));
  } else {
    const full = path.join(UPLOADS_DIR, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
  }
}

// Returns a Buffer, or null if the object doesn't exist.
async function getFile(key) {
  if (useR2) {
    try {
      const r = await s3.send(new S3.GetObjectCommand({ Bucket: R2_BUCKET, Key: PREFIX + key }));
      return await streamToBuffer(r.Body);
    } catch (e) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  } else {
    const full = path.join(UPLOADS_DIR, key);
    return fs.existsSync(full) ? fs.readFileSync(full) : null;
  }
}

async function exists(key) {
  if (useR2) {
    try {
      await s3.send(new S3.HeadObjectCommand({ Bucket: R2_BUCKET, Key: PREFIX + key }));
      return true;
    } catch { return false; }
  }
  return fs.existsSync(path.join(UPLOADS_DIR, key));
}

async function deleteFile(key) {
  if (useR2) {
    try { await s3.send(new S3.DeleteObjectCommand({ Bucket: R2_BUCKET, Key: PREFIX + key })); } catch {}
  } else {
    const full = path.join(UPLOADS_DIR, key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
}

function generateKey(originalname) {
  const ext = (path.extname(originalname || '') || '.jpg').toLowerCase();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
}

module.exports = { putFile, getFile, exists, deleteFile, contentTypeFor, generateKey, useR2 };
