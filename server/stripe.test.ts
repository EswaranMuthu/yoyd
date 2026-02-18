import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCustomersCreate = vi.fn().mockResolvedValue({ id: "cus_test123" });
const mockCustomersUpdate = vi.fn().mockResolvedValue({});
const mockSessionsCreate = vi.fn().mockResolvedValue({ id: "cs_test123", url: "https://checkout.stripe.com/test" });
const mockPaymentMethodsList = vi.fn().mockResolvedValue({ data: [{ id: "pm_test123" }] });
const mockInvoicesCreate = vi.fn().mockResolvedValue({ id: "inv_test123" });
const mockInvoicesFinalize = vi.fn().mockResolvedValue({ id: "inv_test123" });
const mockInvoicesPay = vi.fn().mockResolvedValue({ id: "inv_test123", status: "paid" });
const mockInvoiceItemsCreate = vi.fn().mockResolvedValue({ id: "ii_test123" });
const mockConstructEvent = vi.fn().mockReturnValue({ id: "evt_test123", type: "invoice.paid", data: { object: {} } });

vi.mock("stripe", () => {
  function MockStripe() {
    return {
      customers: { create: mockCustomersCreate, update: mockCustomersUpdate },
      checkout: { sessions: { create: mockSessionsCreate } },
      paymentMethods: { list: mockPaymentMethodsList },
      invoices: { create: mockInvoicesCreate, finalizeInvoice: mockInvoicesFinalize, pay: mockInvoicesPay },
      invoiceItems: { create: mockInvoiceItemsCreate },
      webhooks: { constructEvent: mockConstructEvent },
    };
  }
  return { default: MockStripe };
});

vi.mock("./logger", () => ({
  logger: { routes: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } },
}));

