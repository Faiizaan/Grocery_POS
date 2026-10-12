import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, signToken } from "./auth";

export const auth = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

auth.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password" });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

auth.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, role: true },
  });
  if (!user) return res.status(401).json({ error: "User not found" });
  res.json(user);
});
