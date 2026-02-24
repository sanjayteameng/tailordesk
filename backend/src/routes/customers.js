const express = require("express");
const { db, ORDER_STATUSES } = require("../db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken);

function asOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidStatus(status) {
  return ORDER_STATUSES.includes(status);
}

router.get("/", (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
        (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = c.id) AS total_order_value,
        (
          (SELECT COALESCE(SUM(o.advance_paid), 0) FROM orders o WHERE o.customer_id = c.id)
          + (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.customer_id = c.id)
        ) AS total_paid
      FROM customers c
      ORDER BY c.created_at DESC
    `)
    .all();

  return res.json(rows);
});

router.get("/:id", (req, res) => {
  const customerId = Number(req.params.id);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);

  if (!customer) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const measurements = db
    .prepare("SELECT * FROM measurements WHERE customer_id = ? ORDER BY created_at DESC, id DESC")
    .all(customerId);

  const orders = db
    .prepare(`
      SELECT
        o.*,
        (
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0)
          + COALESCE(o.advance_paid, 0)
        ) AS paid_total,
        s.source_measurement_id,
        s.neck AS snap_neck,
        s.chest AS snap_chest,
        s.waist AS snap_waist,
        s.hip AS snap_hip,
        s.shoulder AS snap_shoulder,
        s.sleeve AS snap_sleeve,
        s.length AS snap_length,
        s.inseam AS snap_inseam,
        s.notes AS snap_notes,
        s.created_at AS snapshot_created_at
      FROM orders o
      LEFT JOIN order_measurement_snapshots s ON s.order_id = o.id
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `)
    .all(customerId);

  const payments = db
    .prepare("SELECT * FROM payments WHERE customer_id = ? ORDER BY paid_at DESC")
    .all(customerId);

  const timeline = db
    .prepare(
      `
      SELECT *
      FROM (
        SELECT
          'order_created' AS event_type,
          o.created_at AS happened_at,
          o.id AS order_id,
          o.garment_type,
          NULL AS amount,
          NULL AS from_status,
          o.status AS to_status,
          NULL AS method,
          o.notes AS note
        FROM orders o
        WHERE o.customer_id = ?

        UNION ALL

        SELECT
          'status_change' AS event_type,
          h.changed_at AS happened_at,
          h.order_id AS order_id,
          o.garment_type,
          NULL AS amount,
          h.from_status,
          h.to_status,
          NULL AS method,
          h.note
        FROM order_status_history h
        JOIN orders o ON o.id = h.order_id
        WHERE o.customer_id = ?

        UNION ALL

        SELECT
          'payment' AS event_type,
          p.paid_at AS happened_at,
          p.order_id AS order_id,
          o.garment_type,
          p.amount,
          NULL AS from_status,
          NULL AS to_status,
          p.method,
          p.notes AS note
        FROM payments p
        JOIN orders o ON o.id = p.order_id
        WHERE p.customer_id = ?
      )
      ORDER BY happened_at DESC
    `
    )
    .all(customerId, customerId, customerId);

  return res.json({ customer, measurements, orders, payments, timeline });
});

router.get("/:id/measurements", (req, res) => {
  const customerId = Number(req.params.id);
  const rows = db
    .prepare("SELECT * FROM measurements WHERE customer_id = ? ORDER BY created_at DESC, id DESC")
    .all(customerId);
  return res.json(rows);
});

router.post("/", authorizeRoles("admin"), (req, res) => {
  const { name, phone, email, address, notes } = req.body;
  if (!name) {
    return res.status(400).json({ message: "Customer name is required" });
  }

  const result = db
    .prepare(
      "INSERT INTO customers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)"
    )
    .run(name, phone || null, email || null, address || null, notes || null);

  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(customer);
});

router.put("/:id", authorizeRoles("admin"), (req, res) => {
  const customerId = Number(req.params.id);
  const { name, phone, email, address, notes } = req.body;

  const existing = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
  if (!existing) {
    return res.status(404).json({ message: "Customer not found" });
  }

  db.prepare(
    "UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, notes = ? WHERE id = ?"
  ).run(name, phone || null, email || null, address || null, notes || null, customerId);

  const updated = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
  return res.json(updated);
});

router.delete("/:id", authorizeRoles("admin"), (req, res) => {
  const customerId = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
  if (!existing) {
    return res.status(404).json({ message: "Customer not found" });
  }

  db.prepare("DELETE FROM customers WHERE id = ?").run(customerId);
  return res.status(204).send();
});

router.post("/:id/measurements", authorizeRoles("admin"), (req, res) => {
  const customerId = Number(req.params.id);
  const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);

  if (!customer) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const {
    neck,
    chest,
    waist,
    hip,
    shoulder,
    sleeve,
    length,
    inseam,
    notes,
    create_order,
    order
  } = req.body;

  const shouldCreateOrder = Boolean(create_order);
  const orderPayload = order || {};
  const nextStatus = orderPayload.status || "pending";

  if (shouldCreateOrder && !orderPayload.garment_type) {
    return res.status(400).json({ message: "order.garment_type is required when create_order=true" });
  }

  if (shouldCreateOrder && !isValidStatus(nextStatus)) {
    return res
      .status(400)
      .json({ message: `order.status must be one of: ${ORDER_STATUSES.join(", ")}` });
  }

  const transaction = db.transaction(() => {
    const measurementResult = db
      .prepare(
        `
        INSERT INTO measurements (
          customer_id, neck, chest, waist, hip, shoulder, sleeve, length, inseam, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        customerId,
        neck ?? null,
        chest ?? null,
        waist ?? null,
        hip ?? null,
        shoulder ?? null,
        sleeve ?? null,
        length ?? null,
        inseam ?? null,
        asOptionalText(notes)
      );

    const measurementId = Number(measurementResult.lastInsertRowid);
    const measurement = db
      .prepare("SELECT * FROM measurements WHERE id = ?")
      .get(measurementId);

    if (!shouldCreateOrder) {
      return { measurement, order: null };
    }

    const orderResult = db
      .prepare(
        `
        INSERT INTO orders (
          customer_id, garment_type, status, total_amount, advance_paid, due_date, delivery_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        customerId,
        orderPayload.garment_type,
        nextStatus,
        asNumber(orderPayload.total_amount, 0),
        asNumber(orderPayload.advance_paid, 0),
        asOptionalText(orderPayload.due_date),
        asOptionalText(orderPayload.delivery_date),
        asOptionalText(orderPayload.notes)
      );

    const orderId = Number(orderResult.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO order_measurement_snapshots (
        order_id, customer_id, source_measurement_id,
        neck, chest, waist, hip, shoulder, sleeve, length, inseam, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      orderId,
      customerId,
      measurementId,
      measurement.neck ?? null,
      measurement.chest ?? null,
      measurement.waist ?? null,
      measurement.hip ?? null,
      measurement.shoulder ?? null,
      measurement.sleeve ?? null,
      measurement.length ?? null,
      measurement.inseam ?? null,
      measurement.notes ?? null
    );

    db.prepare(
      `
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, note)
      VALUES (?, NULL, ?, ?, ?)
    `
    ).run(
      orderId,
      nextStatus,
      req.user.id,
      asOptionalText(orderPayload.status_note) || "Order created with saved measurements"
    );

    const createdOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    return { measurement, order: createdOrder };
  });

  const result = transaction();

  if (result.order) {
    return res.status(201).json(result);
  }

  return res.status(201).json(result.measurement);
});

module.exports = router;
