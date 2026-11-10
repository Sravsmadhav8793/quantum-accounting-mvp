import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { importBatches, importRows, transactions } from "@db/schema";
import { getOrCreateSettings, toBase } from "../lib/finance";
import { parseStatementCsv } from "../lib/csv";
import { ruleCategorize } from "@contracts/categories";
import { categorizeNarrations } from "../lib/ai";
import { CATEGORY_NAMES, CURRENCY_CODES } from "../lib/constants";

/** Low-confidence rows get a second pass from the LLM (bounded batch). */
const AI_CONFIDENCE_FLOOR = 70;
const AI_BATCH_LIMIT = 40;

export const importsRouter = createRouter({
  /** Upload a CSV/TSV bank statement: parse, auto-categorize, park for review. */
  upload: authedQuery
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        content: z.string().min(1).max(4_000_000),
        currency: z.enum(CURRENCY_CODES).default("USD"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const parsed = parseStatementCsv(input.content);
      if (parsed.error || parsed.rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: parsed.error ?? "No transactions could be read from this file.",
        });
      }
      const rows = parsed.rows.slice(0, 2000);

      const [{ id: batchId }] = await db
        .insert(importBatches)
        .values({
          userId: ctx.user.id,
          filename: input.filename,
          rowCount: rows.length,
          status: "review",
        })
        .$returningId();

      // Pass 1: deterministic rules
      const suggestions = rows.map((r) => ruleCategorize(r.description));

      // Pass 2: AI for the rows the rules were unsure about
      let aiUsed = false;
      let aiError: string | null = null;
      const lowIdx = suggestions
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.confidence < AI_CONFIDENCE_FLOOR)
        .slice(0, AI_BATCH_LIMIT)
        .map(({ i }) => i);
      if (lowIdx.length > 0) {
        try {
          const aiResults = await categorizeNarrations(lowIdx.map((i) => rows[i].description));
          for (const r of aiResults) {
            const rowIdx = lowIdx[r.index];
            if (rowIdx === undefined) continue;
            suggestions[rowIdx] = { category: r.category, confidence: r.confidence };
          }
          aiUsed = true;
        } catch (err) {
          aiError = err instanceof Error ? err.message : "AI categorization unavailable";
        }
      }

      const aiRowSet = new Set(lowIdx);
      for (let i = 0; i < rows.length; i++) {
        await db.insert(importRows).values({
          batchId,
          userId: ctx.user.id,
          date: rows[i].date,
          description: rows[i].description,
          amount: String(rows[i].amount),
          currency: input.currency,
          suggestedCategory: suggestions[i].category,
          confidence: suggestions[i].confidence,
          categorizedBy: aiUsed && aiRowSet.has(i) ? "ai" : "rules",
        });
      }

      return {
        batchId,
        rowCount: rows.length,
        skipped: parsed.skipped,
        aiUsed,
        aiError,
      };
    }),

  listBatches: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(importBatches)
      .where(eq(importBatches.userId, ctx.user.id))
      .orderBy(desc(importBatches.createdAt));
  }),

  getBatch: authedQuery
    .input(z.object({ batchId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const batch = await db.query.importBatches.findFirst({
        where: and(eq(importBatches.id, input.batchId), eq(importBatches.userId, ctx.user.id)),
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Import batch not found" });
      const rows = await db
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, input.batchId))
        .orderBy(asc(importRows.date), asc(importRows.id));
      return { batch, rows };
    }),

  /** Edit one row: change its category, or reject it. */
  setRow: authedQuery
    .input(
      z.object({
        rowId: z.number().int(),
        finalCategory: z.enum(CATEGORY_NAMES).optional(),
        status: z.enum(["pending", "rejected"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const row = await db.query.importRows.findFirst({
        where: and(eq(importRows.id, input.rowId), eq(importRows.userId, ctx.user.id)),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
      const patch: Record<string, unknown> = {};
      if (input.finalCategory !== undefined) patch.finalCategory = input.finalCategory;
      if (input.status !== undefined) patch.status = input.status;
      await db.update(importRows).set(patch).where(eq(importRows.id, input.rowId));
      return { ok: true };
    }),

  /** Approve rows and post them to the ledger. Idempotent per row. */
  approve: authedQuery
    .input(
      z.object({
        batchId: z.number().int(),
        rowIds: z.array(z.number().int()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const batch = await db.query.importBatches.findFirst({
        where: and(eq(importBatches.id, input.batchId), eq(importBatches.userId, ctx.user.id)),
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Import batch not found" });
      const s = await getOrCreateSettings(ctx.user.id);

      const pending = (
        await db
          .select()
          .from(importRows)
          .where(and(eq(importRows.batchId, input.batchId), eq(importRows.status, "pending")))
      ).filter((r) => !input.rowIds || input.rowIds.includes(r.id));

      let approved = 0;
      for (const row of pending) {
        const category = row.finalCategory ?? row.suggestedCategory;
        const amount = Number(row.amount);
        const [{ id: txId }] = await db
          .insert(transactions)
          .values({
            userId: ctx.user.id,
            date: row.date,
            description: row.description,
            amount: String(amount),
            currency: row.currency,
            baseAmount: String(toBase(amount, row.currency, s.baseCurrency)),
            category,
            source: "import",
          })
          .$returningId();
        await db
          .update(importRows)
          .set({ status: "approved", transactionId: txId })
          .where(eq(importRows.id, row.id));
        approved++;
      }

      const allRows = await db
        .select({ status: importRows.status })
        .from(importRows)
        .where(eq(importRows.batchId, input.batchId));
      const approvedCount = allRows.filter((r) => r.status === "approved").length;
      const pendingCount = allRows.filter((r) => r.status === "pending").length;
      await db
        .update(importBatches)
        .set({ approvedCount, status: pendingCount === 0 ? "completed" : "review" })
        .where(eq(importBatches.id, input.batchId));

      return { approved, approvedCount, pendingCount };
    }),

  remove: authedQuery
    .input(z.object({ batchId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // only batches with no approved rows can be deleted (posted rows stay in the ledger)
      const rows = await db
        .select({ status: importRows.status })
        .from(importRows)
        .where(and(eq(importRows.batchId, input.batchId), eq(importRows.userId, ctx.user.id)));
      if (rows.some((r) => r.status === "approved")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This import already posted entries to the ledger and cannot be deleted.",
        });
      }
      await db.delete(importRows).where(eq(importRows.batchId, input.batchId));
      await db
        .delete(importBatches)
        .where(and(eq(importBatches.id, input.batchId), eq(importBatches.userId, ctx.user.id)));
      return { ok: true };
    }),
});
