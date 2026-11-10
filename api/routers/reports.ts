import { z } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { invoices, transactions } from "@db/schema";
import { getOrCreateSettings, monthKey, monthLabel, monthsAgoStart } from "../lib/finance";
import { categoryKind } from "@contracts/categories";

async function postedSince(userId: number, since: Date) {
  const db = getDb();
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.status, "posted"), gte(transactions.date, since)));
}

export const reportsRouter = createRouter({
  /** Profit & loss: revenue and expense totals by category, per month. */
  profitLoss: authedQuery
    .input(z.object({ months: z.number().int().min(1).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      const s = await getOrCreateSettings(ctx.user.id);
      const rows = await postedSince(ctx.user.id, monthsAgoStart(input.months - 1));

      const months: string[] = [];
      for (let i = input.months - 1; i >= 0; i--) months.push(monthKey(monthsAgoStart(i)));

      const revenue = new Map<string, Map<string, number>>();
      const expense = new Map<string, Map<string, number>>();
      for (const t of rows) {
        if (categoryKind(t.category) === "equity") continue;
        const key = monthKey(t.date);
        if (!months.includes(key)) continue;
        const amt = Number(t.baseAmount);
        const table = amt >= 0 ? revenue : expense;
        if (!table.has(t.category)) table.set(t.category, new Map());
        const cell = table.get(t.category)!;
        cell.set(key, (cell.get(key) ?? 0) + Math.abs(amt));
      }

      const toRows = (table: Map<string, Map<string, number>>) =>
        [...table.entries()]
          .map(([category, cells]) => ({
            category,
            values: months.map((m) => Math.round((cells.get(m) ?? 0) * 100) / 100),
            total: Math.round([...cells.values()].reduce((a, b) => a + b, 0) * 100) / 100,
          }))
          .sort((a, b) => b.total - a.total);

      const revenueRows = toRows(revenue);
      const expenseRows = toRows(expense);
      const sum = (rows: { values: number[] }[]) =>
        months.map((_, i) => Math.round(rows.reduce((acc, r) => acc + r.values[i], 0) * 100) / 100);
      const revenueTotals = sum(revenueRows);
      const expenseTotals = sum(expenseRows);

      return {
        baseCurrency: s.baseCurrency,
        months: months.map(monthLabel),
        revenueRows,
        expenseRows,
        revenueTotals,
        expenseTotals,
        netTotals: revenueTotals.map((r, i) => Math.round((r - expenseTotals[i]) * 100) / 100),
      };
    }),

  /** Simplified balance sheet derived from the ledger + open invoices. */
  balanceSheet: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const s = await getOrCreateSettings(ctx.user.id);
    const all = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.status, "posted")));
    let cash = 0;
    let contributed = 0;
    for (const t of all) {
      const amt = Number(t.baseAmount);
      cash += amt;
      if (categoryKind(t.category) === "equity") contributed += amt;
    }
    const retained = cash - contributed;

    const open = await db.select().from(invoices).where(eq(invoices.userId, ctx.user.id));
    let receivables = 0;
    for (const inv of open) {
      if (inv.status === "sent" || inv.status === "overdue") receivables += Number(inv.baseTotal);
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      baseCurrency: s.baseCurrency,
      asOf: new Date(),
      assets: [
        { label: "Cash & bank", amount: round(cash) },
        { label: "Accounts receivable", amount: round(receivables) },
      ],
      totalAssets: round(cash + receivables),
      liabilities: [] as Array<{ label: string; amount: number }>,
      totalLiabilities: 0,
      equityRows: [
        { label: "Owner's capital", amount: round(contributed) },
        { label: "Retained earnings", amount: round(retained + receivables) },
      ],
      equity: round(cash + receivables),
    };
  }),

  /** Monthly cash-flow statement with running balance. */
  cashFlow: authedQuery
    .input(z.object({ months: z.number().int().min(3).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const s = await getOrCreateSettings(ctx.user.id);
      const all = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.status, "posted")));
      const since = monthsAgoStart(input.months - 1);

      let opening = 0;
      for (const t of all) if (t.date < since) opening += Number(t.baseAmount);

      const buckets = new Map<string, { inflow: number; outflow: number; financing: number }>();
      for (let i = input.months - 1; i >= 0; i--)
        buckets.set(monthKey(monthsAgoStart(i)), { inflow: 0, outflow: 0, financing: 0 });
      for (const t of all) {
        if (t.date < since) continue;
        const b = buckets.get(monthKey(t.date));
        if (!b) continue;
        const amt = Number(t.baseAmount);
        if (categoryKind(t.category) === "equity") b.financing += amt;
        else if (amt > 0) b.inflow += amt;
        else b.outflow += -amt;
      }

      let running = opening;
      const rows = [...buckets.entries()].map(([key, b]) => {
        const net = b.inflow - b.outflow + b.financing;
        running += net;
        return {
          month: monthLabel(key),
          inflow: Math.round(b.inflow * 100) / 100,
          outflow: Math.round(b.outflow * 100) / 100,
          financing: Math.round(b.financing * 100) / 100,
          net: Math.round(net * 100) / 100,
          closing: Math.round(running * 100) / 100,
        };
      });
      return {
        baseCurrency: s.baseCurrency,
        opening: Math.round(opening * 100) / 100,
        rows,
      };
    }),
});
