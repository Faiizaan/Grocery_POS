import { Router } from "express";
import { prisma } from "../../db";
import { z } from "zod";
import { requireRole } from "../auth/auth";

export const categories = Router();

categories.get("/", async (_req, res) => {
  const list = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

// GET /api/categories/:id — category detail + paginated products
categories.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const skip = (page - 1) * limit;
  const q = String(req.query.q || "").trim();

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return res.status(404).json({ error: "Category not found" });

  const where = {
    categoryId: id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { sku: q },
            { barcode: q },
          ],
        }
      : {}),
  };

  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
      include: { categoryRef: { select: { id: true, name: true } } },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({
    category,
    page,
    limit,
    totalCount,
    products,
  });
});

categories.post("/", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());

  const name = parsed.data.name.trim().toUpperCase();
  if (!name) return res.status(400).json({ error: "Category name is required" });

  try {
    const existing = await prisma.category.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });

    if (existing) return res.status(200).json(existing);

    const created = await prisma.category.create({ data: { name } });
    return res.status(201).json(created);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      const existing = await prisma.category.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
      });
      if (existing) return res.status(200).json(existing);
      return res.status(409).json({ error: "Category already exists" });
    }
    return res.status(500).json({ error: "Failed to create category" });
  }
});

export default categories;
