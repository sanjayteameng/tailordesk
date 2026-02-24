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

function getMeasurementForSnapshot(customerId, measurementId, useLatestMeasurement) {
  if (measurementId) {
    return db
      .prepare("SELECT * FROM measurements WHERE id = ? AND customer_id = ?")
      .get(Number(measurementId), customerId);
  }

  if (!useLatestMeasurement) {
    return null;
  }

  return db
    .prepare(
      `
      SELECT *
      FROM measurements
      WHERE customer_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `
    )
    .get(customerId);
}

function saveMeasurementSnapshot(orderId, customerId, measurement) {
  if (!measurement) {
    return;
  }

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
    measurement.id ?? null,
    measurement.neck ?? null,
    measurement.chest ?? null,
    measurement.waist ?? null,
    measurement.hip ?? null,
    measurement.shoulder ?? null,
    measurement.sleeve ?? null,
    measurement.length ?? null,
    measurement.inseam ?? null,
    asOptionalText(measurement.notes)
  );
}

router.get("/", (req, res) => {
  const customerId = req.query.customerId ? Number(req.query.customerId) : null;

  const sql = `
    SELECT
      o.*,
      c.name AS customer_name,
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
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_measurement_snapshots s ON s.order_id = o.id
    ${customerId ? "WHERE o.customer_id = ?" : ""}
    ORDER BY o.created_at DESC
  `;

  const rows = customerId ? db.prepare(sql).all(customerId) : db.prepare(sql).all();
  return res.json(rows);
});

router.post("/", authorizeRoles("admin"), (req, res) => {
  const {
    customer_id,
    garment_type,
    status,
    total_amount,
    advance_paid,
    due_date,
    delivery_date,
    notes,
    measurement_id,
    use_latest_measurement,
    status_note
  } = req.body;

  if (!customer_id || !garment_type) {
    return res.status(400).json({ message: "customer_id and garment_type are required" });
  }

  const customerId = Number(customer_id);
  const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId);
  if (!customer) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const nextStatus = status || "pending";
  if (!isValidStatus(nextStatus)) {
    return res
      .status(400)
      .json({ message: `status must be one of: ${ORDER_STATUSES.join(", ")}` });
  }

  const measurement = getMeasurementForSnapshot(
    customerId,
    measurement_id,
    Boolean(use_latest_measurement)
  );
  if ((measurement_id || use_latest_measurement) && !measurement) {
    return res.status(400).json({ message: "Measurement not found for snapshot" });
  }

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO orders (
          customer_id, garment_type, status, total_amount, advance_paid, due_date, delivery_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        customerId,
        garment_type,
        nextStatus,
        asNumber(total_amount, 0),
        asNumber(advance_paid, 0),
        asOptionalText(due_date),
        asOptionalText(delivery_date),
        asOptionalText(notes)
      );

    const orderId = Number(result.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, note)
      VALUES (?, NULL, ?, ?, ?)
    `
    ).run(orderId, nextStatus, req.user.id, asOptionalText(status_note) || "Order created");

    saveMeasurementSnapshot(orderId, customerId, measurement);
    return orderId;
  });

  const orderId = transaction();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  return res.status(201).json(order);
});

router.put("/:id", authorizeRoles("admin"), (req, res) => {
  const orderId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);

  if (!existing) {
    return res.status(404).json({ message: "Order not found" });
  }

  const {
    garment_type,
    status,
    total_amount,
    advance_paid,
    due_date,
    delivery_date,
    notes,
    status_note
  } = req.body;

  const nextStatus = status ?? existing.status;
  if (!isValidStatus(nextStatus)) {
    return res
      .status(400)
      .json({ message: `status must be one of: ${ORDER_STATUSES.join(", ")}` });
  }

  const transaction = db.transaction(() => {
    db.prepare(
      `
      UPDATE orders
      SET garment_type = ?, status = ?, total_amount = ?, advance_paid = ?, due_date = ?, delivery_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(
      garment_type ?? existing.garment_type,
      nextStatus,
      asNumber(total_amount, existing.total_amount),
      asNumber(advance_paid, existing.advance_paid),
      due_date === "" ? null : due_date ?? existing.due_date,
      delivery_date === "" ? null : delivery_date ?? existing.delivery_date,
      notes === "" ? null : notes ?? existing.notes,
      orderId
    );

    if (nextStatus !== existing.status) {
      db.prepare(
        `
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, note)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        orderId,
        existing.status,
        nextStatus,
        req.user.id,
        asOptionalText(status_note) || "Status updated from dashboard"
      );
    }
  });

  transaction();

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  return res.json(updated);
});

router.delete("/:id", authorizeRoles("admin"), (req, res) => {
  const orderId = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);

  if (!existing) {
    return res.status(404).json({ message: "Order not found" });
  }

  db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  return res.status(204).send();
});

router.get("/:id/payments", (req, res) => {
  const orderId = Number(req.params.id);
  const payments = db
    .prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at DESC")
    .all(orderId);
  return res.json(payments);
});

router.post("/:id/payments", authorizeRoles("admin"), (req, res) => {
  const orderId = Number(req.params.id);
  const { amount, method, paid_at, notes } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "amount is required" });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const result = db
    .prepare(
      `
      INSERT INTO payments (order_id, customer_id, amount, method, paid_at, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      orderId,
      order.customer_id,
      asNumber(amount, 0),
      asOptionalText(method) || "cash",
      asOptionalText(paid_at) || new Date().toISOString(),
      asOptionalText(notes)
    );

  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(payment);
});

router.get("/:id/history", (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const statusEvents = db
    .prepare(
      `
      SELECT
        'status_change' AS event_type,
        h.changed_at AS happened_at,
        h.order_id,
        h.from_status,
        h.to_status,
        h.note,
        NULL AS amount,
        NULL AS method
      FROM order_status_history h
      WHERE h.order_id = ?
    `
    )
    .all(orderId);

  const paymentEvents = db
    .prepare(
      `
      SELECT
        'payment' AS event_type,
        p.paid_at AS happened_at,
        p.order_id,
        NULL AS from_status,
        NULL AS to_status,
        p.notes AS note,
        p.amount,
        p.method
      FROM payments p
      WHERE p.order_id = ?
    `
    )
    .all(orderId);

  const history = [...statusEvents, ...paymentEvents].sort((a, b) =>
    String(b.happened_at).localeCompare(String(a.happened_at))
  );

  return res.json(history);
});

module.exports = router;
