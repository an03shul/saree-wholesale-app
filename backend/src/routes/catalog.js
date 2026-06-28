const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { getWatermarkedPath } = require('../services/watermark');
// Public catalog page for customers — uses app in_stock flag only, never Tally stock
router.get('/:brandId', async (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.brandId);
  if (!brand) return res.status(404).send('Brand not found');

  const { fabric, maxRate, minRate } = req.query;

  // Only show in-stock items
  let items = db.prepare('SELECT * FROM items WHERE brand_id = ? AND in_stock = 1 ORDER BY name').all(brand.id);

  const itemsWithDesigns = items.map((item) => {
    let designs = db.prepare('SELECT * FROM designs WHERE item_id = ? AND in_stock = 1 ORDER BY CAST(design_number AS INTEGER), design_number').all(item.id);

    if (fabric) designs = designs.filter(d => d.fabric_type === fabric);
    if (maxRate) designs = designs.filter(d => d.rate <= parseFloat(maxRate));
    if (minRate) designs = designs.filter(d => d.rate >= parseFloat(minRate));

    return { ...item, designs };
  }).filter(i => i.designs.length > 0);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const shopPhone = process.env.SHOP_WHATSAPP || '';
  const allFabrics = [...new Set(
    db.prepare('SELECT DISTINCT fabric_type FROM designs WHERE fabric_type IS NOT NULL').all().map(r => r.fabric_type)
  )];

  // Resolve watermarked, web-sized photo for each design (cached after first build)
  for (const item of itemsWithDesigns) {
    for (const d of item.designs) {
      d.wm_photo = d.photo_path ? await getWatermarkedPath(d.photo_path) : null;
    }
  }

  res.send(buildCatalogHtml({ brand, items: itemsWithDesigns, baseUrl, shopPhone, allFabrics, filters: { fabric, maxRate, minRate } }));
});

