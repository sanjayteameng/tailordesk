const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "tailordesk.sqlite");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

const ORDER_STATUSES = [
  "pending",
  "in_progress",
  "trial",
  "ready",
  "delivered",
  "cancelled"
];

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
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
      neck REAL,
      chest REAL,
      waist REAL,
      hip REAL,
      shoulder REAL,
      sleeve REAL,
      length REAL,
      inseam REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      garment_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_amount REAL NOT NULL DEFAULT 0,
      advance_paid REAL NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS order_measurement_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      source_measurement_id INTEGER,
      neck REAL,
      chest REAL,
      waist REAL,
      hip REAL,
      shoulder REAL,
      sleeve REAL,
      length REAL,
      inseam REAL,
      notes TEXT,
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
  `);

  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@tailordesk.local";
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";
  const adminName = process.env.DEFAULT_ADMIN_NAME || "Primary Admin";

  const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
    ).run(adminName, adminEmail, passwordHash);
    console.log(`Seeded default admin user: ${adminEmail}`);
  }
}

module.exports = { db, initDb, ORDER_STATUSES };
