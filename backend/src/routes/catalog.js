const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../db/database');

// GET /catalog/custom — Render a custom selection of designs across brands
router.get('/custom', (req, res) => {
  try {
    const idsStr = req.query.ids || '';
    const ids = idsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    
    if (ids.length === 0) {
      return res.status(400).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>No designs selected</h2><p>Please check the link and try again.</p></body></html>');
    }

    const { fabric, maxRate, minRate } = req.query;

    const queryParams = [...ids];
    let filterSql = '';
    if (fabric) {
      filterSql += ' AND d.fabric_type = ?';
      queryParams.push(fabric);
    }
    if (minRate) {
      filterSql += ' AND d.rate >= ?';
      queryParams.push(parseFloat(minRate));
    }
    if (maxRate) {
      filterSql += ' AND d.rate <= ?';
      queryParams.push(parseFloat(maxRate));
    }

    // SQLite `IN` query requires dynamically matching the number of placeholders
    const placeholders = ids.map(() => '?').join(',');
    const designs = db.prepare(`
      SELECT d.*, i.name AS item_name, b.name AS brand_name
      FROM designs d
      JOIN items i ON d.item_id = i.id
      JOIN brands b ON b.id = i.brand_id
      WHERE d.id IN (${placeholders}) AND d.in_stock = 1 ${filterSql}
      ORDER BY b.name, i.name, CAST(d.design_number AS INTEGER), d.design_number
    `).all(...queryParams);

    // Group designs by Brand + Item
    const itemsMap = {};
    designs.forEach(d => {
      const itemKey = `${d.brand_name} · ${d.item_name}`;
      if (!itemsMap[itemKey]) {
        itemsMap[itemKey] = {
          name: itemKey,
          designs: []
        };
      }
      itemsMap[itemKey].designs.push(d);
    });
    const itemsWithDesigns = Object.values(itemsMap);

    const brand = {
      name: 'Selected Collection',
      description: 'Handpicked designs for you'
    };

    const shopPhone = process.env.SHOP_WHATSAPP || '';
    
    // Calculate all fabrics dynamically from the initial set of designs
    const allFabrics = [...new Set(
      db.prepare(`
        SELECT DISTINCT fabric_type FROM designs 
        WHERE id IN (${placeholders}) AND fabric_type IS NOT NULL
      `).all(...ids).map(r => r.fabric_type)
    )];

    res.send(buildCatalogHtml({ brand, items: itemsWithDesigns, shopPhone, allFabrics, filters: { fabric, maxRate, minRate } }));
  } catch (err) {
    console.error('Custom catalog render error:', err.message);
    res.status(500).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Catalog temporarily unavailable</h2><p>Please try again in a moment.</p></body></html>');
  }
});

// Public catalog page for customers — uses app in_stock flag only, never Tally stock
router.get('/:brandId', (req, res) => {
  // Wrapped so any error returns a clean page instead of hanging the request
  // (an unhandled throw in here previously caused the catalog to time out).
  try {
    const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.brandId);
    if (!brand) return res.status(404).send('Brand not found');

    const { fabric, maxRate, minRate, item: itemParam } = req.query;

    // Only show in-stock items
    let items = db.prepare('SELECT * FROM items WHERE brand_id = ? AND in_stock = 1 ORDER BY name').all(brand.id);
    if (itemParam) items = items.filter(i => i.name.toLowerCase() === String(itemParam).toLowerCase());

    const itemsWithDesigns = items.map((item) => {
      let designs = db.prepare('SELECT * FROM designs WHERE item_id = ? AND in_stock = 1 ORDER BY CAST(design_number AS INTEGER), design_number').all(item.id);

      if (fabric) designs = designs.filter(d => d.fabric_type === fabric);
      if (maxRate) designs = designs.filter(d => d.rate <= parseFloat(maxRate));
      if (minRate) designs = designs.filter(d => d.rate >= parseFloat(minRate));

      return { ...item, designs };
    }).filter(i => i.designs.length > 0);

    const shopPhone = process.env.SHOP_WHATSAPP || '';
    const allFabrics = [...new Set(
      db.prepare('SELECT DISTINCT fabric_type FROM designs WHERE fabric_type IS NOT NULL').all().map(r => r.fabric_type)
    )];

    // NOTE: watermarks are NOT resolved here. The <img> tags point at
    // /uploads/wm/<file>, which lazy-generates and caches the watermark on first
    // request. This keeps the catalog HTML fast (returns in ms) instead of
    // blocking on a serial watermark queue for every design (which timed out).
    res.send(buildCatalogHtml({ brand, items: itemsWithDesigns, shopPhone, allFabrics, filters: { fabric, maxRate, minRate } }));
  } catch (err) {
    console.error('Catalog render error:', err.message);
    res.status(500).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Catalog temporarily unavailable</h2><p>Please try again in a moment.</p></body></html>');
  }
});

