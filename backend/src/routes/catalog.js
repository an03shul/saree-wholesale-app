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
      const msg = encodeURIComponent(`Hi, I'd like to order:\n*${item.name}* - Design ${d.design_number}\nRate: ₹${d.rate} | ${d.pcs_per_set} pcs/set${d.fabric_type ? `\nFabric: ${d.fabric_type}` : ''}${d.colors ? `\nColors: ${d.colors}` : ''}`);
      const waLink = shopPhone ? `https://wa.me/${shopPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
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
            <a class="order-btn" href="${waLink}" target="_blank">Order on WhatsApp</a>
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
  .order-btn{display:block;margin-top:10px;background:#25d366;color:#fff;text-align:center;padding:9px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}
  .empty{text-align:center;padding:60px 20px;color:#aaa}
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
</body>
</html>`;
}

module.exports = router;
