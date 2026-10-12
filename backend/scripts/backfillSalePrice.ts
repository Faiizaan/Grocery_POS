import { prisma } from "../src/db";

async function main() {
    const products = await prisma.product.findMany({
        where: { salePrice: null },
        select: { id: true, price: true },
    });

    if (products.length === 0) {
        console.log("No products to backfill.");
        return;
    }

    for (const p of products) {
        await prisma.product.update({
            where: { id: p.id },
            data: { salePrice: p.price }, // copy purchase price -> sale price
        });
    }

    console.log(`Backfilled ${products.length} products.`);
}

main().finally(() => prisma.$disconnect());