function buildCatalogHtml({ brand, items, shopPhone, allFabrics, filters }) {
  const designCards = items.flatMap(item =>
    item.designs.map(d => {
      const photoHtml = d.photo_path
        ? `<img class="card-img" src="/uploads/wm/${path.basename(d.photo_path)}" alt="Design ${d.design_number}" loading="lazy" onclick="openLightbox('/uploads/wm/${path.basename(d.photo_path)}')"/>`
        : `<div class="no-photo">No Photo</div>`;
      return `
        <div class="card" id="card-${d.id}">
          ${photoHtml}
          <div class="card-body">
            <div class="item-name">${item.name}</div>
            <div class="design-no">Design ${d.design_number}</div>
            <div class="rate">₹${d.rate}</div>
            <div class="meta">${d.pcs_per_set} pcs/set${d.fabric_type ? ` • ${d.fabric_type}` : ''}${d.colors ? `<br>${d.colors}` : ''}</div>
            <button class="order-btn" id="btn-${d.id}" onclick="toggleCart(${d.id},'${item.name.replace(/'/g,"\\'")}','${d.design_number}',${d.rate})">Add to Order</button>
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
  body{font-family:sans-serif;background:#f8f4f0;color:#2c1810;padding-bottom:80px}
  header{background:#c0392b;color:#fff;padding:16px 20px;text-align:center}
  header h1{font-size:22px}
  header p{font-size:13px;opacity:.85;margin-top:4px}
  .filters{padding:12px 16px;background:#fff;border-bottom:1px solid #eee;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  .filters select,.filters input{padding:8px 10px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff}
  .filters button{padding:8px 16px;background:#c0392b;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:16px}
  .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .card img,.no-photo{width:100%;height:180px;object-fit:cover}
  .card-img{cursor:zoom-in}
  .no-photo{background:#eee;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:13px}

  /* Full-screen photo lightbox */
  .lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:200;align-items:center;justify-content:center;overflow:hidden;touch-action:none}
  .lightbox.open{display:flex}
  .lightbox img{max-width:100%;max-height:100%;object-fit:contain;transition:transform .15s ease-out;transform-origin:center center;cursor:zoom-in;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
  .lightbox img.zoomed{cursor:zoom-out;transition:none}
  .lightbox-close{position:fixed;top:14px;right:18px;width:44px;height:44px;border-radius:22px;background:rgba(0,0,0,.45);color:#fff;font-size:26px;line-height:44px;text-align:center;border:none;cursor:pointer;z-index:201}
  .lightbox-hint{position:fixed;bottom:22px;left:0;width:100%;text-align:center;color:rgba(255,255,255,.7);font-size:13px;pointer-events:none}
  .card-body{padding:10px}
  .item-name{font-size:13px;color:#888}
  .design-no{font-weight:700;font-size:15px;margin-top:2px}
  .rate{color:#c0392b;font-weight:700;font-size:17px;margin:4px 0}
  .meta{font-size:12px;color:#888;line-height:1.5}
  .order-btn{display:block;margin-top:10px;background:#c0392b;color:#fff;text-align:center;padding:9px;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer;width:100%}
  .order-btn.added{background:#27ae60}
  .order-btn:active{opacity:.85}
  .empty{text-align:center;padding:60px 20px;color:#aaa}
  
  /* Floating Bottom Cart Bar */
  .cart-bar{position:fixed;bottom:0;left:0;width:100%;background:#fff;border-top:1.5px solid #eee;padding:12px 20px;display:none;align-items:center;justify-content:space-between;z-index:99;box-shadow:0 -4px 16px rgba(0,0,0,.08)}
  .cart-info{font-weight:800;font-size:15px;color:#2c1810}
  .cart-btn{background:#c0392b;color:#fff;padding:12px 24px;border-radius:10px;border:none;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 2px 6px rgba(192,57,43,.3)}
  .cart-btn:active{opacity:.85}

  /* Cart Modal List Layout */
  .cart-list{max-height:200px;overflow-y:auto;margin-bottom:20px;border:1px solid #eee;border-radius:10px;padding:4px 12px;background:#fafafa}
  .cart-item{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee;gap:10px}
  .cart-item:last-child{border-bottom:none}
  .cart-item-info{flex:1;min-width:0}
  .cart-item-title{font-weight:700;font-size:13.5px;color:#2c1810;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cart-item-sub{font-size:12px;color:#c0392b;font-weight:600;margin-top:2px}
  .cart-item-qty{display:flex;align-items:center;gap:6px}
  .qty-btn{width:28px;height:28px;border-radius:8px;border:1.5px solid #ddd;background:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;color:#555}
  .qty-btn:active{background:#eee}
  .qty-val{width:28px;text-align:center;font-size:14px;font-weight:800;color:#2c1810}
  .remove-btn{color:#e74c3c;background:none;border:none;font-size:18px;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center}
  
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

<!-- Floating bottom cart bar -->
<div class="cart-bar" id="cartBar">
  <div class="cart-info" id="cartCount">0 designs selected</div>
  <button class="cart-btn" onclick="openCart()">Place Order</button>
</div>

<!-- Order modal -->
<div class="modal-overlay" id="orderModal">
  <div class="modal" id="modalContent">
    <!-- Replaced dynamically -->
  </div>
</div>

<!-- Full-screen photo lightbox -->
<div class="lightbox" id="lightbox">
  <button class="lightbox-close" onclick="closeLightbox()" aria-label="Close">&times;</button>
  <img id="lightboxImg" src="" alt="Design photo"/>
  <div class="lightbox-hint">Tap photo to zoom &bull; Drag to pan</div>
</div>

<script>
var _shopPhone = '${shopPhone}';
var _cart = {}; // designId -> { id, itemName, designNo, rate, qty }

function toggleCart(designId, itemName, designNo, rate) {
  var btn = document.getElementById('btn-' + designId);
  if (_cart[designId]) {
    delete _cart[designId];
    btn.classList.remove('added');
    btn.textContent = 'Add to Order';
  } else {
    _cart[designId] = {
      id: designId,
      itemName: itemName,
      designNo: designNo,
      rate: rate,
      qty: 1
    };
    btn.classList.add('added');
    btn.textContent = '✓ Added';
  }
  updateCartBar();
}

function updateCartBar() {
  var keys = Object.keys(_cart);
  var bar = document.getElementById('cartBar');
  var count = document.getElementById('cartCount');
  if (keys.length > 0) {
    bar.style.display = 'flex';
    count.textContent = keys.length + ' design' + (keys.length !== 1 ? 's' : '') + ' selected';
  } else {
    bar.style.display = 'none';
  }
}

function updateQty(designId, delta) {
  if (!_cart[designId]) return;
  _cart[designId].qty += delta;
  if (_cart[designId].qty < 1) _cart[designId].qty = 1;
  document.getElementById('qty-' + designId).textContent = _cart[designId].qty;
}

function removeFromCart(designId) {
  delete _cart[designId];
  var btn = document.getElementById('btn-' + designId);
  if (btn) {
    btn.classList.remove('added');
    btn.textContent = 'Add to Order';
  }
  updateCartBar();
  openCart(); // Re-render cart modal
}

function openCart() {
  var keys = Object.keys(_cart);
  if (keys.length === 0) {
    closeOrder();
    return;
  }
  
  var itemsHtml = '';
  keys.forEach(function(key) {
    var item = _cart[key];
    itemsHtml += \`
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-title">\${item.itemName} (Design #\${item.designNo})</div>
          <div class="cart-item-sub">₹\${item.rate}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateQty(\${item.id}, -1)">-</button>
          <span class="qty-val" id="qty-\${item.id}">\${item.qty}</span>
          <button class="qty-btn" onclick="updateQty(\${item.id}, 1)">+</button>
        </div>
        <button class="remove-btn" onclick="removeFromCart(\${item.id})">✕</button>
      </div>
    \`;
  });

  document.getElementById('modalContent').innerHTML = \`
    <h3>Confirm Order</h3>
    <p class="sub">Please enter details to place your order.</p>
    <div class="cart-list">
      \${itemsHtml}
    </div>
    <input id="custName" placeholder="Your name *" autocomplete="name"/>
    <input id="custPhone" placeholder="WhatsApp number (optional)" type="tel" autocomplete="tel"/>
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
  var btn = document.getElementById('submitBtn');
  
  var keys = Object.keys(_cart);
  if (keys.length === 0) return;

  btn.disabled = true;
  btn.textContent = 'Placing order…';
  
  try {
    var promises = keys.map(function(key) {
      var item = _cart[key];
      return fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design_id: item.id,
          customer_name: name,
          customer_phone: phone || null,
          quantity: item.qty,
          source: 'catalog'
        })
      });
    });

    var responses = await Promise.all(promises);
    var failed = responses.some(r => !r.ok);
    if (failed) throw new Error('failed');
    
    if (_shopPhone) {
      document.getElementById('modalContent').innerHTML = \`
        <div class="success">
          <div class="tick">✅</div>
          <h3>Order Confirmed!</h3>
          <p>Opening WhatsApp to send order details...</p>
        </div>
      \`;
      
      var messageText = "Hello! I would like to place an order from your catalog:\\n\\n";
      keys.forEach(function(key) {
        var item = _cart[key];
        messageText += "• *" + item.itemName + "* (Design #" + item.designNo + ") · " + item.qty + " set(s) · ₹" + item.rate + "\\n";
      });
      messageText += "\\n*My Name*: " + name + (phone ? " (" + phone + ")" : "");

      // Reset cart UI
      keys.forEach(function(key) {
        var cardBtn = document.getElementById('btn-' + key);
        if (cardBtn) {
          cardBtn.classList.remove('added');
          cardBtn.textContent = 'Add to Order';
        }
      });
      _cart = {};
      updateCartBar();

      var waUrl = "https://wa.me/" + _shopPhone + "?text=" + encodeURIComponent(messageText);
      setTimeout(function() {
        window.location.href = waUrl;
      }, 1500);
    } else {
      document.getElementById('modalContent').innerHTML = \`
        <div class="success">
          <div class="tick">✅</div>
          <h3>Order Placed!</h3>
          <p>Thank you, \${name}. We'll contact you\${phone ? ' on WhatsApp' : ''} shortly.</p>
        </div>
      \`;
      
      // Reset cart UI
      keys.forEach(function(key) {
        var cardBtn = document.getElementById('btn-' + key);
        if (cardBtn) {
          cardBtn.classList.remove('added');
          cardBtn.textContent = 'Add to Order';
        }
      });
      _cart = {};
      updateCartBar();

      setTimeout(closeOrder, 3000);
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Confirm Order';
    alert('Could not place order. Please try again or call us directly.');
  }
}

document.getElementById('orderModal').addEventListener('click', function(e) {
  if (e.target === this) closeOrder();
});

// ---- Full-screen photo lightbox (tap to zoom, drag to pan) ----
var _lb = { zoomed: false, tx: 0, ty: 0, lastTx: 0, lastTy: 0, startX: 0, startY: 0 };
var _lbScale = 2.5;

function openLightbox(src) {
  var img = document.getElementById('lightboxImg');
  img.src = src;
  resetLbTransform(img);
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function resetLbTransform(img) {
  _lb.zoomed = false; _lb.tx = 0; _lb.ty = 0; _lb.lastTx = 0; _lb.lastTy = 0;
  img.style.transform = '';
  img.classList.remove('zoomed');
}

(function () {
  var img = document.getElementById('lightboxImg');
  var box = document.getElementById('lightbox');
  if (!img || !box) return;
  var active = false, moved = false, sx = 0, sy = 0;

  img.addEventListener('pointerdown', function (e) {
    active = true; moved = false; sx = e.clientX; sy = e.clientY;
    _lb.startX = e.clientX - _lb.lastTx; _lb.startY = e.clientY - _lb.lastTy;
    try { img.setPointerCapture(e.pointerId); } catch (err) {}
  });

  img.addEventListener('pointermove', function (e) {
    if (!active) return;
    if (Math.abs(e.clientX - sx) > 6 || Math.abs(e.clientY - sy) > 6) moved = true;
    if (_lb.zoomed && moved) {
      _lb.tx = e.clientX - _lb.startX;
      _lb.ty = e.clientY - _lb.startY;
      img.style.transform = 'translate(' + _lb.tx + 'px,' + _lb.ty + 'px) scale(' + _lbScale + ')';
      e.preventDefault();
    }
  });

  img.addEventListener('pointerup', function () {
    active = false;
    if (!moved) {
      if (_lb.zoomed) {
        resetLbTransform(img);
      } else {
        _lb.zoomed = true; _lb.tx = 0; _lb.ty = 0; _lb.lastTx = 0; _lb.lastTy = 0;
        img.classList.add('zoomed');
        img.style.transform = 'scale(' + _lbScale + ')';
      }
    } else {
      _lb.lastTx = _lb.tx; _lb.lastTy = _lb.ty;
    }
  });

  // Tap on the dark backdrop (not the image) closes the viewer.
  box.addEventListener('click', function (e) { if (e.target === box) closeLightbox(); });
})();
</script>
</body>
</html>`;
}

module.exports = router;
