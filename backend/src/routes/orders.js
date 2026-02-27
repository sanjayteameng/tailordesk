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

function isValidStatus(status) {
  return ORDER_STATUSES.includes(status);
}

function asPositiveInteger(value, fallback = 1) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const normalized = [];
  for (const item of items) {
    const itemType = asOptionalText(item?.item_type);
    const quantity = asPositiveInteger(item?.quantity);
    const rate = asNumber(item?.rate, 0);

    if (!itemType || quantity === null || rate < 0) {
      return null;
    }

    normalized.push({
      item_type: itemType,
      quantity,
      rate,
      line_total: quantity * rate
    });
  }
  return normalized;
}

function calculateTotals(subtotal, discountType, discountValue) {
  const safeSubtotal = Math.max(0, asNumber(subtotal, 0));
  const safeDiscountValue = Math.max(0, asNumber(discountValue, 0));

  if (!["amount", "percent"].includes(discountType)) {
    return null;
  }

  const discountAmount =
    discountType === "percent"
      ? safeSubtotal * Math.min(safeDiscountValue, 100) * 0.01
      : Math.min(safeDiscountValue, safeSubtotal);

  const finalTotal = Math.max(0, safeSubtotal - discountAmount);
  return {
    subtotal: safeSubtotal,
    discount_type: discountType,
    discount_value: safeDiscountValue,
    final_total: finalTotal
  };
}

function getOrderPaidTotal(orderId) {
  const row = db
    .prepare(
      `
      SELECT
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = ?), 0)
        + COALESCE((SELECT o.advance_paid FROM orders o WHERE o.id = ?), 0) AS paid_total
    `
    )
    .get(orderId, orderId);
  return asNumber(row?.paid_total, 0);
}

function recomputeOrderRemainingDue(orderId) {
  db.prepare(
    `
      UPDATE orders
      SET remaining_due = MAX(
        0,
        COALESCE(total_amount, 0) - (
          COALESCE(advance_paid, 0)
          + COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id = orders.id), 0)
        )
      )
      WHERE id = ?
    `
  ).run(orderId);
}

function getMeasurementForSnapshot(
  customerId,
  measurementId,
  useLatestMeasurement,
  garmentType
) {
  if (measurementId) {
    return db
      .prepare("SELECT * FROM measurements WHERE id = ? AND customer_id = ?")
      .get(Number(measurementId), customerId);
  }

  if (!useLatestMeasurement) {
    return null;
  }

  const type = asOptionalText(garmentType);
  if (type) {
    return db
      .prepare(
        `
        SELECT *
        FROM measurements
        WHERE customer_id = ? AND LOWER(item_type) = LOWER(?)
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `
      )
      .get(customerId, type);
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
      item_type, neck, chest, waist, hip, shoulder, sleeve, length, inseam, notes, measurement_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    orderId,
    customerId,
    measurement.id ?? null,
    measurement.item_type ?? null,
    measurement.neck ?? null,
    measurement.chest ?? null,
    measurement.waist ?? null,
    measurement.hip ?? null,
    measurement.shoulder ?? null,
    measurement.sleeve ?? null,
    measurement.length ?? null,
    measurement.inseam ?? null,
    asOptionalText(measurement.notes),
    measurement.measurement_data ?? null
  );
}

