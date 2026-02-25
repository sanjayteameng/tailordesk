require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { initDb } = require("./db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const customerRoutes = require("./routes/customers");
const orderRoutes = require("./routes/orders");

const app = express();
const port = Number(process.env.PORT || 4000);

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is required. Configure it in backend/.env");
  process.exit(1);
}

initDb();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173"
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "tailordesk-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`TailorDesk backend running on http://localhost:${port}`);
});
