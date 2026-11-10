import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { settingsRouter } from "./routers/settings";
import { transactionsRouter } from "./routers/transactions";
import { importsRouter } from "./routers/imports";
import { invoicesRouter } from "./routers/invoices";
import { expensesRouter } from "./routers/expenses";
import { dashboardRouter } from "./routers/dashboard";
import { reportsRouter } from "./routers/reports";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  settings: settingsRouter,
  transactions: transactionsRouter,
  imports: importsRouter,
  invoices: invoicesRouter,
  expenses: expensesRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
