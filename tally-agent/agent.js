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

// TDL collection request: all ledgers with their group + phone fields.
// We filter to Sundry Debtors (customers) in code.
const LEDGER_QUERY = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllLedgers" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerMobile</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerPhone</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

function normalizePhone(raw) {
  if (!raw) return '';
  let phone = String(raw).replace(/[\s\-().+]/g, '');
  if (phone.startsWith('0')) phone = '91' + phone.slice(1);
  else if (phone.length === 10) phone = '91' + phone;
  return phone;
}

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

async function readTallyCustomers() {
  try {
    const res = await axios.post(TALLY_URL, LEDGER_QUERY, {
      headers: { 'Content-Type': 'text/xml' },
      timeout: 20000,
    });
    const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false, mergeAttrs: true });
    let ledgers = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (!ledgers) {
      console.log('   (ledger query returned no ledgers — raw start:', String(res.data).slice(0, 200).replace(/\s+/g, ' '), ')');
      return [];
    }
    if (!Array.isArray(ledgers)) ledgers = [ledgers];

    const debtors = ledgers.filter(l => /debtor/i.test(String(l.PARENT || '')));
    console.log(`   Ledgers read: ${ledgers.length} total, ${debtors.length} under a "debtor" group.`);
    if (debtors.length === 0 && ledgers.length > 0) {
      const groups = [...new Set(ledgers.map(l => String(l.PARENT || '').trim()).filter(Boolean))].slice(0, 20);
      console.log('   Group names seen in Tally:', groups.join(' | '));
      console.log('   → Tell us which of these holds your customers; we will match it.');
    }
    return debtors
      .map(l => ({
        name: String(l.NAME || '').trim(),
        phone: normalizePhone(l.LEDGERMOBILE || l.LEDGERPHONE || ''),
      }))
      .filter(c => c.name);
  } catch (e) {
    console.log('   Customer read error:', e.message);
    return []; // customers are best-effort; never block the stock sync
  }
}

async function syncOnce() {
  const ts = new Date().toLocaleTimeString();
  try {
    const items = await readTallyStock();
    if (!items.length) {
      console.log(`[${ts}] No stock items read from Tally — is a company loaded?`);
      return;
    }
    const customers = await readTallyCustomers();
    const res = await axios.post(`${CLOUD_URL}/api/tally-sync`, { items, customers }, {
      headers: { 'X-Sync-Token': SYNC_TOKEN, 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    console.log(`[${ts}] Synced ${res.data.received} stock items and ${res.data.customers || 0} customers to the cloud.`);
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
