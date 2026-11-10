/**
 * AI layer — every model call goes through the platform gateway via the
 * preinstalled AI SDK. Errors are classified with ai-client.ts so routers can
 * return typed, user-facing degradation messages.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { listModels, classifyAiError } from "./ai-client";
import { CATEGORY_NAMES } from "@contracts/categories";

function readEnv(key: string): string {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const v = proc?.env?.[key];
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function provider() {
  return createOpenAICompatible({
    name: "kimi-gw",
    baseURL: readEnv("KIMI_AGENTGW_BASE_URL"),
    apiKey: readEnv("KIMI_AGENTGW_API_KEY"),
    supportsStructuredOutputs: true,
  });
}

const categoryList = CATEGORY_NAMES.join(", ");

/** Batch-categorize bank narrations. Returns one entry per input index. */
export async function categorizeNarrations(
  narrations: string[],
): Promise<Array<{ index: number; category: string; confidence: number }>> {
  if (narrations.length === 0) return [];
  try {
    const { defaultModelId } = await listModels();
    const result = await generateObject({
      model: provider()(defaultModelId),
      schema: z.object({
        assignments: z.array(
          z.object({
            index: z.number().int(),
            category: z.string(),
            confidence: z.number().min(0).max(100),
          }),
        ),
      }),
      prompt:
        `You are a bookkeeper categorizing bank statement narrations for a small business.\n` +
        `Allowed categories (use EXACTLY one of these): ${categoryList}.\n` +
        `Income narrations (money received) must use a revenue category (Sales, Services Income, Other Income).\n` +
        `If nothing fits, use "Uncategorized" with low confidence.\n\n` +
        `Narrations:\n` +
        narrations.map((n, i) => `${i}. ${n}`).join("\n"),
      maxOutputTokens: 2000,
    });
    const valid = new Set(CATEGORY_NAMES);
    return result.object.assignments
      .filter((a) => a.index >= 0 && a.index < narrations.length)
      .map((a) => ({
        index: a.index,
        category: valid.has(a.category) ? a.category : "Uncategorized",
        confidence: Math.round(Math.max(0, Math.min(100, a.confidence))),
      }));
  } catch (err) {
    throw classifyAiError(err);
  }
}

const receiptSchema = z.object({
  merchant: z.string(),
  date: z.string().describe("ISO date YYYY-MM-DD, best guess from the receipt"),
  amount: z.number().describe("grand total paid, positive number"),
  currency: z.string().describe("ISO 4217 currency code"),
  category: z.string(),
  confidence: z.number().min(0).max(100),
  summary: z.string().describe("one short line describing the purchase"),
});

export type ReceiptExtraction = z.infer<typeof receiptSchema>;

/** OCR + structured extraction for a receipt/bill image (data URL). */
export async function extractReceipt(imageDataUrl: string): Promise<ReceiptExtraction> {
  try {
    const { models, defaultModelId } = await listModels();
    const vision = models.find((m) => m.supportsImageIn)?.id ?? defaultModelId;
    const result = await generateObject({
      model: provider()(vision),
      schema: receiptSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Read this receipt or bill image and extract the expense. ` +
                `Category must be EXACTLY one of: ${categoryList}. ` +
                `Estimate confidence 0-100 for the overall extraction quality.`,
            },
            { type: "image", image: imageDataUrl },
          ],
        },
      ],
      maxOutputTokens: 800,
    });
    const valid = new Set(CATEGORY_NAMES);
    const o = result.object;
    return { ...o, category: valid.has(o.category) ? o.category : "Uncategorized" };
  } catch (err) {
    throw classifyAiError(err);
  }
}

/** Short CFO-style insight over a metrics digest. */
export async function generateInsight(digest: string): Promise<string> {
  try {
    const { defaultModelId } = await listModels();
    const result = await generateText({
      model: provider()(defaultModelId),
      prompt:
        `You are a concise CFO assistant. Given these business metrics, write 3 short, ` +
        `specific observations (one line each, plain text, no headers, no emojis). ` +
        `Focus on cash, burn, runway, and receivables risk.\n\n${digest}`,
      maxOutputTokens: 400,
    });
    return result.text.trim();
  } catch (err) {
    throw classifyAiError(err);
  }
}

/** Draft a polite payment-reminder email for an overdue invoice. */
export async function draftReminderEmail(input: {
  clientName: string;
  invoiceNumber: string;
  total: string;
  dueDate: string;
  companyName: string;
  daysOverdue: number;
}): Promise<{ subject: string; body: string }> {
  try {
    const { defaultModelId } = await listModels();
    const result = await generateObject({
      model: provider()(defaultModelId),
      schema: z.object({ subject: z.string(), body: z.string() }),
      prompt:
        `Draft a polite but firm payment reminder email.\n` +
        `From: ${input.companyName}\nTo: ${input.clientName}\n` +
        `Invoice: ${input.invoiceNumber}, amount ${input.total}, due ${input.dueDate} (${input.daysOverdue} days overdue).\n` +
        `Keep it under 120 words, professional, friendly. Body as plain text with line breaks.`,
      maxOutputTokens: 600,
    });
    return result.object;
  } catch (err) {
    throw classifyAiError(err);
  }
}
