const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { authenticateToken, signToken } = require("../middleware/auth");

const router = express.Router();

router.get("/setup-status", (_req, res) => {
  const row = db.prepare("SELECT COUNT(1) AS count FROM users").get();
  return res.json({ needs_setup: Number(row?.count || 0) === 0 });
});

router.post("/setup-admin", (req, res) => {
  const row = db.prepare("SELECT COUNT(1) AS count FROM users").get();
  if (Number(row?.count || 0) > 0) {
    return res.status(409).json({ message: "Initial setup is already completed" });
  }

  const { name, email, mobile, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "name, email, and password are required" });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const result = db
    .prepare("INSERT INTO users (name, email, mobile, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
    .run(String(name).trim(), String(email).trim(), mobile ? String(mobile).trim() : null, passwordHash);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = signToken(user);
  return res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.role }
  });
});

router.post("/login", (req, res) => {
  const { email, mobile, identifier, password } = req.body;
  const loginId = String(identifier ?? email ?? mobile ?? "").trim();
  if (!loginId || !password) {
    return res.status(400).json({ message: "Email/mobile and password are required" });
  }

  const user = db
    .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR mobile = ?")
    .get(loginId, loginId);
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.role }
  });
});

router.get("/me", authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

router.put("/credentials", authenticateToken, (req, res) => {
  const userId = Number(req.user.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!existing) {
    return res.status(404).json({ message: "User not found" });
  }

  const { name, email, mobile, current_password, new_password } = req.body;
  if (!name || !email || !current_password) {
    return res.status(400).json({ message: "name, email, and current_password are required" });
  }

  const isMatch = bcrypt.compareSync(String(current_password), existing.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }

  const normalizedEmail = String(email).trim();
  const emailOwner = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (emailOwner && Number(emailOwner.id) !== userId) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const passwordHash =
    new_password && String(new_password).trim().length > 0
      ? bcrypt.hashSync(String(new_password), 10)
      : existing.password_hash;

  db.prepare(
    `
      UPDATE users
      SET name = ?, email = ?, mobile = ?, password_hash = ?
      WHERE id = ?
    `
  ).run(
    String(name).trim(),
    normalizedEmail,
    mobile === "" || mobile === undefined ? null : String(mobile).trim(),
    passwordHash,
    userId
  );

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const token = signToken(updated);
  return res.json({
    token,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      mobile: updated.mobile,
      role: updated.role
    }
  });
});

module.exports = router;
