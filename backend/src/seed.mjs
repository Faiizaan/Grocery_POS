import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: "admin@pos.com" },
    update: { password: hash, role: "ADMIN" },
    create: {
      email: "admin@pos.com",
      password: hash,
      role: "ADMIN",
    },
  });

  const managerHash = await bcrypt.hash("manager123", 10);
  await prisma.user.upsert({
    where: { email: "manager@pos.com" },
    update: { password: managerHash, role: "MANAGER" },
    create: {
      email: "manager@pos.com",
      password: managerHash,
      role: "MANAGER",
    },
  });

  const cashierHash = await bcrypt.hash("cashier123", 10);
  await prisma.user.upsert({
    where: { email: "cashier@pos.com" },
    update: { password: cashierHash, role: "CASHIER" },
    create: {
      email: "cashier@pos.com",
      password: cashierHash,
      role: "CASHIER",
    },
  });

  console.log("Seeded users:");
  console.log("  admin@pos.com   /", password, "(ADMIN)");
  console.log("  manager@pos.com / manager123 (MANAGER)");
  console.log("  cashier@pos.com / cashier123 (CASHIER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
