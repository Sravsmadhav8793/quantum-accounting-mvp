import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  decimal,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const passkeyCredentials = mysqlTable("passkey_credentials", {
  id: varchar("id", { length: 255 }).primaryKey(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number", unsigned: true }).default(0).notNull(),
  transports: text("transports").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

/** Per-user organisation settings (single-org MVP). userId is the PK. */
export const settings = mysqlTable("settings", {
  userId: bigint("userId", { mode: "number", unsigned: true }).primaryKey(),
  companyName: varchar("companyName", { length: 255 }).default("My Company").notNull(),
  baseCurrency: varchar("baseCurrency", { length: 3 }).default("USD").notNull(),
  defaultTaxRate: decimal("defaultTaxRate", { precision: 5, scale: 2 }).default("0").notNull(),
  demoSeeded: boolean("demoSeeded").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Settings = typeof settings.$inferSelect;

/** Ledger transactions. Signed amounts: positive = money in, negative = money out. */
export const transactions = mysqlTable("transactions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  date: timestamp("date").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  /** amount converted to the user's base currency at booking time */
  baseAmount: decimal("baseAmount", { precision: 15, scale: 2 }).notNull(),
  category: varchar("category", { length: 64 }).default("Uncategorized").notNull(),
  counterparty: varchar("counterparty", { length: 255 }),
  source: mysqlEnum("source", ["manual", "import", "ocr", "invoice", "seed"]).default("manual").notNull(),
  status: mysqlEnum("status", ["posted", "void"]).default("posted").notNull(),
  memo: text("memo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;

export const importBatches = mysqlTable("import_batches", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  rowCount: int("rowCount").default(0).notNull(),
  approvedCount: int("approvedCount").default(0).notNull(),
  status: mysqlEnum("status", ["review", "completed"]).default("review").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportBatch = typeof importBatches.$inferSelect;

export const importRows = mysqlTable("import_rows", {
  id: serial("id").primaryKey(),
  batchId: bigint("batchId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  date: timestamp("date").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  suggestedCategory: varchar("suggestedCategory", { length: 64 }).default("Uncategorized").notNull(),
  confidence: int("confidence").default(0).notNull(),
  categorizedBy: mysqlEnum("categorizedBy", ["rules", "ai", "none"]).default("none").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  finalCategory: varchar("finalCategory", { length: 64 }),
  transactionId: bigint("transactionId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ImportRow = typeof importRows.$inferSelect;

export const invoices = mysqlTable("invoices", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  number: varchar("number", { length: 32 }).notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "paid", "overdue", "void"]).default("draft").notNull(),
  issueDate: timestamp("issueDate").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0").notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("0").notNull(),
  taxAmount: decimal("taxAmount", { precision: 15, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).default("0").notNull(),
  baseTotal: decimal("baseTotal", { precision: 15, scale: 2 }).default("0").notNull(),
  paidAt: timestamp("paidAt"),
  reminderCount: int("reminderCount").default(0).notNull(),
  lastReminderAt: timestamp("lastReminderAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Invoice = typeof invoices.$inferSelect;

export const invoiceItems = mysqlTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: bigint("invoiceId", { mode: "number", unsigned: true }).notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1").notNull(),
  unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).default("0").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).default("0").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;

export const expenses = mysqlTable("expenses", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  merchant: varchar("merchant", { length: 255 }).notNull(),
  date: timestamp("date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  baseAmount: decimal("baseAmount", { precision: 15, scale: 2 }).notNull(),
  category: varchar("category", { length: 64 }).default("Uncategorized").notNull(),
  source: mysqlEnum("source", ["manual", "ocr"]).default("manual").notNull(),
  ocrConfidence: int("ocrConfidence"),
  status: mysqlEnum("status", ["draft", "approved"]).default("draft").notNull(),
  notes: text("notes"),
  transactionId: bigint("transactionId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Expense = typeof expenses.$inferSelect;
