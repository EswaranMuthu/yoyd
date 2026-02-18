import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, varchar, bigint, integer, unique } from "drizzle-orm/pg-core";

// User storage table.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  email: varchar("email").unique().notNull(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  authProvider: varchar("auth_provider").default("local"),
  googleSub: varchar("google_sub").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  stripeCustomerId: varchar("stripe_customer_id"),
  totalStorageBytes: bigint("total_storage_bytes", { mode: "number" }).default(0),
  monthlyConsumedBytes: bigint("monthly_consumed_bytes", { mode: "number" }).default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Refresh tokens table for auto-refresh functionality
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Secrets vault table for storing service credentials
export const secretsVault = pgTable("secrets_vault", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").unique().notNull(),
  value: text("value").notNull(),
  category: varchar("category"),
  description: varchar("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const billingRecords = pgTable("billing_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  freeBytes: bigint("free_bytes", { mode: "number" }).notNull().default(0),
  billableBytes: bigint("billable_bytes", { mode: "number" }).notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  stripeInvoiceId: varchar("stripe_invoice_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("billing_records_user_month_unique").on(table.userId, table.year, table.month),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type SecretVault = typeof secretsVault.$inferSelect;
export type BillingRecord = typeof billingRecords.$inferSelect;
