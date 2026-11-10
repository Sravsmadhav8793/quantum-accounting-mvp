import { z } from "zod";
import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { transactions } from "@db/schema";
import { getOrCreateSettings, monthsAgoStart, toBase } from "../lib/finance";
import { CATEGORY_NAMES, CURRENCY_CODES } from "../lib/constants";

export const transactionsRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        type: z.enum(["all", "in", "out"]).default("all"),
        category: z.string().optional(),
        search: z.string().max(200).optional(),
        months: z.number().int().min(1).max(36).default(12),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(transactions.userId, ctx.user.id), eq(transactions.status, "posted")];
      conds.push(gte(transactions.date, monthsAgoStart(input.months - 1)));
      if (input.type === "in") conds.push(sql`${transactions.amount} > 0`);
      if (input.type === "out") conds.push(sql`${transactions.amount} < 0`);
      if (input.category && input.category !== "all") conds.push(eq(transactions.category, input.category));
      if (input.search) conds.push(like(transactions.description, `%${input.search}%`));
      const where = and(...conds);

      const rows = await db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(input.limit)
        .offset(input.offset);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(where);
      return { rows, total: Number(count) };
    }),

  create: authedQuery
    .input(
      z.object({
        date: z.date(),
        description: z.string().min(1).max(500),
        amount: z.number().refine((v) => v !== 0, "Amount cannot be zero"),
        currency: z.enum(CURRENCY_CODES),
        category: z.enum(CATEGORY_NAMES),
        counterparty: z.string().max(255).optional(),
        memo: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const s = await getOrCreateSettings(ctx.user.id);
      const baseAmount = toBase(input.amount, input.currency, s.baseCurrency);
      const [{ id }] = await db
        .insert(transactions)
        .values({
          userId: ctx.user.id,
          date: input.date,
          description: input.description,
          amount: String(input.amount),
          currency: input.currency,
          baseAmount: String(baseAmount),
          category: input.category,
          counterparty: input.counterparty,
          memo: input.memo,
          source: "manual",
        })
        .$returningId();
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int(),
        description: z.string().min(1).max(500).optional(),
        category: z.enum(CATEGORY_NAMES).optional(),
        memo: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.transactions.findFirst({
        where: and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      const patch: Record<string, unknown> = {};
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) patch.category = input.category;
      if (input.memo !== undefined) patch.memo = input.memo;
      if (Object.keys(patch).length > 0) {
        await db.update(transactions).set(patch).where(eq(transactions.id, input.id));
      }
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)));
      return { ok: true };
    }),
});
