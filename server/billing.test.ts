import { describe, it, expect } from "vitest";
import { calculateStorageCost } from "./billing";

const GB = 1024 * 1024 * 1024;

describe("calculateStorageCost", () => {
  it("should return zero cost for zero usage", () => {
    const result = calculateStorageCost(0);
    expect(result.consumedGB).toBe(0);
    expect(result.freeGB).toBe(5);
    expect(result.billableGB).toBe(0);
    expect(result.costCents).toBe(0);
    expect(result.costDollars).toBe(0);
  });

  it("should return zero cost for usage under free tier (3GB)", () => {
    const result = calculateStorageCost(3 * GB);
    expect(result.consumedGB).toBe(3);
    expect(result.billableGB).toBe(0);
    expect(result.costCents).toBe(0);
    expect(result.costDollars).toBe(0);
  });

  it("should return zero cost for usage exactly at free tier (5GB)", () => {
    const result = calculateStorageCost(5 * GB);
    expect(result.consumedGB).toBe(5);
    expect(result.billableGB).toBe(0);
    expect(result.costCents).toBe(0);
    expect(result.costDollars).toBe(0);
  });

  it("should charge for usage over free tier (15GB = 10GB overage)", () => {
    const result = calculateStorageCost(15 * GB);
    expect(result.consumedGB).toBe(15);
    expect(result.freeGB).toBe(5);
    expect(result.billableGB).toBe(10);
    expect(result.costCents).toBe(100);
    expect(result.costDollars).toBe(1.0);
  });

  it("should round billable GB up (5GB + 1 byte = 1GB billable)", () => {
    const result = calculateStorageCost(5 * GB + 1);
    expect(result.billableGB).toBe(1);
    expect(result.costCents).toBe(10);
    expect(result.costDollars).toBe(0.1);
  });

  it("should handle large usage (100GB)", () => {
    const result = calculateStorageCost(100 * GB);
    expect(result.consumedGB).toBe(100);
    expect(result.billableGB).toBe(95);
    expect(result.costCents).toBe(950);
    expect(result.costDollars).toBe(9.5);
  });

  it("should handle 1GB usage (under free tier)", () => {
    const result = calculateStorageCost(1 * GB);
    expect(result.consumedGB).toBe(1);
    expect(result.billableGB).toBe(0);
    expect(result.costCents).toBe(0);
  });

  it("should handle fractional GB usage", () => {
    const halfGB = Math.floor(0.5 * GB);
    const result = calculateStorageCost(halfGB);
    expect(result.consumedGB).toBe(0.5);
    expect(result.billableGB).toBe(0);
    expect(result.costCents).toBe(0);
  });

  it("should charge $0.10 per GB overage", () => {
    const result = calculateStorageCost(6 * GB);
    expect(result.billableGB).toBe(1);
    expect(result.costCents).toBe(10);
    expect(result.costDollars).toBe(0.1);
  });

  it("should handle very large usage (1TB)", () => {
    const result = calculateStorageCost(1024 * GB);
    expect(result.consumedGB).toBe(1024);
    expect(result.billableGB).toBe(1019);
    expect(result.costCents).toBe(10190);
    expect(result.costDollars).toBe(101.9);
  });
});

describe("Billing constants", () => {
  it("free tier should be 5GB", () => {
    const freeTierResult = calculateStorageCost(5 * GB);
    expect(freeTierResult.freeGB).toBe(5);
    expect(freeTierResult.costCents).toBe(0);
  });

  it("cost per GB should be $0.10 (10 cents)", () => {
    const result = calculateStorageCost(6 * GB);
    expect(result.costCents).toBe(10);
  });
});
