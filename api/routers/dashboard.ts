import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { invoices, transactions } from "@db/schema";
import { getOrCreateSettings, monthKey, monthLabel, monthsAgoStart } from "../lib/finance";
import { ensureSeeded } from "../lib/seed";
import { generateInsight } from "../lib/ai";
import { formatMoney } from "@contracts/currencies";
import { categoryKind } from "@contracts/categories";

async function postedSince(userId: number, since: Date) {
  const db = getDb();
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.status, "posted"), gte(transactions.date, since)));
}

export const dashboardRouter = createRouter({
  /** Headline KPIs for the dashboard. */
  summary: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await ensureSeeded(ctx.user.id);
    const s = await getOrCreateSettings(ctx.user.id);
    const base = s.baseCurrency;

    const all = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.status, "posted")));

    const cash = all.reduce((sum, t) => sum + Number(t.baseAmount), 0);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    let revenueMtd = 0;
    let expensesMtd = 0;
    let revenuePrev = 0;
    let expensesPrev = 0;
    for (const t of all) {
      const amt = Number(t.baseAmount);
      if (t.date >= monthStart) {
        if (amt > 0) revenueMtd += amt;
        else expensesMtd += -amt;
      } else if (t.date >= prevMonthStart) {
        if (amt > 0) revenuePrev += amt;
        else expensesPrev += -amt;
      }
    }

    // average monthly net burn over the last 3 full months
    const threeMonthsAgo = monthsAgoStart(3);
    let net3 = 0;
    for (const t of all) {
      if (t.date >= threeMonthsAgo && t.date < monthStart) net3 += Number(t.baseAmount);
    }
    const avgMonthlyNet = net3 / 3;
    const monthlyBurn = avgMonthlyNet < 0 ? -avgMonthlyNet : 0;
    const runwayMonths = monthlyBurn > 0 ? Math.round((cash / monthlyBurn) * 10) / 10 : null;

    const open = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.userId, ctx.user.id)));
    let receivables = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    for (const inv of open) {
      if (inv.status === "sent" || inv.status === "overdue") {
        receivables += Number(inv.baseTotal);
        const isOverdue = inv.status === "overdue" || inv.dueDate < now;
        if (isOverdue) {
          overdueAmount += Number(inv.baseTotal);
          overdueCount++;
        }
      }
    }

    return {
      baseCurrency: base,
      cash: Math.round(cash * 100) / 100,
      revenueMtd: Math.round(revenueMtd * 100) / 100,
      expensesMtd: Math.round(expensesMtd * 100) / 100,
      revenuePrev: Math.round(revenuePrev * 100) / 100,
      expensesPrev: Math.round(expensesPrev * 100) / 100,
      netMtd: Math.round((revenueMtd - expensesMtd) * 100) / 100,
      monthlyBurn: Math.round(monthlyBurn * 100) / 100,
      runwayMonths,
      receivables: Math.round(receivables * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      overdueCount,
      transactionCount: all.length,
    };
  }),

  /** Monthly inflow/outflow for the last N months. */
  cashFlow: authedQuery
    .input(z.object({ months: z.number().int().min(3).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      await ensureSeeded(ctx.user.id);
      const rows = await postedSince(ctx.user.id, monthsAgoStart(input.months - 1));
      const buckets = new Map<string, { inflow: number; outflow: number }>();
      for (let i = input.months - 1; i >= 0; i--) {
        buckets.set(monthKey(monthsAgoStart(i)), { inflow: 0, outflow: 0 });
      }
      for (const t of rows) {
        if (categoryKind(t.category) === "equity") continue;
        const key = monthKey(t.date);
        const b = buckets.get(key);
        if (!b) continue;
        const amt = Number(t.baseAmount);
        if (amt > 0) b.inflow += amt;
        else b.outflow += -amt;
      }
      return [...buckets.entries()].map(([key, b]) => ({
        month: monthLabel(key),
        inflow: Math.round(b.inflow * 100) / 100,
        outflow: Math.round(b.outflow * 100) / 100,
        net: Math.round((b.inflow - b.outflow) * 100) / 100,
      }));
    }),

  /** Expense breakdown by category for the last N days. */
  expenseBreakdown: authedQuery
    .input(z.object({ days: z.number().int().min(7).max(365).default(90) }))
    .query(async ({ ctx, input }) => {
      await ensureSeeded(ctx.user.id);
      const since = new Date(Date.now() - input.days * 86_400_000);
      const rows = await postedSince(ctx.user.id, since);
      const byCat = new Map<string, number>();
      for (const t of rows) {
        const amt = Number(t.baseAmount);
        if (amt < 0) byCat.set(t.category, (byCat.get(t.category) ?? 0) + -amt);
      }
      return [...byCat.entries()]
        .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total);
    }),

  /** Receivables aging buckets from open invoices. */
  receivables: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    await ensureSeeded(ctx.user.id);
    const open = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.userId, ctx.user.id)));
    const buckets = [
      { label: "Not due", min: -Infinity, max: 0, total: 0, count: 0 },
      { label: "1–30 days", min: 0, max: 30, total: 0, count: 0 },
      { label: "31–60 days", min: 30, max: 60, total: 0, count: 0 },
      { label: "60+ days", min: 60, max: Infinity, total: 0, count: 0 },
    ];
    const now = Date.now();
    for (const inv of open) {
      if (inv.status !== "sent" && inv.status !== "overdue") continue;
      const daysOver = Math.floor((now - inv.dueDate.getTime()) / 86_400_000);
      const bucket = buckets.find((b) => daysOver > b.min && daysOver <= b.max) ?? buckets[3];
      bucket.total += Number(inv.baseTotal);
      bucket.count++;
    }
    return buckets.map((b) => ({ label: b.label, total: Math.round(b.total * 100) / 100, count: b.count }));
  }),

  recent: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      await ensureSeeded(ctx.user.id);
      return db
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.status, "posted")))
        .orderBy(desc(transactions.date), desc(transactions.id))
        .limit(input.limit);
    }),

  /** On-demand AI commentary over the current metrics. */
  insight: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const s = await getOrCreateSettings(ctx.user.id);
    const all = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.status, "posted")));
    const cash = all.reduce((sum, t) => sum + Number(t.baseAmount), 0);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let rev = 0;
    let exp = 0;
    const catTotals = new Map<string, number>();
    for (const t of all) {
      const amt = Number(t.baseAmount);
      if (t.date >= monthStart) {
        if (amt > 0) rev += amt;
        else {
          exp += -amt;
          catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + -amt);
        }
      }
    }
    const open = await db.select().from(invoices).where(eq(invoices.userId, ctx.user.id));
    let receivables = 0;
    let overdue = 0;
    for (const inv of open) {
      if (inv.status === "sent" || inv.status === "overdue") {
        receivables += Number(inv.baseTotal);
        if (inv.status === "overdue" || inv.dueDate < now) overdue += Number(inv.baseTotal);
      }
    }
    const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const digest =
      `Company: ${s.companyName}. Currency: ${s.baseCurrency}.\n` +
      `Cash balance: ${formatMoney(cash, s.baseCurrency)}.\n` +
      `This month so far: revenue ${formatMoney(rev, s.baseCurrency)}, expenses ${formatMoney(exp, s.baseCurrency)}.\n` +
      `Top expense categories this month: ${topCats.map(([c, v]) => `${c} ${formatMoney(v, s.baseCurrency)}`).join(", ") || "none"}.\n` +
      `Open receivables: ${formatMoney(receivables, s.baseCurrency)}, of which overdue ${formatMoney(overdue, s.baseCurrency)}.`;
    const text = await generateInsight(digest);
    return { text };
  }),
});
