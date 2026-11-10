import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, authedQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { settings } from "@db/schema";
import { getOrCreateSettings } from "../lib/finance";
import { clearUserData, ensureSeeded, seedDemoData } from "../lib/seed";
import { CURRENCY_CODES } from "@contracts/currencies";

export const settingsRouter = createRouter({
  get: authedQuery.query(async ({ ctx }) => {
    await ensureSeeded(ctx.user.id);
    return getOrCreateSettings(ctx.user.id);
  }),

  update: authedQuery
    .input(
      z.object({
        companyName: z.string().min(1).max(255).optional(),
        baseCurrency: z.enum(CURRENCY_CODES as [string, ...string[]]).optional(),
        defaultTaxRate: z.number().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await getOrCreateSettings(ctx.user.id);
      const patch: Record<string, unknown> = {};
      if (input.companyName !== undefined) patch.companyName = input.companyName;
      if (input.baseCurrency !== undefined) patch.baseCurrency = input.baseCurrency;
      if (input.defaultTaxRate !== undefined) patch.defaultTaxRate = String(input.defaultTaxRate);
      if (Object.keys(patch).length > 0) {
        await db.update(settings).set(patch).where(eq(settings.userId, ctx.user.id));
      }
      return getOrCreateSettings(ctx.user.id);
    }),

  /** Wipe the books and re-seed the demo workspace. */
  resetDemo: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await clearUserData(ctx.user.id);
    const s = await getOrCreateSettings(ctx.user.id);
    await seedDemoData(ctx.user.id, s.baseCurrency);
    await db.update(settings).set({ demoSeeded: true }).where(eq(settings.userId, ctx.user.id));
    return { ok: true };
  }),

  /** Wipe the books and start with an empty workspace. */
  clearAll: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await clearUserData(ctx.user.id);
    await db.update(settings).set({ demoSeeded: true }).where(eq(settings.userId, ctx.user.id));
    return { ok: true };
  }),
});
