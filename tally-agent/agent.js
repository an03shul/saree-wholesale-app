// Gopiram Tally Sync Agent
// Runs on the shop's Tally PC. Every few minutes it reads stock balances from
// the local Tally (http://localhost:9000) and pushes them to the cloud backend.
// The cloud caches them so the app shows live-ish stock from anywhere.

require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');

const CLOUD_URL = (process.env.CLOUD_URL || '').replace(/\/$/, '');
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const INTERVAL_MS = (parseInt(process.env.INTERVAL_MINUTES, 10) || 5) * 60 * 1000;

if (!CLOUD_URL || !SYNC_TOKEN) {
  console.error('ERROR: Please set CLOUD_URL and SYNC_TOKEN in the .env file.');
  process.exit(1);
}

// TDL collection request: all stock items with their closing balance.
const STOCK_QUERY = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllStockItems</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllStockItems" ISMODIFY="No">
            <TYPE>StockItem</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

function parseQty(closingBalance) {
  // e.g. "5 Nos", "12.00 Pcs", "-3 Nos", "1,200 Mtr"
  const n = parseFloat(String(closingBalance || '').replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function readTallyStock() {
  const res = await axios.post(TALLY_URL, STOCK_QUERY, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 20000,
  });
  const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false, mergeAttrs: true });
  let items = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];
  return items
    .map(it => ({ name: String(it.NAME || '').trim(), qty: parseQty(it.CLOSINGBALANCE) }))
    .filter(x => x.name);
}

async function syncOnce() {
  const ts = new Date().toLocaleTimeString();
  try {
    const items = await readTallyStock();
    if (!items.length) {
      console.log(`[${ts}] No stock items read from Tally — is a company loaded?`);
      return;
    }
    const res = await axios.post(`${CLOUD_URL}/api/tally-sync`, { items }, {
      headers: { 'X-Sync-Token': SYNC_TOKEN, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    console.log(`[${ts}] Synced ${res.data.received} stock items to the cloud.`);
  } catch (e) {
    let msg;
    if (e.code === 'ECONNREFUSED' && e.address) {
      msg = `Cannot reach Tally at ${TALLY_URL}. Open Tally, load the company, and enable the XML port (see README).`;
    } else if (e.response) {
      msg = `Cloud rejected the sync (${e.response.status}): ${e.response.data?.error || ''} — check SYNC_TOKEN matches the server.`;
    } else {
      msg = e.message;
    }
    console.error(`[${ts}] Sync failed: ${msg}`);
  }
}

console.log('──────────────────────────────────────────────');
console.log(' Gopiram Tally Sync Agent');
console.log(' Cloud:   ' + CLOUD_URL);
console.log(' Tally:   ' + TALLY_URL);
console.log(' Every:   ' + (INTERVAL_MS / 60000) + ' minute(s)');
console.log(' Keep this window open. Press Ctrl+C to stop.');
console.log('──────────────────────────────────────────────');

syncOnce();
setInterval(syncOnce, INTERVAL_MS);
