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

function asNullableNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toJsonOrNull(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function normalizeJsonString(value) {
  const parsed = parseJsonObject(value);
  if (!parsed) {
    return null;
  }
  try {
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

function isValidStatus(status) {
  return ORDER_STATUSES.includes(status);
}

function pickMeasurementValue(reqBody, measurementData, key) {
  if (reqBody[key] !== undefined) {
    return reqBody[key];
  }
  if (measurementData && measurementData[key] !== undefined) {
    return measurementData[key];
  }
  return null;
}

function parseMeasurementRow(row) {
  return {
    ...row,
    measurement_data: parseJsonObject(row.measurement_data) || {}
  };
}

function parseOrderRow(row) {
  return {
    ...row,
    snap_measurement_data: parseJsonObject(row.snap_measurement_data) || {}
  };
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
    .all(customerId)
    .map(parseMeasurementRow);

  const orders = db
    .prepare(`
      SELECT
        o.*,
        (
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = o.id), 0)
          + COALESCE(o.advance_paid, 0)
        ) AS paid_total,
        s.source_measurement_id,
        s.item_type AS snap_item_type,
        s.neck AS snap_neck,
        s.chest AS snap_chest,
        s.waist AS snap_waist,
        s.hip AS snap_hip,
        s.shoulder AS snap_shoulder,
        s.sleeve AS snap_sleeve,
        s.length AS snap_length,
        s.inseam AS snap_inseam,
        s.notes AS snap_notes,
        s.measurement_data AS snap_measurement_data,
        s.created_at AS snapshot_created_at
      FROM orders o
      LEFT JOIN order_measurement_snapshots s ON s.order_id = o.id
      WHERE o.customer_id = ?
      ORDER BY o.created_at DESC
    `)
    .all(customerId)
    .map(parseOrderRow);

  const itemStmt = db.prepare(
    `
      SELECT id, order_id, item_type, quantity, rate, line_total
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `
  );
  const ordersWithItems = orders.map((order) => ({
    ...order,
    items: itemStmt.all(order.id)
  }));

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

  return res.json({ customer, measurements, orders: ordersWithItems, payments, timeline });
});

router.get("/:id/measurements", (req, res) => {
  const customerId = Number(req.params.id);
  const rows = db
    .prepare("SELECT * FROM measurements WHERE customer_id = ? ORDER BY created_at DESC, id DESC")
    .all(customerId)
    .map(parseMeasurementRow);
  return res.json(rows);
});

router.delete("/:id/measurements/:measurementId", authorizeRoles("admin"), (req, res) => {
  const customerId = Number(req.params.id);
  const measurementId = Number(req.params.measurementId);

  const existing = db
    .prepare("SELECT id FROM measurements WHERE id = ? AND customer_id = ?")
    .get(measurementId, customerId);
  if (!existing) {
    return res.status(404).json({ message: "Measurement not found" });
  }

  db.prepare("DELETE FROM measurements WHERE id = ? AND customer_id = ?").run(
    measurementId,
    customerId
  );
  return res.status(204).send();
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
    item_type,
    notes,
    measurement_data,
    create_order,
    order
  } = req.body;

  const measurementData = parseJsonObject(measurement_data) || {};
  const measurementNotes =
    asOptionalText(notes) || asOptionalText(measurementData.custom_details);
  const normalizedMeasurementData = toJsonOrNull(measurementData);

  const neck = asNullableNumber(pickMeasurementValue(req.body, measurementData, "neck"));
  const chest = asNullableNumber(pickMeasurementValue(req.body, measurementData, "chest"));
  const waist = asNullableNumber(pickMeasurementValue(req.body, measurementData, "waist"));
  const hip = asNullableNumber(pickMeasurementValue(req.body, measurementData, "hip"));
  const shoulder = asNullableNumber(
    pickMeasurementValue(req.body, measurementData, "shoulder")
  );
  const sleeve = asNullableNumber(pickMeasurementValue(req.body, measurementData, "sleeve"));
  const length = asNullableNumber(pickMeasurementValue(req.body, measurementData, "length"));
  const inseam = asNullableNumber(pickMeasurementValue(req.body, measurementData, "inseam"));

  const shouldCreateOrder = Boolean(create_order);
  const orderPayload = order || {};
  const resolvedItemType =
    asOptionalText(item_type) || asOptionalText(orderPayload.garment_type);
  const nextStatus = orderPayload.status || "pending";

  if (!resolvedItemType) {
    return res.status(400).json({ message: "item_type is required" });
  }

  if (shouldCreateOrder && !isValidStatus(nextStatus)) {
    return res
      .status(400)
      .json({ message: `order.status must be one of: ${ORDER_STATUSES.join(", ")}` });
  }

  const incomingData = normalizeJsonString(normalizedMeasurementData);
  const incomingNotes = asOptionalText(measurementNotes) || "";
  const duplicateCandidates = db
    .prepare(
      `
      SELECT *
      FROM measurements
      WHERE customer_id = ? AND LOWER(item_type) = LOWER(?)
      ORDER BY id DESC
    `
    )
    .all(customerId, resolvedItemType);

  const duplicateMatch = duplicateCandidates.find((row) => {
    const existingData = normalizeJsonString(row.measurement_data);
    const existingNotes = asOptionalText(row.notes) || "";
    return existingData === incomingData && existingNotes === incomingNotes;
  });

  if (duplicateMatch) {
    if (shouldCreateOrder) {
      return res.status(409).json({
        message: "Duplicate measurement. Change measurement values before creating a new order."
      });
    }

    return res.status(200).json({
      ...parseMeasurementRow(duplicateMatch),
      duplicate: true,
      skipped: true,
      message: "Duplicate measurement skipped."
    });
  }

  const transaction = db.transaction(() => {
    const measurementResult = db
      .prepare(
        `
        INSERT INTO measurements (
          customer_id, item_type, neck, chest, waist, hip, shoulder, sleeve, length, inseam, notes, measurement_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        customerId,
        resolvedItemType,
        neck,
        chest,
        waist,
        hip,
        shoulder,
        sleeve,
        length,
        inseam,
        measurementNotes,
        normalizedMeasurementData
      );

    const measurementId = Number(measurementResult.lastInsertRowid);
    const measurement = db
      .prepare("SELECT * FROM measurements WHERE id = ?")
      .get(measurementId);

    if (!shouldCreateOrder) {
      return { measurement: parseMeasurementRow(measurement), order: null };
    }

    const orderResult = db
      .prepare(
        `
        INSERT INTO orders (
          customer_id, garment_type, status, subtotal, discount_type, discount_value, total_amount, advance_paid, remaining_due, due_date, delivery_date, notes
        ) VALUES (?, ?, ?, ?, 'amount', 0, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        customerId,
        resolvedItemType,
        nextStatus,
        asNumber(orderPayload.total_amount, 0),
        asNumber(orderPayload.total_amount, 0),
        Math.max(0, asNumber(orderPayload.advance_paid, 0)),
        Math.max(0, asNumber(orderPayload.total_amount, 0) - Math.max(0, asNumber(orderPayload.advance_paid, 0))),
        asOptionalText(orderPayload.due_date),
        asOptionalText(orderPayload.delivery_date),
        asOptionalText(orderPayload.notes)
      );

    const orderId = Number(orderResult.lastInsertRowid);

    db.prepare(
      `
        INSERT INTO order_items (order_id, item_type, quantity, rate, line_total)
        VALUES (?, ?, 1, ?, ?)
      `
    ).run(
      orderId,
      resolvedItemType,
      asNumber(orderPayload.total_amount, 0),
      asNumber(orderPayload.total_amount, 0)
    );

    db.prepare(
      `
      INSERT INTO order_measurement_snapshots (
        order_id, customer_id, source_measurement_id,
        item_type, neck, chest, waist, hip, shoulder, sleeve, length, inseam, notes, measurement_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      orderId,
      customerId,
      measurementId,
      measurement.item_type ?? null,
      measurement.neck ?? null,
      measurement.chest ?? null,
      measurement.waist ?? null,
      measurement.hip ?? null,
      measurement.shoulder ?? null,
      measurement.sleeve ?? null,
      measurement.length ?? null,
      measurement.inseam ?? null,
      measurement.notes ?? null,
      measurement.measurement_data ?? null
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
    return { measurement: parseMeasurementRow(measurement), order: createdOrder };
  });

  const result = transaction();
  if (result.order) {
    return res.status(201).json(result);
  }
  return res.status(201).json(result.measurement);
});

module.exports = router;
