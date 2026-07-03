const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

// Database file location. In production set DB_PATH to a path on a persistent
// disk (e.g. a Railway volume mounted at /data → DB_PATH=/data/gopiram.db) so
// the data survives restarts and redeploys. Defaults to the project folder for
// local dev.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../gopiram.db');

const db = new DatabaseSync(DB_PATH);

// Enforce foreign keys so ON DELETE CASCADE works (e.g. deleting an item removes
// its designs). SQLite has this OFF by default. Must be set per connection.
try { db.exec('PRAGMA foreign_keys = ON'); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    design_number TEXT NOT NULL,
    photo_path TEXT,
    rate REAL NOT NULL,
    colors TEXT,
    fabric_type TEXT,
    pcs_per_set INTEGER NOT NULL,
    tally_item_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    type TEXT CHECK(type IN ('individual','group')) DEFAULT 'individual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    design_id INTEGER REFERENCES designs(id),
    customer_name TEXT,
    customer_phone TEXT,
    quantity INTEGER DEFAULT 1,
    note TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin','staff')) DEFAULT 'staff',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations for existing DBs
try { db.exec('ALTER TABLE items ADD COLUMN brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE'); } catch {}
try { db.exec('ALTER TABLE designs ADD COLUMN fabric_type TEXT'); } catch {}
try { db.exec('ALTER TABLE designs ADD COLUMN in_stock INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE items ADD COLUMN in_stock INTEGER DEFAULT 1'); } catch {}
// Backfill nulls in case column existed without default
try { db.exec("UPDATE designs SET in_stock = 1 WHERE in_stock IS NULL"); } catch {}
try { db.exec("UPDATE items SET in_stock = 1 WHERE in_stock IS NULL"); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN design_number TEXT'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN item_name TEXT'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN brand_name TEXT'); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'orders_tab'"); } catch {}
// Comma-separated design ids for multi-design (custom-form) orders
try { db.exec('ALTER TABLE orders ADD COLUMN design_ids TEXT'); } catch {}
try { db.exec('ALTER TABLE designs ADD COLUMN tally_stock_cache REAL'); } catch {}
try { db.exec('ALTER TABLE designs ADD COLUMN tally_stock_updated_at DATETIME'); } catch {}

// Tally stock cache — populated by the sync agent running on the shop PC.
// Keyed by the exact Tally stock item name; designs join via tally_item_name.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tally_stock (
      tally_item_name TEXT PRIMARY KEY,
      qty REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch {}

// Tally customers (Sundry Debtors) cache — also populated by the sync agent.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tally_customers (
      name TEXT PRIMARY KEY,
      phone TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch {}

// Settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Push notification subscriptions (Web Push API)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch {}
// Default WhatsApp caption template
const tmplExists = db.prepare("SELECT key FROM settings WHERE key='whatsapp_template'").get();
if (!tmplExists) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('whatsapp_template', ?)")
    .run('*{item_name}* — Design {design_number}\nRate: ₹{rate}\n{pcs_per_set} pcs/set\nFabric: {fabric_type}\nColors: {colors}');
}

// Fabric types table
db.exec(`
  CREATE TABLE IF NOT EXISTS fabric_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default fabric types if empty
const fabricCount = db.prepare('SELECT COUNT(*) as c FROM fabric_types').get();
if (fabricCount.c === 0) {
  const defaults = ['Pure Silk','Art Silk','Kanjivaram Silk','Banarasi Silk','Tussar Silk','Mysore Silk','Georgette','Chiffon','Crepe','Organza','Net','Cotton','Linen','Chanderi','Maheshwari','Pochampally','Patola','Bandhani','Velvet','Satin','Lycra','Embroidered'];
  const ins = db.prepare('INSERT OR IGNORE INTO fabric_types (name) VALUES (?)');
  defaults.forEach(f => ins.run(f));
}

// Seed default work categories if empty
const workCatCount = db.prepare('SELECT COUNT(*) as c FROM work_categories').get();
if (workCatCount.c === 0) {
  const defaults = [
    'Plain',             // no embellishment, solid or woven only
    'Print',             // screen/digital/block print
    'Hand Block Print',  // traditional hand-stamped print
    'Digital Print',     // digital inkjet print
    'Work',              // generic embellishment (thread, zari, etc.)
    'Print + Work',      // print base with added embellishment
    'Embroidery',        // machine embroidery
    'Hand Embroidery',   // handcrafted needlework
    'Kantha Work',       // running-stitch embroidery (Bengal / Odisha)
    'Chikankari',        // Lucknowi shadow stitch
    'Phulkari',          // Punjabi floral threadwork
    'Aari Work',         // chain-stitch with hooked needle
    'Zardozi',           // heavy gold/silver metallic embroidery
    'Zari Work',         // gold/silver wire weaving or embroidery
    'Sequence Work',     // sequins / paillettes
    'Stone Work',        // rhinestone / kundan setting
    'Mirror Work',       // shisha / mirror inlay
    'Gota Patti',        // Rajasthani ribbon appliqué
    'Resham Work',       // pure silk-thread embroidery
    'Thread Work',       // multi-color thread embellishment
    'Patch Work',        // appliqué / fabric patching
    'Bandhani',          // tie-dye dot pattern
    'Leheriya',          // diagonal wave tie-dye (Rajasthan)
    'Shibori',           // Japanese-style resist-dye
    'Kalamkari',         // hand-painted / block-printed narrative art
    'Batik',             // wax-resist dye print
    'Lace Work',         // lace border or inlay
    'Cutwork',           // fabric cut-out patterns
    'Mukaish / Kamdani', // flat wire-chip hand embroidery
    'Jamdani',           // extra-weft figure weaving
  ];
  const ins = db.prepare('INSERT OR IGNORE INTO work_categories (name) VALUES (?)');
  defaults.forEach(w => ins.run(w));
}

// Add work_category column to designs if not present
try { db.exec('ALTER TABLE designs ADD COLUMN work_category TEXT'); } catch {}

// Remove UNIQUE constraint on items.name (recreate table if old schema)
const itemsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'").get();
if (itemsInfo && itemsInfo.sql && itemsInfo.sql.includes('UNIQUE')) {
  db.exec(`
    ALTER TABLE items RENAME TO items_old;
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO items SELECT * FROM items_old;
    DROP TABLE items_old;
  `);
}

// Seed default admin if no users exist
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const pinHash = crypto.createHash('sha256').update('1234').digest('hex');
  db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('admin', ?, 'admin')").run(pinHash);
  console.log('Default admin created — username: admin, PIN: 1234 (change after first login)');
}

module.exports = db;