router.get("/", (req, res) => {
  const customerId = req.query.customerId ? Number(req.query.customerId) : null;
  const isAdmin = req.user?.role === "admin";

  const filters = [];
  const params = [];
  if (customerId) {
    filters.push("o.customer_id = ?");
    params.push(customerId);
  }
  if (!isAdmin) {
    filters.push("o.status IN ('pending', 'completed')");
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const sql = `
    SELECT
      o.*,
      c.name AS customer_name,
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
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_measurement_snapshots s ON s.order_id = o.id
    ${whereClause}
    ORDER BY o.created_at DESC
  `;

  const itemStmt = db.prepare(
    `
      SELECT id, order_id, item_type, quantity, rate, line_total
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `
  );

  const rows = db.prepare(sql).all(...params).map((row) => ({
    ...row,
    snap_measurement_data: parseJsonObject(row.snap_measurement_data) || {},
    items: itemStmt.all(row.id)
  }));
  return res.json(rows);
});

router.post("/", authorizeRoles("admin"), (req, res) => {
  const {
    customer_id,
    garment_type,
    items,
    status,
    subtotal,
    discount_type,
    discount_value,
    advance_paid,
    due_date,
    delivery_date,
    notes,
    measurement_id,
    use_latest_measurement,
    status_note
  } = req.body;

  if (!customer_id) {
    return res.status(400).json({ message: "customer_id is required" });
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

  const normalizedItems = normalizeOrderItems(items);
  if (!normalizedItems) {
    return res.status(400).json({
      message: "items are required and each item must include item_type, quantity (> 0), rate (>= 0)"
    });
  }

  const computedSubtotal = normalizedItems.reduce((sum, item) => sum + item.line_total, 0);
  const totals = calculateTotals(
    subtotal === undefined ? computedSubtotal : subtotal,
    discount_type || "amount",
    discount_value || 0
  );
  if (!totals) {
    return res.status(400).json({ message: "discount_type must be amount or percent" });
  }

  const resolvedGarmentType =
    asOptionalText(garment_type) ||
    (normalizedItems.length === 1
      ? normalizedItems[0].item_type
      : `${normalizedItems[0].item_type} +${normalizedItems.length - 1} more`);

  const shouldUseLatestMeasurement =
    use_latest_measurement === undefined ? true : Boolean(use_latest_measurement);
  const measurement = getMeasurementForSnapshot(
    customerId,
    measurement_id,
    shouldUseLatestMeasurement,
    normalizedItems[0].item_type
  );
  if (!measurement) {
    return res.status(400).json({
      message: "No measurements found. Save customer measurements first."
    });
  }

  const transaction = db.transaction(() => {
    const result = db
      .prepare(
        `
        INSERT INTO orders (
          customer_id, garment_type, status, subtotal, discount_type, discount_value, total_amount, advance_paid, remaining_due, due_date, delivery_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        customerId,
        resolvedGarmentType,
        nextStatus,
        totals.subtotal,
        totals.discount_type,
        totals.discount_value,
        totals.final_total,
        Math.max(0, asNumber(advance_paid, 0)),
        Math.max(0, totals.final_total - Math.max(0, asNumber(advance_paid, 0))),
        asOptionalText(due_date),
        asOptionalText(delivery_date),
        asOptionalText(notes)
      );

    const orderId = Number(result.lastInsertRowid);

    const itemInsert = db.prepare(
      `
        INSERT INTO order_items (order_id, item_type, quantity, rate, line_total)
        VALUES (?, ?, ?, ?, ?)
      `
    );
    for (const item of normalizedItems) {
      itemInsert.run(orderId, item.item_type, item.quantity, item.rate, item.line_total);
    }

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
  const orderItems = db
    .prepare(
      `
        SELECT id, order_id, item_type, quantity, rate, line_total
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
      `
    )
    .all(orderId);
  return res.status(201).json({ ...order, items: orderItems });
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

  const nextTotalAmount = Math.max(0, asNumber(total_amount, existing.total_amount));
  const nextAdvancePaid = Math.max(0, asNumber(advance_paid, existing.advance_paid));
  if (nextStatus === "completed") {
    const additionalPayments = Math.max(0, getOrderPaidTotal(orderId) - Math.max(0, asNumber(existing.advance_paid, 0)));
    const paidTotal = nextAdvancePaid + additionalPayments;
    const due = Math.max(0, nextTotalAmount - paidTotal);
    if (due > 0.009) {
      return res.status(400).json({
        message: `Cannot mark order completed until pending due ${due.toFixed(2)} is settled`
      });
    }
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
      nextTotalAmount,
      nextAdvancePaid,
      due_date === "" ? null : due_date ?? existing.due_date,
      delivery_date === "" ? null : delivery_date ?? existing.delivery_date,
      notes === "" ? null : notes ?? existing.notes,
      orderId
    );

    recomputeOrderRemainingDue(orderId);

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

  recomputeOrderRemainingDue(orderId);

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
