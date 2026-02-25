const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", (_req, res) => {
  const users = db
    .prepare("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC")
    .all();
  return res.json(users);
});

router.post("/", (req, res) => {
  const { name, email, password, role } = req.body;
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
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(name, email, hash, role);

  return res.status(201).json({ id: result.lastInsertRowid, name, email, role });
});

module.exports = router;
