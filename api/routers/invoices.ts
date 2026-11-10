import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { invoiceItems, invoices } from "@db/schema";
import { transactions } from "@db/schema";
import { getOrCreateSettings, toBase } from "../lib/finance";
import { draftReminderEmail } from "../lib/ai";
import { CURRENCY_CODES } from "../lib/constants";
import { formatMoney } from "@contracts/currencies";

const itemInput = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

function computeTotals(items: z.infer<typeof itemInput>[], taxRate: number) {
  const subtotal = Math.round(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) * 100) / 100;
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  return { subtotal, taxAmount, total: Math.round((subtotal + taxAmount) * 100) / 100 };
}

/** Lazily flip sent invoices past their due date to overdue. */
async function sweepOverdue(userId: number) {
  const db = getDb();
  const sent = await db.query.invoices.findMany({
    where: and(eq(invoices.userId, userId), eq(invoices.status, "sent")),
  });
  const now = new Date();
  for (const inv of sent) {
    if (inv.dueDate < now) {
      await db.update(invoices).set({ status: "overdue" }).where(eq(invoices.id, inv.id));
    }
  }
}

async function nextInvoiceNumber(userId: number): Promise<string> {
  const db = getDb();
  const all = await db.query.invoices.findMany({
    where: eq(invoices.userId, userId),
    columns: { number: true },
  });
  let max = 1000;
  for (const inv of all) {
    const m = inv.number.match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${max + 1}`;
}

export const invoicesRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await sweepOverdue(ctx.user.id);
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, ctx.user.id))
      .orderBy(desc(invoices.issueDate), desc(invoices.id));
  }),

  get: authedQuery
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)),
      });
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id))
        .orderBy(asc(invoiceItems.sortOrder));
      return { invoice, items };
    }),

  peekNumber: authedQuery.query(({ ctx }) => nextInvoiceNumber(ctx.user.id)),

  create: authedQuery
    .input(
      z.object({
        clientName: z.string().min(1).max(255),
        clientEmail: z.string().email().max(320).optional().or(z.literal("")),
        currency: z.enum(CURRENCY_CODES),
        issueDate: z.date(),
        dueDate: z.date(),
        taxRate: z.number().min(0).max(100),
        notes: z.string().max(2000).optional(),
        items: z.array(itemInput).min(1),
        sendImmediately: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const s = await getOrCreateSettings(ctx.user.id);
      const { subtotal, taxAmount, total } = computeTotals(input.items, input.taxRate);
      const number = await nextInvoiceNumber(ctx.user.id);
      const [{ id }] = await db
        .insert(invoices)
        .values({
          userId: ctx.user.id,
          number,
          clientName: input.clientName,
          clientEmail: input.clientEmail || null,
          currency: input.currency,
          status: input.sendImmediately ? "sent" : "draft",
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          subtotal: String(subtotal),
          taxRate: String(input.taxRate),
          taxAmount: String(taxAmount),
          total: String(total),
          baseTotal: String(toBase(total, input.currency, s.baseCurrency)),
          notes: input.notes,
        })
        .$returningId();
      await db.insert(invoiceItems).values(
        input.items.map((it, i) => ({
          invoiceId: id,
          description: it.description,
          quantity: String(it.quantity),
          unitPrice: String(it.unitPrice),
          amount: String(Math.round(it.quantity * it.unitPrice * 100) / 100),
          sortOrder: i,
        })),
      );
      return { id, number };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int(),
        clientName: z.string().min(1).max(255),
        clientEmail: z.string().email().max(320).optional().or(z.literal("")),
        currency: z.enum(CURRENCY_CODES),
        issueDate: z.date(),
        dueDate: z.date(),
        taxRate: z.number().min(0).max(100),
        notes: z.string().max(2000).optional(),
        items: z.array(itemInput).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (existing.status === "paid" || existing.status === "void") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Paid or void invoices cannot be edited." });
      }
      const s = await getOrCreateSettings(ctx.user.id);
      const { subtotal, taxAmount, total } = computeTotals(input.items, input.taxRate);
      await db
        .update(invoices)
        .set({
          clientName: input.clientName,
          clientEmail: input.clientEmail || null,
          currency: input.currency,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          taxRate: String(input.taxRate),
          subtotal: String(subtotal),
          taxAmount: String(taxAmount),
          total: String(total),
          baseTotal: String(toBase(total, input.currency, s.baseCurrency)),
          notes: input.notes,
        })
        .where(eq(invoices.id, input.id));
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));
      await db.insert(invoiceItems).values(
        input.items.map((it, i) => ({
          invoiceId: input.id,
          description: it.description,
          quantity: String(it.quantity),
          unitPrice: String(it.unitPrice),
          amount: String(Math.round(it.quantity * it.unitPrice * 100) / 100),
          sortOrder: i,
        })),
      );
      return { ok: true };
    }),

  markSent: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)),
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only drafts can be sent." });
      const status = inv.dueDate < new Date() ? "overdue" : "sent";
      await db.update(invoices).set({ status }).where(eq(invoices.id, input.id));
      return { ok: true, status };
    }),

  /** Record full payment: closes the invoice and books the revenue. */
  recordPayment: authedQuery
    .input(z.object({ id: z.number().int(), paidAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)),
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (inv.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is already paid." });
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice is void." });
      const paidAt = input.paidAt ?? new Date();
      await db
        .update(invoices)
        .set({ status: "paid", paidAt })
        .where(eq(invoices.id, input.id));
      await db.insert(transactions).values({
        userId: ctx.user.id,
        date: paidAt,
        description: `Invoice payment ${inv.number} — ${inv.clientName}`,
        amount: String(inv.total),
        currency: inv.currency,
        baseAmount: String(inv.baseTotal),
        category: "Sales",
        counterparty: inv.clientName,
        source: "invoice",
      });
      return { ok: true };
    }),

  setVoid: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(invoices)
        .set({ status: "void" })
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)),
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (inv.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Paid invoices cannot be deleted — void them instead." });
      }
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));
      await db.delete(invoices).where(eq(invoices.id, input.id));
      return { ok: true };
    }),

  /** AI-drafted reminder email; also records that a reminder was sent. */
  reminder: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const inv = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)),
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      if (inv.status !== "sent" && inv.status !== "overdue") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reminders apply to unpaid sent invoices." });
      }
      const s = await getOrCreateSettings(ctx.user.id);
      const daysOverdue = Math.max(0, Math.floor((Date.now() - inv.dueDate.getTime()) / 86_400_000));
      const draft = await draftReminderEmail({
        clientName: inv.clientName,
        invoiceNumber: inv.number,
        total: formatMoney(Number(inv.total), inv.currency),
        dueDate: inv.dueDate.toISOString().slice(0, 10),
        companyName: s.companyName,
        daysOverdue,
      });
      await db
        .update(invoices)
        .set({ reminderCount: inv.reminderCount + 1, lastReminderAt: new Date() })
        .where(eq(invoices.id, input.id));
      return draft;
    }),
});
