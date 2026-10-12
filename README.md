# Grocery POS — Full-stack TypeScript point-of-sale system

A point-of-sale system I designed and built for an independent grocery store, where it runs in production for day-to-day trading.
Store details in this repository are replaced with demo values, and no real sales data is included.

**Stack:** React 18 · TypeScript · Vite · Zustand · React Query · Zod · Node.js · Express · Prisma · PostgreSQL · JWT · Docker · nginx

**Highlights**
- Register / checkout with USB and camera barcode scanning (ZXing)
- Role-based access (cashier, manager, admin) with JWT authentication
- Inventory, suppliers, purchasing, cash sessions (Z-report) and sales reporting with CSV export
- Manager password confirmation for voids, with stock automatically restored
- Containerised with Docker Compose; schema managed with Prisma migrations

---

A minimal full‑stack POS starter for a grocery store.
- Backend: Node.js (Express), Prisma, PostgreSQL
- Frontend: React (Vite), Zustand, simple barcode input (USB/camera via ZXing)

## Quick Start (local dev)

1. **Run Postgres** (Docker recommended):
   ```bash
   docker run --name posdb -e POSTGRES_PASSWORD=pospass -e POSTGRES_DB=posdb -p 5432:5432 -d postgres:16
   ```
2. **Backend**
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev --name init
   npm run seed
   npm run dev
   ```
   API on http://localhost:4000

3. **Frontend**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```
   Web on http://localhost:5173 (proxy to API is already set).

## Barcode Scanning
- USB scanners (keyboard wedge): Focus browser window, scan → it types code + Enter.
- Camera: Toggle "Use Camera" in the Register page (ZXing).

## Seeded Demo Products
- Bananas (barcode 100000000001), Milk 1L (100000000002), Bread (100000000003), Eggs (100000000004), Rice 5kg (100000000005), Oil 1L (100000000006), Apples 1kg (100000000007).

## Authentication

All `/api/*` routes (except `POST /api/auth/login`) require a JWT `Authorization: Bearer <token>` header.

After `npm run seed`, sign in with:

| Email | Password | Role |
|-------|----------|------|
| admin@pos.com | admin123 (or `SEED_ADMIN_PASSWORD`) | ADMIN |
| manager@pos.com | manager123 | MANAGER |
| cashier@pos.com | cashier123 | CASHIER |

- **CASHIER**: checkout, sales list, invoices, cash session (open/close own shift)
- **MANAGER / ADMIN**: purchases, inventory, products, suppliers, reports, user admin (admin only)

Sales are recorded under the logged-in user.

## Implemented features

| Area | Status |
|------|--------|
| JWT auth & roles | Done |
| Checkout with barcode (USB + camera on Register) | Done |
| Stock validation | Backend on save; checkout UI warns and blocks when qty exceeds stock or item is out of stock |
| Product categories | `categoryId` + `Category` table only (legacy `Product.category` string removed — run latest migration) |
| Void sales | Managers/admins void from Sales List or invoice; **password re-entry required**; stock restored |
| Cash sessions & Z-report | Done (`/cash-session`) |
| Category & sales summary reports | Done; **Export CSV** on report screens |
| Suppliers | API + UI at `/suppliers` |
| Low-stock highlights | Products & Inventory rows at ≤ 5 units (configurable in `frontend/src/lib/stock.ts`) |
| User admin | Admins at `/users` |

## Roadmap (not yet built)

- **Thermal printing**: browser print on invoices today; ESC/POS service later
- **Partial refunds**: full void only today (restores all line stock)
- **Dedicated manager PIN**: void uses account password confirmation; optional short PIN could be added
- **PDF exports**: CSV export exists; PDF generation not implemented
- **Category CRUD UI**: create via Register inline; no edit/delete category screen yet

## Production Notes

- Change `JWT_SECRET` and seed passwords before deploying.
- After pulling schema changes: `npx prisma migrate deploy` (or `migrate dev` locally).
- Thermal receipts: use browser print on `/sales/:id?print=1` until ESC/POS is added.

## Run with Docker

```bash
cp .env.example .env          # set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed
```

The app is then available on http://localhost (API on port 4000).
