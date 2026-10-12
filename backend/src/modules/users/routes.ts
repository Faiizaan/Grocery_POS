import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db";
import { requireRole } from "../auth/auth";

export const users = Router();

const adminOnly = requireRole("ADMIN");

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["CASHIER", "MANAGER", "ADMIN"]),
});

users.get("/", adminOnly, async (_req, res) => {
  const list = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });
  res.json(list);
});

users.post("/", adminOnly, async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.format() });
  }

  const { email, password, role } = parsed.data;
  const hash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email: email.toLowerCase().trim(), password: hash, role },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error(e);
    res.status(500).json({ error: "Failed to create user" });
  }
});
