const axios = require('axios');
const xml2js = require('xml2js');

// Tally XML (built-in HTTP server, port 9000)
const TALLY_XML_URL = process.env.TALLY_XML_URL || 'http://localhost:9000';
// Tally Connect REST (third-party bridge, port 9090)
const TALLY_CONNECT_URL = process.env.TALLY_CONNECT_URL || 'http://localhost:9090';

// Which mode is active: 'xml' | 'connect' | null (not yet detected)
let _detectedMode = null;
let _lastDetect = 0;
const DETECT_TTL = 30000; // re-probe every 30s

async function detectMode() {
  if (_detectedMode && Date.now() - _lastDetect < DETECT_TTL) return _detectedMode;
  // Try Tally Connect REST first (more modern)
  try {
    await axios.get(`${TALLY_CONNECT_URL}/api/master/stockitem`, { timeout: 2000 });
    _detectedMode = 'connect';
    _lastDetect = Date.now();
    return 'connect';
  } catch {}
  // Try Tally XML
  try {
    await axios.post(TALLY_XML_URL, '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER></ENVELOPE>', {
      headers: { 'Content-Type': 'text/xml' }, timeout: 2000,
    });
    _detectedMode = 'xml';
    _lastDetect = Date.now();
    return 'xml';
  } catch {}
  _detectedMode = null;
  _lastDetect = Date.now();
  return null;
}

// ─── XML path ────────────────────────────────────────────────────────────────

async function tallyPost(xml) {
  const response = await axios.post(TALLY_XML_URL, xml, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 8000,
  });
  return xml2js.parseStringPromise(response.data, { explicitArray: false });
}

async function getStockBalanceXml(tallyItemName) {
  const xml = `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>Stock Summary</REPORTNAME>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
              <SVSTOCK>${tallyItemName}</SVSTOCK>
            </STATICVARIABLES>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>`;
  try {
    const parsed = await tallyPost(xml);
    const items = parsed?.ENVELOPE?.STOCKSUMMARY?.STOCKITEM;
    if (!items) return 0;
    const arr = Array.isArray(items) ? items : [items];
    const match = arr.find(i => i.NAME?.toLowerCase() === tallyItemName.toLowerCase());
    if (!match) return 0;
    const closing = match.CLOSINGBALANCE || '0';
    return parseFloat(closing.replace(/[^0-9.-]/g, '')) || 0;
  } catch {
    return null;
  }
}

// ─── Tally Connect REST path ─────────────────────────────────────────────────

async function getStockBalanceConnect(tallyItemName) {
  try {
    const res = await axios.get(`${TALLY_CONNECT_URL}/api/master/stockitem`, {
      params: { name: tallyItemName },
      timeout: 8000,
    });
    // Tally Connect returns array of matching items
    const items = Array.isArray(res.data) ? res.data : [res.data];
    const match = items.find(i =>
      (i.name || i.NAME || '').toLowerCase() === tallyItemName.toLowerCase()
    );
    if (!match) return 0;
    const qty = match.closingBalance ?? match.CLOSINGBALANCE ?? match.quantity ?? match.QUANTITY ?? 0;
    return parseFloat(String(qty).replace(/[^0-9.-]/g, '')) || 0;
  } catch {
    return null;
  }
}

// ─── Unified API ─────────────────────────────────────────────────────────────

async function getStockBalance(tallyItemName) {
  const mode = await detectMode();
  if (mode === 'connect') return getStockBalanceConnect(tallyItemName);
  if (mode === 'xml') return getStockBalanceXml(tallyItemName);
  return null; // Tally unreachable
}

async function getStockForDesigns(designs) {
  return Promise.all(
    designs.map(async (d) => {
      const stock = d.tally_item_name ? await getStockBalance(d.tally_item_name) : null;
      return { ...d, stock };
    })
  );
}

// ─── Customers ───────────────────────────────────────────────────────────────

async function getCustomers() {
  const xml = `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <REPORTNAME>List of Accounts</REPORTNAME>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>`;

  try {
    const parsed = await tallyPost(xml);
    const accounts = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (!accounts) return { customers: [], error: null };

    const arr = Array.isArray(accounts) ? accounts : [accounts];
    const customers = arr
      .filter(l => {
        const parent = (l.PARENT || '').toLowerCase();
        return parent.includes('sundry debtor') || parent.includes('debtor');
      })
      .map(l => {
        const phone =
          l.LEDMOBILE || l.MOBILENO ||
          l.CONTACTDETAILS?.CONTACTDETAILSLIST?.CMPCONTACTNUMBER ||
          l.FIELDCONTACT || '';
        const rawPhone = Array.isArray(phone) ? phone[0] : phone;
        return { name: l.NAME || l.$ || '', phone: normalizePhone(rawPhone), raw_phone: rawPhone };
      })
      .filter(c => c.name);

    return { customers, error: null };
  } catch {
    return { customers: [], error: 'Tally unreachable or not running' };
  }
}

function normalizePhone(raw) {
  if (!raw) return '';
  let phone = String(raw).replace(/[\s\-().+]/g, '');
  if (phone.startsWith('0')) phone = '91' + phone.slice(1);
  else if (phone.length === 10) phone = '91' + phone;
  return phone;
}

module.exports = { getStockBalance, getStockForDesigns, getCustomers, detectMode };
