const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const COST_PER_GB_CENTS = 10; // $0.10 per GB

export function calculateStorageCost(maxStorageBytes: number): {
  maxStorageGB: number;
  freeGB: number;
  billableGB: number;
  costCents: number;
  costDollars: number;
} {
  const maxStorageGB = maxStorageBytes / (1024 * 1024 * 1024);
  const freeGB = FREE_TIER_BYTES / (1024 * 1024 * 1024);
  const billableBytes = Math.max(0, maxStorageBytes - FREE_TIER_BYTES);
  const billableGB = Math.ceil(billableBytes / (1024 * 1024 * 1024));
  const costCents = billableGB * COST_PER_GB_CENTS;
  const costDollars = costCents / 100;

  return {
    maxStorageGB: Math.round(maxStorageGB * 100) / 100,
    freeGB,
    billableGB,
    costCents,
    costDollars,
  };
}
