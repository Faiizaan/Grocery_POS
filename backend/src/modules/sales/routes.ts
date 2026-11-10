import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { requireRole } from "../auth/auth";

const toDec = (v: unknown) =>
  new Prisma.Decimal(v as unknown as string | number | Prisma.Decimal);

export const sales = Router();

/** Arbitrary constant used as the Postgres advisory-lock key for invoice numbering. */
const INVOICE_LOCK_KEY = 7_204_311;

class PriceChangedError extends Error {
  constructor(
    public changes: {
      productId: number;
      name: string;
      oldPrice: string;
      salePrice: string;
      taxRate: string;
      stock: string;
    }[]
  ) {
    super("Price changed");
  }
}

/**
 * POST /api/sales
 * {
 *   items: [{ productId, quantity, discountValue? }],
 *   sessionId?, paidCash
 * }
 */
sales.post("/", async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "No items provided" });

    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: "User not found" });

    let sessionId: number | null =
      req.body?.sessionId != null ? Number(req.body.sessionId) : null;
    if (sessionId != null && Number.isNaN(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    const sale = await prisma.$transaction(async (tx) => {
      if (sessionId == null) {
        const openSession = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
          orderBy: { openedAt: "desc" },
        });
        if (openSession) sessionId = openSession.id;
      } else {
        const session = await tx.cashSession.findUnique({
          where: { id: sessionId },
        });
        if (!session || session.closedAt) {
          throw new Error("Cash session is not open");
        }
        if (session.userId !== userId) {
          throw new Error("Cash session belongs to another user");
        }
      }

      const ids = items.map((i: { productId: unknown }) => Number(i.productId));
      const products = await tx.product.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          price: true,
          salePrice: true,
          taxRate: true,
          stock: true,
          deletedAt: true,
          categoryId: true,
        },
      });
      const map = new Map(products.map((p) => [p.id, p]));

      // If the cart was built with an old price/name (product edited after it was added
      // or while the search result was cached), refuse and send back current values so
      // the register can refresh instead of silently charging a different amount.
      const priceChanges: {
        productId: number;
        name: string;
        oldPrice: string;
        salePrice: string;
        taxRate: string;
        stock: string;
      }[] = [];
      for (const r of items) {
        const p = map.get(Number(r.productId));
        if (!p || r.unitPrice === undefined || r.unitPrice === null || r.unitPrice === "") continue;
        const sent = new Prisma.Decimal(r.unitPrice);
        if (!sent.equals(p.salePrice)) {
          priceChanges.push({
            productId: p.id,
            name: p.name,
            oldPrice: sent.toFixed(2),
            salePrice: new Prisma.Decimal(p.salePrice).toFixed(2),
            taxRate: new Prisma.Decimal(p.taxRate).toString(),
            stock: new Prisma.Decimal(p.stock).toString(),
          });
        }
      }
      if (priceChanges.length) {
        throw new PriceChangedError(priceChanges);
      }

      type Raw = {
        productId: number;
        qty: Prisma.Decimal;
        unit: Prisma.Decimal;
        taxRate: Prisma.Decimal;
        lineDiscount: Prisma.Decimal;
        net: Prisma.Decimal;
        unitCostAtSale: Prisma.Decimal;
        productName: string;
        categoryId: number | null;
      };
      const raw: Raw[] = [];
      let totalLineDiscount = new Prisma.Decimal(0);

      for (const r of items) {
        const productId = Number(r.productId);
        const p = map.get(productId);
        if (!p) throw new Error(`Product ${productId} not found`);
        if (p.deletedAt) throw new Error(`Product "${p.name}" has been deleted`);
        const qty = new Prisma.Decimal(r.quantity ?? 0);
        if (qty.lte(0)) throw new Error(`Invalid qty for product ${productId}`);
        if (new Prisma.Decimal(p.stock).lt(qty)) {
          const label = p.name || `ID ${productId}`;
          throw new Error(`Product "${label}" is out of stock`);
        }
        const unit = new Prisma.Decimal(p.salePrice);
        const gross = unit.mul(qty);
        let lineDisc = new Prisma.Decimal(0);
        if (r.discountValue !== undefined && r.discountValue !== "") {
          lineDisc = new Prisma.Decimal(r.discountValue);
          if (lineDisc.lt(0)) throw new Error("Line discount cannot be negative");
          if (lineDisc.gt(gross)) lineDisc = gross;
        }
        totalLineDiscount = totalLineDiscount.add(lineDisc);
        const net = gross.sub(lineDisc);
        raw.push({
          productId,
          qty,
          unit,
          taxRate: new Prisma.Decimal(p.taxRate),
          lineDiscount: lineDisc,
          net,
          unitCostAtSale: new Prisma.Decimal(p.price),
          productName: p.name,
          categoryId: p.categoryId,
        });
      }

      let subtotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      const saleItemsData: Prisma.SaleItemCreateManySaleInput[] = [];

      for (const r of raw) {
        const lineTax = r.net.mul(r.taxRate).div(100);
        const lineGross = r.net.add(lineTax);

        subtotal = subtotal.add(r.net);
        taxTotal = taxTotal.add(lineTax);

        saleItemsData.push({
          productId: r.productId,
          qty: r.qty,
          unitPrice: r.unit,
          taxRate: r.taxRate,
          lineDiscount: r.lineDiscount,
          lineTotal: lineGross,
          unitCostAtSale: r.unitCostAtSale,
          productName: r.productName,
          categoryId: r.categoryId,
          costTotal: r.unitCostAtSale.mul(r.qty),
        });
      }
      const total = subtotal.add(taxTotal);

      if (req.body?.paidCash === undefined || req.body.paidCash === "") {
        throw new Error("paidCash is required");
      }
      const paidCash = new Prisma.Decimal(req.body.paidCash);
      if (paidCash.lt(0)) throw new Error("paidCash cannot be negative");
      if (paidCash.lt(total)) {
        throw new Error("Cash tendered is less than the total due");
      }
      const changeDue = paidCash.sub(total);

      const today = new Date();

      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      const prefix = `SL-${y}${m}${d}-`;

      // Two tills saving at the same moment used to get the same number (count + 1) and one
      // sale failed. Lock invoice numbering for the rest of this transaction so saves take
      // turns, and continue from the highest number used today (not a count, which also
      // breaks if a row is ever removed).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INVOICE_LOCK_KEY})`;
      const lastToday = await tx.sale.findFirst({
        where: { invoiceCode: { startsWith: prefix } },
        orderBy: { invoiceCode: "desc" },
        select: { invoiceCode: true },
      });
      const lastSeq = lastToday?.invoiceCode
        ? Number(lastToday.invoiceCode.slice(prefix.length)) || 0
        : 0;
      const invoiceCode = `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;

      const discountPercent =
        subtotal.add(totalLineDiscount).gt(0) && totalLineDiscount.gt(0)
          ? totalLineDiscount
              .mul(100)
              .div(subtotal.add(totalLineDiscount))
          : new Prisma.Decimal(0);

      const createdSale = await tx.sale.create({
        data: {
          userId,
          sessionId: sessionId ?? undefined,
          invoiceCode,
          discountPercent,
          discountValue: totalLineDiscount,
          subtotal,
          taxTotal,
          total,
          paidCash,
          paidCard: new Prisma.Decimal(0),
          changeDue,
          items: { createMany: { data: saleItemsData } },
        },
        include: { items: true },
      });

      for (const s of saleItemsData) {
        await tx.product.update({
          where: { id: s.productId },
          data: { stock: { decrement: s.qty } },
        });
        await tx.inventoryTxn.create({
          data: {
            productId: s.productId,
            qtyChange: toDec(s.qty).mul(-1),
            reason: `SALE #${createdSale.id}`,
          },
        });
      }
      return createdSale;
    });

    res.json({ ok: true, sale });
  } catch (e: unknown) {
    if (e instanceof PriceChangedError) {
      const names = e.changes
        .map((c) => `${c.name}: Rs ${c.oldPrice} → Rs ${c.salePrice}`)
        .join(", ");
      return res.status(409).json({
        error: `Price changed since the item was added (${names}). Cart updated — please check the total and try again.`,
        priceChanges: e.changes,
      });
    }
    const msg = e instanceof Error ? e.message : "Failed to save sale";
    console.error(e);
    res.status(400).json({ error: msg });
  }
});

