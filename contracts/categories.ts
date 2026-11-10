/** Shared bookkeeping categories used by the rule engine, the LLM, and the UI. */

export interface CategoryDef {
  name: string;
  kind: "revenue" | "expense" | "equity";
  /** keywords the deterministic rule engine matches against narration text */
  keywords: string[];
}

export const CATEGORIES: CategoryDef[] = [
  { name: "Sales", kind: "revenue", keywords: ["sale", "invoice", "payout", "stripe", "revenue", "receipt", "pos ", "settlement"] },
  { name: "Services Income", kind: "revenue", keywords: ["consulting", "service", "retainer", "freelance", "project fee", "professional fee"] },
  { name: "Other Income", kind: "revenue", keywords: ["refund received", "interest credit", "dividend", "cashback", "reimbursement in"] },
  { name: "Rent", kind: "expense", keywords: ["rent", "lease", "landlord"] },
  { name: "Salaries & Payroll", kind: "expense", keywords: ["salary", "payroll", "wages", "bonus", "gusto", "adp run"] },
  { name: "Software & Subscriptions", kind: "expense", keywords: ["subscription", "saas", "adobe", "slack", "notion", "zoom", "github", "figma", "microsoft 365", "google workspace"] },
  { name: "Cloud & Hosting", kind: "expense", keywords: ["aws", "amazon web services", "azure", "gcp", "google cloud", "digitalocean", "vercel", "hosting", "cloudflare"] },
  { name: "Marketing & Ads", kind: "expense", keywords: ["marketing", "ads", "advertising", "google ads", "meta ads", "facebook", "linkedin", "campaign", "seo"] },
  { name: "Travel", kind: "expense", keywords: ["flight", "airlines", "hotel", "uber", "lyft", "taxi", "train", "airbnb", "travel"] },
  { name: "Meals & Entertainment", kind: "expense", keywords: ["restaurant", "dinner", "lunch", "cafe", "coffee", "meal", "swiggy", "zomato", "doordash", "uber eats"] },
  { name: "Office Supplies", kind: "expense", keywords: ["office supplies", "stationery", "staples", "printer", "furniture"] },
  { name: "Utilities", kind: "expense", keywords: ["electricity", "water bill", "internet", "broadband", "telecom", "phone bill", "utility", "power bill"] },
  { name: "Bank Charges & Fees", kind: "expense", keywords: ["bank charge", "service charge", "transaction fee", "annual fee", "maintenance fee", "processing fee", "atm fee"] },
  { name: "Taxes & Duties", kind: "expense", keywords: ["tax", "gst", "vat", "duty", "customs", "irs", "hmrc", "income tax"] },
  { name: "Professional Fees", kind: "expense", keywords: ["legal", "lawyer", "accountant", "audit", "ca fee", "attorney", "notary"] },
  { name: "Inventory & COGS", kind: "expense", keywords: ["inventory", "stock purchase", "raw material", "cogs", "supplier", "wholesale"] },
  { name: "Equipment & Assets", kind: "expense", keywords: ["equipment", "laptop", "macbook", "hardware", "machinery", "computer"] },
  { name: "Insurance", kind: "expense", keywords: ["insurance", "premium", "policy"] },
  { name: "Transfer / Internal", kind: "expense", keywords: ["transfer to self", "internal transfer", "own account", "between accounts"] },
  { name: "Owner's Equity", kind: "equity", keywords: [] },
  { name: "Uncategorized", kind: "expense", keywords: [] },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

/** Kind lookup — equity-kind categories are excluded from P&L and operating cash flow. */
export function categoryKind(name: string): "revenue" | "expense" | "equity" | undefined {
  return CATEGORIES.find((c) => c.name === name)?.kind;
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "expense").map((c) => c.name);
export const REVENUE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "revenue").map((c) => c.name);

/** Deterministic keyword categorizer. Returns category + 0-100 confidence. */
export function ruleCategorize(narration: string): { category: string; confidence: number } {
  const text = narration.toLowerCase();
  let best: { category: string; score: number } | null = null;
  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw)) score += kw.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { category: cat.name, score };
  }
  if (!best) return { category: "Uncategorized", confidence: 25 };
  const confidence = Math.min(96, 62 + best.score * 3);
  return { category: best.category, confidence };
}
