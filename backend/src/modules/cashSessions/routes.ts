import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db";
import { notVoided } from "../../lib/saleFilters";

const D = Prisma.Decimal;

export async function computeSessionZReport(sessionId: number) {
  const session = await prisma.cashSession.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session) return null;

  const sales = await prisma.sale.findMany({
    where: { sessionId, ...notVoided },
    select: {
      total: true,
      subtotal: true,
      taxTotal: true,
      discountValue: true,
      paidCash: true,
      changeDue: true,
    },
  });

  let grossSales = new D(0);
  let subtotal = new D(0);
  let taxTotal = new D(0);
  let discountTotal = new D(0);
  let cashTendered = new D(0);
  let changeGiven = new D(0);

  for (const s of sales) {
    grossSales = grossSales.add(s.total);
    subtotal = subtotal.add(s.subtotal);
    taxTotal = taxTotal.add(s.taxTotal);
    discountTotal = discountTotal.add(s.discountValue);
    cashTendered = cashTendered.add(s.paidCash);
    changeGiven = changeGiven.add(s.changeDue);
  }

  const openingFloat = new D(session.openingFloat);
  const expectedCash = openingFloat.add(grossSales);
  const closingCash =
    session.closingCash != null ? new D(session.closingCash) : null;
  const variance =
    closingCash != null ? closingCash.sub(expectedCash) : null;

  const voidCount = await prisma.sale.count({
    where: { sessionId, voidedAt: { not: null } },
  });

  return {
    session: {
      id: session.id,
      userId: session.userId,
      userEmail: session.user.email,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingFloat: openingFloat.toFixed(2),
      closingCash: closingCash?.toFixed(2) ?? null,
      isOpen: session.closedAt == null,
    },
    saleCount: sales.length,
    voidCount,
    grossSales: grossSales.toFixed(2),
    subtotal: subtotal.toFixed(2),
    taxTotal: taxTotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    cashTendered: cashTendered.toFixed(2),
    changeGiven: changeGiven.toFixed(2),
    expectedCash: expectedCash.toFixed(2),
    variance: variance?.toFixed(2) ?? null,
  };
}

function canAccessSession(
  sessionUserId: number,
  requestUserId: number,
  role: string
) {
  return (
    sessionUserId === requestUserId ||
    role === "MANAGER" ||
    role === "ADMIN"
  );
}

export const cashSessions = Router();

/** GET /api/cash-sessions/current — open session for this user */
cashSessions.get("/current", async (req, res) => {
  const session = await prisma.cashSession.findFirst({
    where: { userId: req.user!.id, closedAt: null },
    orderBy: { openedAt: "desc" },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session) {
    return res.json({ session: null, zReport: null });
  }
  const zReport = await computeSessionZReport(session.id);
  res.json({ session, zReport });
});

/** GET /api/cash-sessions — recent sessions (own; managers see all) */
cashSessions.get("/", async (req, res) => {
  const isManager =
    req.user!.role === "MANAGER" || req.user!.role === "ADMIN";
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

  const rows = await prisma.cashSession.findMany({
    where: isManager ? undefined : { userId: req.user!.id },
    orderBy: { openedAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, email: true } } },
  });

  res.json({ rows });
});

/** POST /api/cash-sessions/open { openingFloat } */
cashSessions.post("/open", async (req, res) => {
  const schema = z.object({
    openingFloat: z.union([z.string(), z.number()]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "openingFloat is required" });
  }

  const openingFloat = new D(parsed.data.openingFloat);
  if (openingFloat.lt(0)) {
    return res.status(400).json({ error: "openingFloat cannot be negative" });
  }

  const existing = await prisma.cashSession.findFirst({
    where: { userId: req.user!.id, closedAt: null },
  });
  if (existing) {
    return res.status(400).json({
      error: "You already have an open cash session",
      sessionId: existing.id,
    });
  }

  const session = await prisma.cashSession.create({
    data: {
      userId: req.user!.id,
      openingFloat,
    },
    include: { user: { select: { id: true, email: true } } },
  });

  const zReport = await computeSessionZReport(session.id);
  res.status(201).json({ ok: true, session, zReport });
});

/** GET /api/cash-sessions/:id/z-report */
cashSessions.get("/:id/z-report", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  const session = await prisma.cashSession.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!canAccessSession(session.userId, req.user!.id, req.user!.role)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const zReport = await computeSessionZReport(id);
  res.json(zReport);
});

/** POST /api/cash-sessions/:id/close { closingCash } */
cashSessions.post("/:id/close", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  const schema = z.object({
    closingCash: z.union([z.string(), z.number()]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "closingCash is required" });
  }

  const closingCash = new D(parsed.data.closingCash);
  if (closingCash.lt(0)) {
    return res.status(400).json({ error: "closingCash cannot be negative" });
  }

  const session = await prisma.cashSession.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (!canAccessSession(session.userId, req.user!.id, req.user!.role)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  if (session.closedAt) {
    return res.status(400).json({ error: "Session is already closed" });
  }

  const updated = await prisma.cashSession.update({
    where: { id },
    data: { closedAt: new Date(), closingCash },
    include: { user: { select: { id: true, email: true } } },
  });

  const zReport = await computeSessionZReport(id);
  res.json({ ok: true, session: updated, zReport });
});
