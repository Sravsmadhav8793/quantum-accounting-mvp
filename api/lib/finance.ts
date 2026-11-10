import { eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { settings } from "@db/schema";
import { convertCurrency } from "@contracts/currencies";

/** Fetch the user's settings row, creating the default row on first access. */
export async function getOrCreateSettings(userId: number) {
  const db = getDb();
  const existing = await db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  if (existing) return existing;
  await db
    .insert(settings)
    .values({ userId })
    .onDuplicateKeyUpdate({ set: { userId } });
  const row = await db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  return row!;
}

/** Convert to the base currency, rounded to 2dp. */
export function toBase(amount: number, currency: string, baseCurrency: string): number {
  return Math.round(convertCurrency(amount, currency, baseCurrency) * 100) / 100;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** First day of the month, N months ago (UTC). */
export function monthsAgoStart(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
}

export function toNumber(v: unknown): number {
  return typeof v === "string" ? Number(v) : (v as number);
}