function buildCatalogHtml({ brand, items, baseUrl, shopPhone, allFabrics, filters }) {
  const designCards = items.flatMap(item =>
    item.designs.map(d => {
      const photoHtml = d.photo_path
        ? `<img src="${baseUrl}/uploads/${d.wm_photo || d.photo_path}" alt="Design ${d.design_number}" loading="lazy"/>`
        : `<div class="no-photo">No Photo</div>`;
      return `
        <div class="card">
          ${photoHtml}
          <div class="card-body">
            <div class="item-name">${item.name}</div>
            <div class="design-no">Design ${d.design_number}</div>
            <div class="rate">₹${d.rate}</div>
            <div class="meta">${d.pcs_per_set} pcs/set${d.fabric_type ? ` • ${d.fabric_type}` : ''}${d.colors ? `<br>${d.colors}` : ''}</div>
            <button class="order-btn" onclick="openOrder(${d.id},'${item.name.replace(/'/g,"\\'")}','${d.design_number}',${d.rate})">Order Now</button>
          </div>
        </div>`;
    })
  ).join('');

  const fabricOptions = allFabrics.map(f =>
    `<option value="${f}" ${filters.fabric === f ? 'selected' : ''}>${f}</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${brand.name} — Catalog</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:sans-serif;background:#f8f4f0;color:#2c1810}
  header{background:#c0392b;color:#fff;padding:16px 20px;text-align:center}
  header h1{font-size:22px}
  header p{font-size:13px;opacity:.85;margin-top:4px}
  .filters{padding:12px 16px;background:#fff;border-bottom:1px solid #eee;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .filters select,.filters input{padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff}
  .filters button{padding:8px 16px;background:#c0392b;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:16px}
  .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .card img,.no-photo{width:100%;height:180px;object-fit:cover}
  .no-photo{background:#eee;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:13px}
  .card-body{padding:10px}
  .item-name{font-size:13px;color:#888}
  .design-no{font-weight:700;font-size:15px;margin-top:2px}
  .rate{color:#c0392b;font-weight:700;font-size:17px;margin:4px 0}
  .meta{font-size:12px;color:#888;line-height:1.5}
  .order-btn{display:block;margin-top:10px;background:#25d366;color:#fff;text-align:center;padding:9px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer;width:100%}
  .order-btn:active{opacity:.85}
  .empty{text-align:center;padding:60px 20px;color:#aaa}
  .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;align-items:flex-end;justify-content:center}
  .modal-overlay.open{display:flex}
  .modal{background:#fff;border-radius:20px 20px 0 0;padding:28px 24px 40px;width:100%;max-width:500px}
  .modal h3{margin:0 0 4px;font-size:18px;color:#2c1810}
  .modal .sub{font-size:13px;color:#888;margin-bottom:20px}
  .modal input{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #ddd;border-radius:10px;font-size:15px;margin-bottom:12px}
  .modal input:focus{outline:none;border-color:#c0392b}
  .modal-btns{display:flex;gap:10px;margin-top:4px}
  .btn-cancel{flex:1;padding:13px;border:1.5px solid #ddd;border-radius:10px;background:#fff;font-size:14px;font-weight:600;color:#666;cursor:pointer}
  .btn-submit{flex:2;padding:13px;border:none;border-radius:10px;background:#25d366;color:#fff;font-size:14px;font-weight:700;cursor:pointer}
  .btn-submit:disabled{background:#aaa;cursor:default}
  .success{text-align:center;padding:24px 0 8px}
  .success .tick{font-size:48px}
  .success h3{color:#2c1810;margin:12px 0 6px}
  .success p{color:#888;font-size:14px;margin:0}
</style>
</head>
<body>
<header>
  <h1>${brand.name}</h1>
  ${brand.description ? `<p>${brand.description}</p>` : ''}
</header>
<form class="filters" method="GET">
  <select name="fabric"><option value="">All Fabrics</option>${fabricOptions}</select>
  <input type="number" name="minRate" placeholder="Min ₹" value="${filters.minRate || ''}" style="width:90px"/>
  <input type="number" name="maxRate" placeholder="Max ₹" value="${filters.maxRate || ''}" style="width:90px"/>
  <button type="submit">Filter</button>
</form>
<div class="grid">
  ${designCards || '<div class="empty">No in-stock designs found.</div>'}
</div>
<!-- Order modal -->
<div class="modal-overlay" id="orderModal">
  <div class="modal" id="modalContent">
    <h3 id="modalTitle">Place Order</h3>
    <p class="sub" id="modalSub"></p>
    <input id="custName" placeholder="Your name *" autocomplete="name"/>
    <input id="custPhone" placeholder="WhatsApp number (optional)" type="tel" autocomplete="tel"/>
    <input id="custQty" placeholder="Quantity (sets)" type="number" min="1" value="1"/>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeOrder()">Cancel</button>
      <button class="btn-submit" id="submitBtn" onclick="submitOrder()">Confirm Order</button>
    </div>
  </div>
</div>

<script>
var _designId, _baseUrl = '${baseUrl}';

function openOrder(designId, itemName, designNo, rate) {
  _designId = designId;
  document.getElementById('modalTitle').textContent = 'Order — Design ' + designNo;
  document.getElementById('modalSub').textContent = itemName + ' · ₹' + rate;
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('custQty').value = '1';
  document.getElementById('modalContent').innerHTML = document.getElementById('modalContent').innerHTML;
  // restore the form (above line wipes it, so rebuild)
  document.getElementById('modalContent').innerHTML = \`
    <h3>\${document.getElementById('modalTitle')?.textContent || 'Order — Design ' + designNo}</h3>
    <p class="sub">\${itemName} · ₹\${rate}</p>
    <input id="custName" placeholder="Your name *" autocomplete="name"/>
    <input id="custPhone" placeholder="WhatsApp number (optional)" type="tel" autocomplete="tel"/>
    <input id="custQty" placeholder="Quantity (sets)" type="number" min="1" value="1"/>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeOrder()">Cancel</button>
      <button class="btn-submit" id="submitBtn" onclick="submitOrder()">Confirm Order</button>
    </div>
  \`;
  document.getElementById('orderModal').classList.add('open');
  setTimeout(() => document.getElementById('custName')?.focus(), 100);
}

function closeOrder() {
  document.getElementById('orderModal').classList.remove('open');
}

async function submitOrder() {
  var name = document.getElementById('custName').value.trim();
  if (!name) { document.getElementById('custName').focus(); return; }
  var phone = document.getElementById('custPhone').value.trim();
  var qty = parseInt(document.getElementById('custQty').value) || 1;
  var btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';
  try {
    var resp = await fetch(_baseUrl + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ design_id: _designId, customer_name: name, customer_phone: phone || null, quantity: qty, source: 'catalog' })
    });
    if (!resp.ok) throw new Error('failed');
    document.getElementById('modalContent').innerHTML = \`
      <div class="success">
        <div class="tick">✅</div>
        <h3>Order Placed!</h3>
        <p>Thank you, \${name}. We'll contact you${phone ? ' on WhatsApp' : ''} shortly.</p>
      </div>
    \`;
    setTimeout(closeOrder, 3000);
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Confirm Order';
    alert('Could not place order. Please try again or call us directly.');
  }
}

document.getElementById('orderModal').addEventListener('click', function(e) {
  if (e.target === this) closeOrder();
});
</script>
</body>
</html>`;
}

module.exports = router;
