const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "tailordesk.sqlite");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

const ORDER_STATUSES = ["pending", "completed", "cancelled"];

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
}

function addColumnIfMissing(tableName, columnName, columnSql) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mobile TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      item_type TEXT,
      neck REAL,
      chest REAL,
      waist REAL,
      hip REAL,
      shoulder REAL,
      sleeve REAL,
      length REAL,
      inseam REAL,
      notes TEXT,
      measurement_data TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      garment_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subtotal REAL NOT NULL DEFAULT 0,
      discount_type TEXT NOT NULL DEFAULT 'amount' CHECK(discount_type IN ('amount', 'percent')),
      discount_value REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      advance_paid REAL NOT NULL DEFAULT 0,
      remaining_due REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      delivery_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      rate REAL NOT NULL DEFAULT 0 CHECK(rate >= 0),
      line_total REAL NOT NULL DEFAULT 0 CHECK(line_total >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_measurement_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      source_measurement_id INTEGER,
      item_type TEXT,
      neck REAL,
      chest REAL,
      waist REAL,
      hip REAL,
      shoulder REAL,
      sleeve REAL,
      length REAL,
      inseam REAL,
      notes TEXT,
      measurement_data TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(source_measurement_id) REFERENCES measurements(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by_user_id INTEGER,
      note TEXT,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_measurements_customer_created
      ON measurements(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_created
      ON orders(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_customer_paid_at
      ON payments(customer_id, paid_at DESC);
    CREATE INDEX IF NOT EXISTS idx_status_history_order_changed
      ON order_status_history(order_id, changed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_items_order
      ON order_items(order_id, created_at ASC);
  `);

  addColumnIfMissing("measurements", "item_type", "item_type TEXT");
  addColumnIfMissing("measurements", "measurement_data", "measurement_data TEXT");
  addColumnIfMissing(
    "order_measurement_snapshots",
    "item_type",
    "item_type TEXT"
  );
  addColumnIfMissing(
    "order_measurement_snapshots",
    "measurement_data",
    "measurement_data TEXT"
  );
  addColumnIfMissing("orders", "subtotal", "subtotal REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(
    "orders",
    "discount_type",
    "discount_type TEXT NOT NULL DEFAULT 'amount'"
  );
  addColumnIfMissing("orders", "discount_value", "discount_value REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("orders", "remaining_due", "remaining_due REAL NOT NULL DEFAULT 0");
  addColumnIfMissing("users", "mobile", "mobile TEXT");

  db.exec(`
    UPDATE orders
    SET status = CASE
      WHEN status IN ('delivered', 'ready') THEN 'completed'
      WHEN status IN ('in_progress', 'trial') THEN 'pending'
      WHEN status NOT IN ('pending', 'completed', 'cancelled') THEN 'pending'
      ELSE status
    END;

    UPDATE order_status_history
    SET from_status = CASE
      WHEN from_status IN ('delivered', 'ready') THEN 'completed'
      WHEN from_status IN ('in_progress', 'trial') THEN 'pending'
      WHEN from_status IS NULL THEN NULL
      WHEN from_status NOT IN ('pending', 'completed', 'cancelled') THEN 'pending'
      ELSE from_status
    END;

    UPDATE order_status_history
    SET to_status = CASE
      WHEN to_status IN ('delivered', 'ready') THEN 'completed'
      WHEN to_status IN ('in_progress', 'trial') THEN 'pending'
      WHEN to_status NOT IN ('pending', 'completed', 'cancelled') THEN 'pending'
      ELSE to_status
    END;

    UPDATE orders
    SET remaining_due = MAX(
      0,
      COALESCE(total_amount, 0) - (
        COALESCE(advance_paid, 0)
        + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = orders.id), 0)
      )
    );
  `);

}

module.exports = { db, initDb, ORDER_STATUSES };