sales.post("/:id/void", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid sale ID" });

    const confirmPassword =
      typeof req.body?.confirmPassword === "string"
        ? req.body.confirmPassword
        : "";
    if (!confirmPassword) {
      return res.status(400).json({ error: "Manager password confirmation is required" });
    }
    const actor = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!actor?.password) {
      return res.status(401).json({ error: "User not found" });
    }
    const passwordOk = await bcrypt.compare(confirmPassword, actor.password);
    if (!passwordOk) {
      return res.status(403).json({ error: "Incorrect password" });
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) return res.status(404).json({ error: "Sale not found" });
    if (sale.voidedAt) return res.status(400).json({ error: "Sale is already voided" });

    const voidedById = req.user!.id;
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.qty } },
        });
        await tx.inventoryTxn.create({
          data: {
            productId: item.productId,
            qtyChange: item.qty,
            reason: `VOID SALE #${sale.id}`,
          },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { voidedAt: new Date(), voidedById },
        include: {
          voidedBy: { select: { id: true, email: true } },
        },
      });
    });

    res.json({ ok: true, sale: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to void sale";
    console.error(e);
    res.status(500).json({ error: msg });
  }
});

sales.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid sale ID" });

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true } },
        voidedBy: { select: { id: true, email: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                barcode: true,
                categoryRef: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!sale) return res.status(404).json({ error: "Sale not found" });
    res.json(sale);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to load sale invoice";
    console.error(e);
    res.status(500).json({ error: msg });
  }
});