const mockGetSecret = vi.fn();
vi.mock("./vault", () => ({
  getSecret: (...args: any[]) => mockGetSecret(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSecret.mockImplementation(async (key: string) => {
    if (key === "STRIPE_SECRET_KEY") return "sk_test_vault_key";
    if (key === "STRIPE_WEBHOOK_SECRET") return "whsec_test_vault";
    return undefined;
  });
});

describe("Stripe vault integration - behavioral tests", () => {
  it("createStripeCustomer should call vault for STRIPE_SECRET_KEY", async () => {
    const { createStripeCustomer } = await import("./stripe");
    const result = await createStripeCustomer("user@example.com", "testuser");

    expect(mockGetSecret).toHaveBeenCalledWith("STRIPE_SECRET_KEY");
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: "user@example.com",
      metadata: { username: "testuser" },
    });
    expect(result).toBe("cus_test123");
  });

  it("createStripeCustomer should throw if STRIPE_SECRET_KEY missing from vault", async () => {
    mockGetSecret.mockResolvedValue(undefined);

    vi.resetModules();
    const { createStripeCustomer } = await import("./stripe");
    await expect(createStripeCustomer("user@example.com", "testuser"))
      .rejects.toThrow("STRIPE_SECRET_KEY not found in secrets vault");
  });

  it("createCheckoutSession should create setup-mode session", async () => {
    const { createCheckoutSession } = await import("./stripe");
    const result = await createCheckoutSession("cus_abc", "https://success.com", "https://cancel.com");

    expect(mockSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_abc",
      mode: "setup",
      payment_method_types: ["card"],
      success_url: "https://success.com",
      cancel_url: "https://cancel.com",
    });
    expect(result).toEqual({ sessionId: "cs_test123", url: "https://checkout.stripe.com/test" });
  });

  it("hasPaymentMethod should return true when card exists", async () => {
    const { hasPaymentMethod } = await import("./stripe");
    const result = await hasPaymentMethod("cus_abc");

    expect(mockPaymentMethodsList).toHaveBeenCalledWith({
      customer: "cus_abc",
      type: "card",
      limit: 1,
    });
    expect(result).toBe(true);
  });

  it("hasPaymentMethod should return false when no cards", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({ data: [] });

    const { hasPaymentMethod } = await import("./stripe");
    const result = await hasPaymentMethod("cus_nocard");
    expect(result).toBe(false);
  });

  it("setDefaultPaymentMethod should update customer when card exists", async () => {
    const { setDefaultPaymentMethod } = await import("./stripe");
    await setDefaultPaymentMethod("cus_abc");

    expect(mockCustomersUpdate).toHaveBeenCalledWith("cus_abc", {
      invoice_settings: { default_payment_method: "pm_test123" },
    });
  });

  it("setDefaultPaymentMethod should not update when no cards", async () => {
    mockPaymentMethodsList.mockResolvedValueOnce({ data: [] });

    const { setDefaultPaymentMethod } = await import("./stripe");
    await setDefaultPaymentMethod("cus_nocard");

    expect(mockCustomersUpdate).not.toHaveBeenCalled();
  });

  it("createInvoiceForUsage should create invoice, add item, finalize, and pay", async () => {
    const { createInvoiceForUsage } = await import("./stripe");
    const result = await createInvoiceForUsage("cus_abc", 100, 2026, 2);

    expect(mockInvoicesCreate).toHaveBeenCalledWith({
      customer: "cus_abc",
      auto_advance: true,
      collection_method: "charge_automatically",
      metadata: { year: "2026", month: "2" },
    });
    expect(mockInvoiceItemsCreate).toHaveBeenCalledWith({
      customer: "cus_abc",
      invoice: "inv_test123",
      amount: 100,
      currency: "usd",
      description: "yoyd storage usage - 2026/02",
    });
    expect(mockInvoicesFinalize).toHaveBeenCalledWith("inv_test123");
    expect(mockInvoicesPay).toHaveBeenCalledWith("inv_test123");
    expect(result).toBe("inv_test123");
  });

  it("constructWebhookEvent should load STRIPE_WEBHOOK_SECRET from vault", async () => {
    const { constructWebhookEvent } = await import("./stripe");
    const event = await constructWebhookEvent(Buffer.from("payload"), "sig_header");

    expect(mockGetSecret).toHaveBeenCalledWith("STRIPE_WEBHOOK_SECRET");
    expect(mockConstructEvent).toHaveBeenCalledWith(Buffer.from("payload"), "sig_header", "whsec_test_vault");
    expect(event.id).toBe("evt_test123");
  });

  it("constructWebhookEvent should throw if STRIPE_WEBHOOK_SECRET missing", async () => {
    mockGetSecret.mockImplementation(async (key: string) => {
      if (key === "STRIPE_SECRET_KEY") return "sk_test_vault_key";
      return undefined;
    });

    vi.resetModules();
    const { constructWebhookEvent } = await import("./stripe");
    await expect(constructWebhookEvent(Buffer.from("payload"), "sig_header"))
      .rejects.toThrow("STRIPE_WEBHOOK_SECRET not found in secrets vault");
  });
});

describe("Stripe source code validation", () => {
  it("should not reference process.env for any Stripe keys", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/stripe.ts", "utf-8");
    expect(source).not.toContain("process.env.STRIPE_SECRET_KEY");
    expect(source).not.toContain("process.env.STRIPE_WEBHOOK_SECRET");
  });

  it("should import getSecret from vault", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/stripe.ts", "utf-8");
    expect(source).toContain('import { getSecret } from "./vault"');
  });

  it("should export all 6 required functions", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/stripe.ts", "utf-8");
    const expectedExports = [
      "createStripeCustomer",
      "createCheckoutSession",
      "hasPaymentMethod",
      "setDefaultPaymentMethod",
      "createInvoiceForUsage",
      "constructWebhookEvent",
    ];
    for (const fn of expectedExports) {
      expect(source).toContain(`export async function ${fn}`);
    }
  });

  it("should use lazy initialization for Stripe client", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/stripe.ts", "utf-8");
    expect(source).toContain("let stripeClient: Stripe | null = null");
  });
});
