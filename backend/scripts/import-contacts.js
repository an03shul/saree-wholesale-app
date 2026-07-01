#!/usr/bin/env node
/**
 * Bulk-import contacts from scripts/contacts-seed.json.
 *
 * Two modes:
 *   1. Direct DB (default): inserts straight into the SQLite DB this backend uses
 *      (respects DB_PATH). Run this on the machine/environment that owns the DB.
 *        node scripts/import-contacts.js
 *
 *   2. Over HTTP: POSTs to a running backend's /api/contacts/import endpoint.
 *      Use this to seed a remote (e.g. Railway) instance. Requires an admin token.
 *        API_URL=https://your-backend node scripts/import-contacts.js --http --token=<ADMIN_TOKEN>
 *
 * Idempotent: contacts whose phone already exists are skipped.
 */
const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, 'contacts-seed.json');
const contacts = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const useHttp = process.argv.includes('--http');
const tokenArg = process.argv.find(a => a.startsWith('--token='));
const token = tokenArg ? tokenArg.slice('--token='.length) : process.env.ADMIN_TOKEN;

async function viaHttp() {
  const apiUrl = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (!token) throw new Error('Admin token required: pass --token=<TOKEN> or set ADMIN_TOKEN');
  const res = await fetch(`${apiUrl}/api/contacts/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ contacts }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function viaDb() {
  const db = require('../src/db/database');
  const ins = db.prepare('INSERT OR IGNORE INTO contacts (name, phone, type) VALUES (?,?,?)');
  let imported = 0, skipped = 0;
  for (const c of contacts) {
    const name = (c?.name || '').trim();
    const phone = (c?.phone || '').trim();
    if (!name || !phone) { skipped++; continue; }
    const result = ins.run(name, phone, c.type || 'individual');
    if (result.changes > 0) imported++; else skipped++;
  }
  return { imported, skipped, total: contacts.length };
}

(async () => {
  console.log(`Importing ${contacts.length} contacts (${useHttp ? 'HTTP' : 'direct DB'})...`);
  const result = useHttp ? await viaHttp() : viaDb();
  console.log(`Done. Imported ${result.imported}, skipped ${result.skipped} (already existed), total ${result.total}.`);
})().catch(e => { console.error('Import failed:', e.message); process.exit(1); });
