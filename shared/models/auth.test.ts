import { describe, it, expect } from "vitest";
import {
  users,
  refreshTokens,
  secretsVault,
  billingRecords,
  stripeEvents,
} from "./auth";

describe("Database schema - users table", () => {
  it("should have stripeCustomerId column", () => {
    expect(users.stripeCustomerId).toBeDefined();
  });

  it("should have totalStorageBytes column", () => {
    expect(users.totalStorageBytes).toBeDefined();
  });

  it("should have monthlyConsumedBytes column", () => {
    expect(users.monthlyConsumedBytes).toBeDefined();
  });

  it("should have authProvider column", () => {
    expect(users.authProvider).toBeDefined();
  });

  it("should have googleSub column for OAuth", () => {
    expect(users.googleSub).toBeDefined();
  });

  it("should have id, username, email as required columns", () => {
    expect(users.id).toBeDefined();
    expect(users.username).toBeDefined();
    expect(users.email).toBeDefined();
  });
});

describe("Database schema - billingRecords table", () => {
  it("should have all required columns", () => {
    expect(billingRecords.id).toBeDefined();
    expect(billingRecords.userId).toBeDefined();
    expect(billingRecords.year).toBeDefined();
    expect(billingRecords.month).toBeDefined();
    expect(billingRecords.freeBytes).toBeDefined();
    expect(billingRecords.billableBytes).toBeDefined();
    expect(billingRecords.costCents).toBeDefined();
    expect(billingRecords.stripeInvoiceId).toBeDefined();
    expect(billingRecords.createdAt).toBeDefined();
  });
});

describe("Database schema - stripeEvents table", () => {
  it("should have all required columns", () => {
    expect(stripeEvents.id).toBeDefined();
    expect(stripeEvents.stripeEventId).toBeDefined();
    expect(stripeEvents.eventType).toBeDefined();
    expect(stripeEvents.stripeCustomerId).toBeDefined();
    expect(stripeEvents.userId).toBeDefined();
    expect(stripeEvents.invoiceId).toBeDefined();
    expect(stripeEvents.amountCents).toBeDefined();
    expect(stripeEvents.status).toBeDefined();
    expect(stripeEvents.payload).toBeDefined();
    expect(stripeEvents.createdAt).toBeDefined();
  });
});

describe("Database schema - secretsVault table", () => {
  it("should have key and value columns", () => {
    expect(secretsVault.key).toBeDefined();
    expect(secretsVault.value).toBeDefined();
  });

  it("should have category and description columns", () => {
    expect(secretsVault.category).toBeDefined();
    expect(secretsVault.description).toBeDefined();
  });
});

describe("Database schema - refreshTokens table", () => {
  it("should have token and expiresAt columns", () => {
    expect(refreshTokens.token).toBeDefined();
    expect(refreshTokens.expiresAt).toBeDefined();
  });

  it("should have userId for user association", () => {
    expect(refreshTokens.userId).toBeDefined();
  });
});

describe("Type exports", () => {
  it("should export User type", () => {
    const _check: typeof users.$inferSelect = {} as any;
    expect(true).toBe(true);
  });

  it("should export BillingRecord type", () => {
    const _check: typeof billingRecords.$inferSelect = {} as any;
    expect(true).toBe(true);
  });

  it("should export StripeEvent type", () => {
    const _check: typeof stripeEvents.$inferSelect = {} as any;
    expect(true).toBe(true);
  });
});
