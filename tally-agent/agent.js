// Gopiram Tally Sync Agent  (v2 — incremental)
// Runs on the shop's Tally PC. Reads stock (and customers) from the local Tally
// XML server (http://localhost:9000) and pushes them to the cloud backend, which
// caches them so the app shows live-ish data from anywhere.
//
// v2 adds Biz-Analyst-style INCREMENTAL sync:
//   • Each cycle it cheaply probes the company's Tally AlterID watermarks
//     (LastAlterIdMaster / LastAlterIdVoucher). Stock balances change via
//     VOUCHERS, so the stock export only runs when the voucher watermark moves;
//     ledgers/customers only re-export when the master watermark moves. When
//     nothing changed it just sends a lightweight heartbeat — fast and quiet.
//   • A periodic FULL resync (default hourly) self-heals and propagates deletions.
//   • Exports are enriched (stock value + units + AlterID; customer outstanding).
//   • Cloud POST + Tally reads retry with backoff.
//
// SAFETY: if the AlterID probe can't be read (older Tally / different field
// names), the agent falls back to a FULL sync every cycle — i.e. never worse than
// the old always-full behaviour. Correctness never depends on the optimisation.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const xml2js = require('xml2js');

const AGENT_VERSION = '2.0';
const CLOUD_URL = (process.env.CLOUD_URL || '').replace(/\/$/, '');
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const INTERVAL_MS = (parseInt(process.env.INTERVAL_MINUTES, 10) || 5) * 60 * 1000;
// Force a full resync at least this often (catches deletions + self-heals).
const FULL_EVERY_MS = (parseInt(process.env.FULL_RESYNC_MINUTES, 10) || 60) * 60 * 1000;
const STATE_FILE = path.join(__dirname, '.tally-sync-state.json');

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ── local watermark state (survives restarts) ────────────────────────────────
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e) { console.warn('   (could not persist sync state:', e.message, ')'); }
}

// ── Tally XML requests ────────────────────────────────────────────────────────
// Company AlterID probe. Field names for the alter ids vary across Tally builds,
// so we fetch several candidates and pick whichever the response carries. If none
// are present the agent falls back to a full sync (see decideSync).
const COMPANY_QUERY = `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>GopiramCompanyInfo</ID></HEADER>
  <BODY><DESC>
    <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="GopiramCompanyInfo" ISMODIFY="No">
        <TYPE>Company</TYPE>
        <NATIVEMETHOD>Name</NATIVEMETHOD>
        <NATIVEMETHOD>AltMasterId</NATIVEMETHOD>
        <NATIVEMETHOD>AltVoucherId</NATIVEMETHOD>
        <NATIVEMETHOD>LastAlterIdMaster</NATIVEMETHOD>
        <NATIVEMETHOD>LastAlterIdVoucher</NATIVEMETHOD>
      </COLLECTION>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;

const STOCK_QUERY = () => `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>AllStockItems</ID></HEADER>
  <BODY><DESC>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <SVFROMDATE TYPE="Date">20000401</SVFROMDATE>
      <SVTODATE TYPE="Date">${todayYmd()}</SVTODATE>
    </STATICVARIABLES>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="AllStockItems" ISMODIFY="No">
        <TYPE>StockItem</TYPE>
        <NATIVEMETHOD>Name</NATIVEMETHOD>
        <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
        <NATIVEMETHOD>ClosingValue</NATIVEMETHOD>
        <NATIVEMETHOD>BaseUnits</NATIVEMETHOD>
        <NATIVEMETHOD>AlterID</NATIVEMETHOD>
      </COLLECTION>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;

const LEDGER_QUERY = `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>AllLedgers</ID></HEADER>
  <BODY><DESC>
    <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
    <TDL><TDLMESSAGE>
      <COLLECTION NAME="AllLedgers" ISMODIFY="No">
        <TYPE>Ledger</TYPE>
        <NATIVEMETHOD>Name</NATIVEMETHOD>
        <NATIVEMETHOD>Parent</NATIVEMETHOD>
        <NATIVEMETHOD>LedgerMobile</NATIVEMETHOD>
        <NATIVEMETHOD>LedgerPhone</NATIVEMETHOD>
        <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
      </COLLECTION>
    </TDLMESSAGE></TDL>
  </DESC></BODY>
</ENVELOPE>`;

// ── parsing helpers ───────────────────────────────────────────────────────────
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
function parseAmount(raw) {
  // e.g. "15,400.00 Dr", "-3200 Cr", "21000.00"
  const s = String(raw || '');
  const n = parseFloat(s.replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return /cr/i.test(s) ? -Math.abs(n) : n;
}
function parseUnits(closingBalance) {
  const m = String(closingBalance || '').match(/[a-zA-Z]+/);
  return m ? m[0] : null;
}
function toInt(v) { const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? n : null; }

async function tallyPost(xml, timeout = 20000) {
  const res = await axios.post(TALLY_URL, xml, { headers: { 'Content-Type': 'text/xml' }, timeout });
  return xml2js.parseStringPromise(res.data, { explicitArray: false, mergeAttrs: true });
}

async function probeCompany() {
  try {
    const parsed = await tallyPost(COMPANY_QUERY, 8000);
    let c = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
    if (Array.isArray(c)) c = c[0];
    if (!c) return { company: null, alterMaster: null, alterVoucher: null };
    const alterMaster = toInt(c.ALTMASTERID ?? c.LASTALTERIDMASTER ?? c.LASTMASTERID);
    const alterVoucher = toInt(c.ALTVOUCHERID ?? c.LASTALTERIDVOUCHER ?? c.LASTVOUCHERID);
    return { company: c.NAME ? String(c.NAME).trim() : null, alterMaster, alterVoucher };
  } catch {
    return { company: null, alterMaster: null, alterVoucher: null };
  }
}

async function readTallyStock() {
  const parsed = await tallyPost(STOCK_QUERY());
  let items = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];
  return items
    .map(it => ({
      name: String(it.NAME || '').trim(),
      qty: parseQty(it.CLOSINGBALANCE),
      value: parseAmount(it.CLOSINGVALUE),
      units: it.BASEUNITS ? String(it.BASEUNITS).trim() : parseUnits(it.CLOSINGBALANCE),
      alter_id: toInt(it.ALTERID),
    }))
    .filter(x => x.name);
}

