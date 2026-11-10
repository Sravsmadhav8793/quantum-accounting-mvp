import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { expenses, transactions } from "@db/schema";
import { getOrCreateSettings, toBase } from "../lib/finance";
import { extractReceipt } from "../lib/ai";
import { CATEGORY_NAMES, CURRENCY_CODES } from "../lib/constants";

export const expensesRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(expenses)
      .where(eq(expenses.userId, ctx.user.id))
      .orderBy(desc(expenses.date), desc(expenses.id));
  }),

  /** OCR a receipt image (data URL) — returns extracted fields, saves nothing. */
  scan: authedQuery
    .input(z.object({ imageDataUrl: z.string().min(100).max(8_000_000) }))
    .mutation(async ({ input }) => {
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(input.imageDataUrl)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported image format — use PNG, JPG or WebP." });
      }
      return extractReceipt(input.imageDataUrl);
    }),

  create: authedQuery
    .input(
      z.object({
        merchant: z.string().min(1).max(255),
        date: z.date(),
        amount: z.number().positive(),
        currency: z.enum(CURRENCY_CODES),
        category: z.enum(CATEGORY_NAMES),
        source: z.enum(["manual", "ocr"]).default("manual"),
        ocrConfidence: z.number().int().min(0).max(100).optional(),
        notes: z.string().max(2000).optional(),
        approve: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const s = await getOrCreateSettings(ctx.user.id);
      const baseAmount = toBase(input.amount, input.currency, s.baseCurrency);
      const [{ id }] = await db
        .insert(expenses)
        .values({
          userId: ctx.user.id,
          merchant: input.merchant,
          date: input.date,
          amount: String(input.amount),
          currency: input.currency,
          baseAmount: String(baseAmount),
          category: input.category,
          source: input.source,
          ocrConfidence: input.ocrConfidence ?? null,
          notes: input.notes,
          status: input.approve ? "approved" : "draft",
        })
        .$returningId();
      if (input.approve) {
        await postExpense(id, ctx.user.id);
      }
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int(),
        merchant: z.string().min(1).max(255).optional(),
        date: z.date().optional(),
        amount: z.number().positive().optional(),
        currency: z.enum(CURRENCY_CODES).optional(),
        category: z.enum(CATEGORY_NAMES).optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.expenses.findFirst({
        where: and(eq(expenses.id, input.id), eq(expenses.userId, ctx.user.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      if (existing.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Approved expenses are locked — they are already in the ledger." });
      }
      const s = await getOrCreateSettings(ctx.user.id);
      const patch: Record<string, unknown> = {};
      if (input.merchant !== undefined) patch.merchant = input.merchant;
      if (input.date !== undefined) patch.date = input.date;
      if (input.amount !== undefined) patch.amount = String(input.amount);
      if (input.currency !== undefined) patch.currency = input.currency;
      if (input.category !== undefined) patch.category = input.category;
      if (input.notes !== undefined) patch.notes = input.notes;
      const amount = input.amount ?? Number(existing.amount);
      const currency = input.currency ?? existing.currency;
      patch.baseAmount = String(toBase(amount, currency, s.baseCurrency));
      await db.update(expenses).set(patch).where(eq(expenses.id, input.id));
      return { ok: true };
    }),

  /** Approve a draft expense: posts it to the ledger. */
  approve: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await postExpense(input.id, ctx.user.id);
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.expenses.findFirst({
        where: and(eq(expenses.id, input.id), eq(expenses.userId, ctx.user.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      if (existing.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Approved expenses are locked — they are already in the ledger." });
      }
      await db.delete(expenses).where(eq(expenses.id, input.id));
      return { ok: true };
    }),
});

async function postExpense(expenseId: number, userId: number) {
  const db = getDb();
  const exp = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), eq(expenses.userId, userId)),
  });
  if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
  if (exp.status === "approved") return; // idempotent
  const [{ id: txId }] = await db
    .insert(transactions)
    .values({
      userId,
      date: exp.date,
      description: `Expense — ${exp.merchant}`,
      amount: String(-Number(exp.amount)),
      currency: exp.currency,
      baseAmount: String(-Number(exp.baseAmount)),
      category: exp.category,
      counterparty: exp.merchant,
      source: exp.source === "ocr" ? "ocr" : "manual",
    })
    .$returningId();
  await db.update(expenses).set({ status: "approved", transactionId: txId }).where(eq(expenses.id, expenseId));
}
