import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { products } from "./modules/products/routes";
import { sales } from "./modules/sales/routes";
import { purchases } from "./modules/purchases/routes";
import { reports } from "./modules/reports/routes";
import { suppliers } from "./modules/suppliers/routes";
import { po } from "./modules/purchaseOrders/routes";
import { categories } from "./modules/categories/routes";
import { inventory } from "./modules/inventory/routes";
import salesSummary from "./modules/salesSummary/routes";
import salesAll from "./modules/salesAll/routes";
import productAnalyticsRoutes from "./modules/product_analytics/routes";
import { auth } from "./modules/auth/routes";
import { users } from "./modules/users/routes";
import { cashSessions } from "./modules/cashSessions/routes";
import { requireAuth, requireRole } from "./modules/auth/auth";
import { prisma } from "./db";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Public auth endpoints
app.use("/api/auth", auth);

const managerOnly = requireRole("MANAGER", "ADMIN");
const adminOnly = requireRole("ADMIN");

const api = express.Router();
api.use(requireAuth);

api.use("/products", products);
api.use("/sales", sales);
api.use("/cash-sessions", cashSessions);
api.use("/purchases", managerOnly, purchases);
api.use("/reports", managerOnly, reports);
api.use("/suppliers", managerOnly, suppliers);
api.use("/purchase-orders", managerOnly, po);
api.use("/categories", categories);
api.use("/inventory", managerOnly, inventory);
api.use("/sales-summary", managerOnly, salesSummary);
api.use("/sales-all", salesAll);
api.use("/product-analytics", managerOnly, productAnalyticsRoutes);
api.use("/users", adminOnly, users);

app.use("/api", api);

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API listening on port ${port}`);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  await prisma.$disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal).catch((err) => {
      console.error("Shutdown failed:", err);
      process.exit(1);
    });
  });
}