async function readTallyCustomers() {
  try {
    const parsed = await tallyPost(LEDGER_QUERY);
    let ledgers = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (!ledgers) return [];
    if (!Array.isArray(ledgers)) ledgers = [ledgers];
    const debtors = ledgers.filter(l => /debtor/i.test(String(l.PARENT || '')));
    return debtors
      .map(l => ({
        name: String(l.NAME || '').trim(),
        phone: normalizePhone(l.LEDGERMOBILE || l.LEDGERPHONE || ''),
        balance: parseAmount(l.CLOSINGBALANCE),
      }))
      .filter(c => c.name);
  } catch (e) {
    console.log('   Customer read error:', e.message);
    return []; // best-effort; never block the stock sync
  }
}

// Decide what this cycle must do, given the probe and persisted watermarks.
function decideSync(probe, state, now) {
  const noWatermarks = probe.alterVoucher == null && probe.alterMaster == null;
  const dueFull = !state.lastFullSyncAt || (now - state.lastFullSyncAt >= FULL_EVERY_MS);
  // Fall back to full whenever we can't trust the probe, or it's time to self-heal.
  const full = noWatermarks || dueFull || state.lastAlterVoucher == null;
  const stock = full || probe.alterVoucher == null || probe.alterVoucher !== state.lastAlterVoucher;
  const masters = full || probe.alterMaster == null || probe.alterMaster !== state.lastAlterMaster;
  return { full, stock, masters };
}

async function withRetry(fn, label, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; if (i < tries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
  throw lastErr;
}

async function syncOnce() {
  const ts = new Date().toLocaleTimeString();
  const now = Date.now();
  const state = loadState();
  try {
    const probe = await probeCompany();
    const plan = decideSync(probe, state, now);

    let items, customers;
    if (plan.stock) {
      items = await withRetry(readTallyStock, 'stock');
      if (!items.length && plan.full) {
        console.log(`[${ts}] No stock items read from Tally — is a company loaded? (skipping push)`);
        return;
      }
    }
    if (plan.masters) customers = await withRetry(readTallyCustomers, 'customers');

    const payload = {
      meta: {
        mode: plan.full ? 'full' : 'incremental',
        company: probe.company,
        lastAlterIdMaster: probe.alterMaster,
        lastAlterIdVoucher: probe.alterVoucher,
        agentVersion: AGENT_VERSION,
      },
    };
    if (items) payload.items = items;
    if (customers) payload.customers = customers;

    const res = await withRetry(() => axios.post(`${CLOUD_URL}/api/tally-sync`, payload, {
      headers: { 'X-Sync-Token': SYNC_TOKEN, 'Content-Type': 'application/json' },
      timeout: 60000,
    }), 'cloud');

    // Persist watermarks only after a successful push.
    saveState({
      lastAlterMaster: probe.alterMaster,
      lastAlterVoucher: probe.alterVoucher,
      lastFullSyncAt: plan.full ? now : (state.lastFullSyncAt || now),
    });

    const d = res.data || {};
    if (!items && !customers) console.log(`[${ts}] No changes (heartbeat). Company: ${probe.company || '—'}.`);
    else console.log(`[${ts}] ${payload.meta.mode} sync → ${d.received || 0} stock (${d.deleted || 0} removed), ${d.customers || 0} customers.`);
    return d;
  } catch (e) {
    let msg;
    if (e.code === 'ECONNREFUSED') msg = `Cannot reach Tally at ${TALLY_URL}. Open Tally, load the company, enable the XML port (README).`;
    else if (e.response) msg = `Cloud rejected the sync (${e.response.status}): ${e.response.data?.error || ''} — check SYNC_TOKEN.`;
    else msg = e.message;
    console.error(`[${ts}] Sync failed: ${msg}`);
    throw e;
  }
}

// Auto-run only when launched directly (so tests can require this module).
if (require.main === module) {
  if (!CLOUD_URL || !SYNC_TOKEN) {
    console.error('ERROR: Please set CLOUD_URL and SYNC_TOKEN in the .env file.');
    process.exit(1);
  }
  console.log('──────────────────────────────────────────────');
  console.log(` Gopiram Tally Sync Agent v${AGENT_VERSION} (incremental)`);
  console.log(' Cloud:   ' + CLOUD_URL);
  console.log(' Tally:   ' + TALLY_URL);
  console.log(' Every:   ' + (INTERVAL_MS / 60000) + ' min · full resync every ' + (FULL_EVERY_MS / 60000) + ' min');
  console.log(' Keep this window open. Press Ctrl+C to stop.');
  console.log('──────────────────────────────────────────────');
  syncOnce().catch(() => {});
  setInterval(() => syncOnce().catch(() => {}), INTERVAL_MS);
}

module.exports = { syncOnce, decideSync, probeCompany, readTallyStock, readTallyCustomers, parseAmount, parseQty, parseUnits, toInt };
