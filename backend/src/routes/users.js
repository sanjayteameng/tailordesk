const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", (_req, res) => {
  const users = db
    .prepare("SELECT id, name, email, mobile, role, created_at FROM users ORDER BY created_at DESC")
    .all();
  return res.json(users);
});

router.post("/", (req, res) => {
  const { name, email, mobile, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "name, email, password, role are required" });
  }

  if (!["admin", "user"].includes(role)) {
    return res.status(400).json({ message: "role must be admin or user" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (name, email, mobile, password_hash, role) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, mobile || null, hash, role);

  return res.status(201).json({ id: result.lastInsertRowid, name, email, mobile: mobile || null, role });
});

router.put("/:id", (req, res) => {
  const userId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!existing) {
    return res.status(404).json({ message: "User not found" });
  }

  if (Number(req.user.id) === userId && req.body.role && req.body.role !== existing.role) {
    return res.status(400).json({ message: "You cannot change your own role" });
  }

  const nextName = req.body.name === undefined ? existing.name : String(req.body.name).trim();
  const nextEmail = req.body.email === undefined ? existing.email : String(req.body.email).trim();
  const nextMobile =
    req.body.mobile === undefined ? existing.mobile : req.body.mobile === "" ? null : String(req.body.mobile).trim();
  const nextRole = req.body.role === undefined ? existing.role : req.body.role;

  if (!nextName || !nextEmail) {
    return res.status(400).json({ message: "name and email are required" });
  }
  if (!["admin", "user"].includes(nextRole)) {
    return res.status(400).json({ message: "role must be admin or user" });
  }

  const emailOwner = db.prepare("SELECT id FROM users WHERE email = ?").get(nextEmail);
  if (emailOwner && Number(emailOwner.id) !== userId) {
    return res.status(409).json({ message: "Email already in use" });
  }

  const nextPasswordHash =
    req.body.password && String(req.body.password).trim()
      ? bcrypt.hashSync(String(req.body.password), 10)
      : existing.password_hash;

  db.prepare(
    `
      UPDATE users
      SET name = ?, email = ?, mobile = ?, role = ?, password_hash = ?
      WHERE id = ?
    `
  ).run(nextName, nextEmail, nextMobile, nextRole, nextPasswordHash, userId);

  const updated = db
    .prepare("SELECT id, name, email, mobile, role, created_at FROM users WHERE id = ?")
    .get(userId);
  return res.json(updated);
});

router.delete("/:id", (req, res) => {
  const userId = Number(req.params.id);
  const existing = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!existing) {
    return res.status(404).json({ message: "User not found" });
  }
  if (Number(req.user.id) === userId) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return res.status(204).send();
});

module.exports = router;
