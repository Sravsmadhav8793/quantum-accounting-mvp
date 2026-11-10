/** AI provider configuration and user-facing error classification. */
export class AiUnavailable extends Error { constructor(message: string) { super(message); this.name = "AiUnavailable"; } }
export class ContentRejected extends Error { constructor(message: string) { super(message); this.name = "ContentRejected"; } }
export class AiMisconfigured extends Error { constructor(message: string) { super(message); this.name = "AiMisconfigured"; } }
export class AiInvalidRequest extends Error { constructor(message: string) { super(message); this.name = "AiInvalidRequest"; } }
export class AiTransient extends Error { constructor(message: string) { super(message); this.name = "AiTransient"; } }

export function listModels() {
  const model = process.env.AI_MODEL;
  if (!model) throw new AiMisconfigured("AI_MODEL is not configured.");
  const vision = process.env.AI_VISION_MODEL;
  return { models: [{ id: model, supportsImageIn: !vision }, ...(vision ? [{ id: vision, supportsImageIn: true }] : [])], defaultModelId: model };
}

export function classifyAiError(error: unknown): Error {
  if (error instanceof AiMisconfigured) return error;
  const e = error as { statusCode?: number; status?: number; message?: string };
  const status = e?.statusCode ?? e?.status;
  if (status === 401 || status === 403) return new AiMisconfigured("AI provider credentials were rejected.");
  if (status === 400) return new AiInvalidRequest("AI request was rejected.");
  if (status === 429 || (status && status >= 500)) return new AiTransient("AI provider is temporarily unavailable.");
  return new AiTransient(e?.message || "AI request failed.");
}
