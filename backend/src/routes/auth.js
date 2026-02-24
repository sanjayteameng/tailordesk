const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { authenticateToken, signToken } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
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
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

router.get("/me", authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
