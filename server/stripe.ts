import Stripe from "stripe";
import { logger } from "./logger";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    stripeClient = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
  }
  return stripeClient;
}

export async function createStripeCustomer(email: string, username: string): Promise<string> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { username },
  });
  logger.routes.info("Stripe customer created", { customerId: customer.id, username });
  return customer.id;
}

export async function createCheckoutSession(
  stripeCustomerId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "setup",
    payment_method_types: ["card"],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  logger.routes.info("Stripe checkout session created", { sessionId: session.id, customerId: stripeCustomerId });
  return { sessionId: session.id, url: session.url! };
}

export async function hasPaymentMethod(stripeCustomerId: string): Promise<boolean> {
  const stripe = getStripe();
  const methods = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: "card",
    limit: 1,
  });
  return methods.data.length > 0;
}

export async function createInvoiceForUsage(
  stripeCustomerId: string,
  costCents: number,
  year: number,
  month: number,
): Promise<string> {
  const stripe = getStripe();
  const idempotencyKey = `billing-${stripeCustomerId}-${year}-${month}`;

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    auto_advance: true,
    collection_method: "charge_automatically",
    metadata: { year: String(year), month: String(month) },
  }, { idempotencyKey });

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    invoice: invoice.id,
    amount: costCents,
    currency: "usd",
    description: `yoyd storage usage - ${year}/${String(month).padStart(2, "0")}`,
  });

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  const paid = await stripe.invoices.pay(finalized.id);

  logger.routes.info("Stripe invoice created and charged", {
    invoiceId: paid.id,
    customerId: stripeCustomerId,
    costCents,
    year,
    month,
    status: paid.status,
  });

  return paid.id;
}

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
