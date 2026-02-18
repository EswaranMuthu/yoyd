import { db } from "./db";
import { users, billingRecords } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const COST_PER_GB_CENTS = 10; // $0.10 per GB

export function calculateStorageCost(monthlyConsumedBytes: number): {
  consumedGB: number;
  freeGB: number;
  billableGB: number;
  costCents: number;
  costDollars: number;
} {
  const consumedGB = monthlyConsumedBytes / (1024 * 1024 * 1024);
  const freeGB = FREE_TIER_BYTES / (1024 * 1024 * 1024);
  const billableBytes = Math.max(0, monthlyConsumedBytes - FREE_TIER_BYTES);
  const billableGB = Math.ceil(billableBytes / (1024 * 1024 * 1024));
  const costCents = billableGB * COST_PER_GB_CENTS;
  const costDollars = costCents / 100;

  return {
    consumedGB: Math.round(consumedGB * 100) / 100,
    freeGB,
    billableGB,
    costCents,
    costDollars,
  };
}

export async function runMonthlyBilling(year: number, month: number): Promise<{
  processed: number;
  skipped: number;
  totalCostCents: number;
}> {
  const allUsers = await db.select({
    id: users.id,
    username: users.username,
    monthlyConsumedBytes: users.monthlyConsumedBytes,
  }).from(users);

  let processed = 0;
  let skipped = 0;
  let totalCostCents = 0;

  for (const user of allUsers) {
    const existing = await db.select({ id: billingRecords.id })
      .from(billingRecords)
      .where(and(
        eq(billingRecords.userId, user.id),
        eq(billingRecords.year, year),
        eq(billingRecords.month, month),
      ))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      logger.routes.debug("Billing record already exists, skipping", { user: user.username, year, month });
      continue;
    }

    const consumed = user.monthlyConsumedBytes ?? 0;
    const billing = calculateStorageCost(consumed);

    await db.transaction(async (tx) => {
      await tx.insert(billingRecords).values({
        userId: user.id,
        year,
        month,
        consumedBytes: consumed,
        freeBytes: Math.min(consumed, FREE_TIER_BYTES),
        billableBytes: Math.max(0, consumed - FREE_TIER_BYTES),
        costCents: billing.costCents,
      });

      await tx.update(users)
        .set({ monthlyConsumedBytes: 0, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    });

    totalCostCents += billing.costCents;
    processed++;

    logger.routes.debug("Billing record created", {
      user: user.username,
      year,
      month,
      consumedGB: billing.consumedGB,
      costCents: billing.costCents,
    });
  }

  logger.routes.info("Monthly billing completed", { year, month, processed, skipped, totalCostCents });
  return { processed, skipped, totalCostCents };
}
