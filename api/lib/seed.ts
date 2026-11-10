/**
 * Demo workspace seeder — gives a brand-new user a living set of books so the
 * dashboards, reports and AI features are demonstrable immediately.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { expenses, importBatches, importRows, invoiceItems, invoices, settings, transactions } from "@db/schema";
import { getOrCreateSettings } from "./finance";

const seedInFlight = new Map<number, Promise<void>>();

/** Seed demo data exactly once per user, only while their books are empty. */
export async function ensureSeeded(userId: number): Promise<void> {
  const db = getDb();
  const s = await getOrCreateSettings(userId);
  if (s.demoSeeded) return;
  const pending = seedInFlight.get(userId);
  if (pending) return pending; // wait for the parallel request that is seeding
  const job = (async () => {
    // Atomically claim the seeding right — prevents parallel requests double-seeding.
    const claimed = await db
      .update(settings)
      .set({ demoSeeded: true })
      .where(and(eq(settings.userId, userId), eq(settings.demoSeeded, false)));
    const affected = Number((claimed as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
    if (affected === 0) return;
    const existing = await db.query.transactions.findFirst({
      where: eq(transactions.userId, userId),
      columns: { id: true },
    });
    if (existing) return; // real books already exist — don't pollute them
    await seedDemoData(userId, s.baseCurrency);
  })().finally(() => seedInFlight.delete(userId));
  seedInFlight.set(userId, job);
  return job;
}

/** Deterministic PRNG so re-seeds look alike. */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REVENUE_POOL: Array<[string, string, number, number]> = [
  // [description, counterparty, min, max]
  ["Stripe payout — online sales", "Stripe", 1800, 6500],
  ["Invoice settlement — consulting", "Northwind Traders", 2500, 9000],
  ["Retainer — product advisory", "Helios Labs", 3000, 4800],
  ["Marketplace settlement", "Amazon", 900, 3200],
  ["Project milestone payment", "Acme Corp", 4000, 12000],
];

const EXPENSE_POOL: Array<[string, string, string, number, number]> = [
  // [description, counterparty, category, min, max]
  ["AWS — cloud infrastructure", "Amazon Web Services", "Cloud & Hosting", 320, 1400],
  ["Google Ads — search campaign", "Google", "Marketing & Ads", 400, 1800],
  ["WeWork — office rent", "WeWork", "Rent", 1800, 2400],
  ["Payroll run — monthly salaries", "Gusto", "Salaries & Payroll", 12000, 18500],
  ["Slack subscription", "Slack", "Software & Subscriptions", 120, 260],
  ["Figma team plan", "Figma", "Software & Subscriptions", 45, 90],
  ["United Airlines — client visit", "United Airlines", "Travel", 320, 980],
  ["Team dinner — The Olive Grove", "The Olive Grove", "Meals & Entertainment", 90, 340],
  ["Staples — office supplies", "Staples", "Office Supplies", 60, 280],
  ["Comcast Business — internet", "Comcast", "Utilities", 89, 160],
  ["Bank service charge", "Chase Bank", "Bank Charges & Fees", 15, 60],
  ["Deloitte — quarterly tax review", "Deloitte", "Professional Fees", 800, 2400],
  ["Meta Ads — brand campaign", "Meta", "Marketing & Ads", 300, 1500],
  ["Delta — conference travel", "Delta Air Lines", "Travel", 280, 760],
];

const CLIENTS = [
  { name: "Acme Corp", email: "ap@acme.example" },
  { name: "Northwind Traders", email: "finance@northwind.example" },
  { name: "Helios Labs", email: "billing@helios.example" },
  { name: "Bluefin Studios", email: "accounts@bluefin.example" },
  { name: "Kite & Anchor", email: "payables@kiteanchor.example" },
];

export async function seedDemoData(userId: number, baseCurrency: string) {
  const db = getDb();
  const rand = mulberry32(userId * 7919 + 13);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => Math.round((a + rand() * (b - a)) * 100) / 100;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  // --- transactions: ~110 over the last 120 days ---
  const txValues: (typeof transactions.$inferInsert)[] = [];
  for (let day = 120; day >= 0; day--) {
    const roll = rand();
    if (roll < 0.28) {
      const [desc, cp, lo, hi] = pick(REVENUE_POOL);
      const amount = between(lo, hi);
      txValues.push({
        userId,
        date: daysAgo(day),
        description: desc,
        amount: String(amount),
        currency: baseCurrency,
        baseAmount: String(amount),
        category: desc.includes("Stripe") || desc.includes("Marketplace") ? "Sales" : "Services Income",
        counterparty: cp,
        source: "seed",
      });
    }
    if (roll > 0.35) {
      const [desc, cp, cat, lo, hi] = pick(EXPENSE_POOL);
      const amount = between(lo, hi);
      // payroll & rent hit monthly around the same day-of-month
      if ((cat === "Salaries & Payroll" || cat === "Rent") && day % 30 > 2) continue;
      txValues.push({
        userId,
        date: daysAgo(day),
        description: desc,
        amount: String(-amount),
        currency: baseCurrency,
        baseAmount: String(-amount),
        category: cat,
        counterparty: cp,
        source: "seed",
      });
    }
  }
  // stable opening balance
  const opening = 42000;
  txValues.push({
    userId,
    date: daysAgo(121),
    description: "Opening balance — operating account",
    amount: String(opening),
    currency: baseCurrency,
    baseAmount: String(opening),
    category: "Owner's Equity",
    counterparty: "Capital contribution",
    source: "seed",
  });
  // insert in chunks
  for (let i = 0; i < txValues.length; i += 50) {
    await db.insert(transactions).values(txValues.slice(i, i + 50));
  }

  // --- invoices ---
  let counter = 1000 + Math.floor(rand() * 90);
  const mkNumber = () => `INV-${++counter}`;
  const mkItems = (invoiceId: number, lines: Array<[string, number, number]>) =>
    lines.map(([description, quantity, unitPrice], i) => ({
      invoiceId,
      description,
      quantity: String(quantity),
      unitPrice: String(unitPrice),
      amount: String(Math.round(quantity * unitPrice * 100) / 100),
      sortOrder: i,
    }));

  const invoiceSpecs: Array<{
    client: (typeof CLIENTS)[number];
    status: "paid" | "sent" | "overdue" | "draft";
    issuedDaysAgo: number;
    dueInDays: number;
    taxRate: number;
    lines: Array<[string, number, number]>;
  }> = [
    { client: CLIENTS[0], status: "paid", issuedDaysAgo: 68, dueInDays: 30, taxRate: 10, lines: [["Platform development — sprint 12", 1, 8400], ["Cloud cost management", 1, 1200]] },
    { client: CLIENTS[1], status: "paid", issuedDaysAgo: 41, dueInDays: 30, taxRate: 10, lines: [["Advisory retainer — October", 1, 4600]] },
    { client: CLIENTS[2], status: "sent", issuedDaysAgo: 12, dueInDays: 30, taxRate: 0, lines: [["UX audit & redesign", 1, 6200], ["Prototype handoff", 2, 450]] },
    { client: CLIENTS[3], status: "overdue", issuedDaysAgo: 52, dueInDays: 14, taxRate: 10, lines: [["Video campaign production", 1, 7800]] },
    { client: CLIENTS[4], status: "overdue", issuedDaysAgo: 30, dueInDays: 14, taxRate: 0, lines: [["Bookkeeping cleanup — Q3", 1, 2150]] },
    { client: CLIENTS[0], status: "draft", issuedDaysAgo: 1, dueInDays: 30, taxRate: 10, lines: [["Platform development — sprint 13", 1, 8800]] },
  ];

  for (const spec of invoiceSpecs) {
    const subtotal = spec.lines.reduce((s, [, q, p]) => s + q * p, 0);
    const taxAmount = Math.round(subtotal * (spec.taxRate / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const issueDate = daysAgo(spec.issuedDaysAgo);
    const dueDate = new Date(issueDate.getTime() + spec.dueInDays * 86_400_000);
    const paid = spec.status === "paid";
    const [{ id }] = await db
      .insert(invoices)
      .values({
        userId,
        number: mkNumber(),
        clientName: spec.client.name,
        clientEmail: spec.client.email,
        currency: baseCurrency,
        status: spec.status,
        issueDate,
        dueDate,
        subtotal: String(subtotal),
        taxRate: String(spec.taxRate),
        taxAmount: String(taxAmount),
        total: String(total),
        baseTotal: String(total),
        paidAt: paid ? new Date(dueDate.getTime() - 5 * 86_400_000) : null,
        reminderCount: spec.status === "overdue" ? 1 : 0,
      })
      .$returningId();
    await db.insert(invoiceItems).values(mkItems(id, spec.lines));
    if (paid) {
      await db.insert(transactions).values({
        userId,
        date: new Date(dueDate.getTime() - 5 * 86_400_000),
        description: `Invoice payment — ${spec.client.name}`,
        amount: String(total),
        currency: baseCurrency,
        baseAmount: String(total),
        category: "Services Income",
        counterparty: spec.client.name,
        source: "invoice",
      });
    }
  }

  // --- expenses (receipts) ---
  const expenseSpecs: Array<[string, string, number, number, "approved" | "draft"]> = [
    ["Blue Bottle Coffee", "Meals & Entertainment", 3, 18.4, "approved"],
    ["Uber", "Travel", 6, 42.9, "approved"],
    ["Staples", "Office Supplies", 9, 134.2, "draft"],
    ["WeWork", "Rent", 15, 2200, "approved"],
    ["Shell", "Travel", 2, 61.35, "draft"],
  ];
  for (const [merchant, category, ago, amount, status] of expenseSpecs) {
    const [{ id: expId }] = await db
      .insert(expenses)
      .values({
        userId,
        merchant,
        date: daysAgo(ago),
        amount: String(amount),
        currency: baseCurrency,
        baseAmount: String(amount),
        category,
        source: "ocr",
        ocrConfidence: 88 + Math.floor(rand() * 10),
        status,
      })
      .$returningId();
    if (status === "approved") {
      const [{ id: txId }] = await db
        .insert(transactions)
        .values({
          userId,
          date: daysAgo(ago),
          description: `Expense — ${merchant}`,
          amount: String(-amount),
          currency: baseCurrency,
          baseAmount: String(-amount),
          category,
          counterparty: merchant,
          source: "ocr",
        })
        .$returningId();
      await db.update(expenses).set({ transactionId: txId }).where(eq(expenses.id, expId));
    }
  }

  await db.update(settings).set({ demoSeeded: true }).where(eq(settings.userId, userId));
}

/** Wipe every business row belonging to the user (keeps settings). */
export async function clearUserData(userId: number) {
  const db = getDb();
  const userInvoices = await db.query.invoices.findMany({
    where: eq(invoices.userId, userId),
    columns: { id: true },
  });
  for (const inv of userInvoices) {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
  }
  await db.delete(invoices).where(eq(invoices.userId, userId));
  await db.delete(expenses).where(eq(expenses.userId, userId));
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(importRows).where(eq(importRows.userId, userId));
  await db.delete(importBatches).where(eq(importBatches.userId, userId));
}
