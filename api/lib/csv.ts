/**
 * Bank-statement CSV/TSV parser.
 * Handles the layouts most banks export: a header row, a date column,
 * a description/narration column, and either one signed amount column or
 * separate debit/credit columns.
 */

export interface ParsedRow {
  date: Date;
  description: string;
  /** signed: positive = money in, negative = money out */
  amount: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  skipped: number;
  error?: string;
}

function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(line: string): string {
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const count = splitDelimited(line, d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

const DATE_HEADER = /^(date|transaction date|posting date|posted|value date|txn date)/i;
const DESC_HEADER = /(description|narration|details|memo|payee|particulars|reference|transaction)/i;
const AMOUNT_HEADER = /^(amount|amt|value|transaction amount)/i;
const DEBIT_HEADER = /(debit|withdrawal|money out|paid out|dr\b)/i;
const CREDIT_HEADER = /(credit|deposit|money in|paid in|cr\b)/i;
const SKIP_HEADER = /(balance|currency|type|category|check|slip|account)/i;

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/[$€£₹¥,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/(CR|DR)$/i, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return makeDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // Heuristic: first part > 12 must be the day; otherwise assume MM/DD/YYYY (US bank default)
    return a > 12 ? makeDate(+m[3], b, a) : makeDate(+m[3], a, b);
  }
  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{2,4})/);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = months.findIndex((name) => m![2].toLowerCase().startsWith(name));
    if (mi >= 0) {
      let year = +m[3];
      if (year < 100) year += 2000;
      return makeDate(year, mi + 1, +m[1]);
    }
  }
  return null;
}

function makeDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseStatementCsv(text: string): ParseResult {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0, error: "File has no data rows." };

  // Find the header row within the first 10 lines
  let headerIdx = -1;
  let delim = ",";
  let header: string[] = [];
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const d = detectDelimiter(lines[i]);
    const cols = splitDelimited(lines[i], d);
    const hasDate = cols.some((c) => DATE_HEADER.test(c));
    const hasAmount = cols.some((c) => AMOUNT_HEADER.test(c) || DEBIT_HEADER.test(c) || CREDIT_HEADER.test(c));
    if (hasDate && hasAmount) {
      headerIdx = i;
      delim = d;
      header = cols;
      break;
    }
  }
  if (headerIdx < 0) return { rows: [], skipped: 0, error: "Could not find a header row with date and amount columns." };

  const dateCol = header.findIndex((c) => DATE_HEADER.test(c));
  let descCol = header.findIndex((c) => DESC_HEADER.test(c));
  const amountCol = header.findIndex((c) => AMOUNT_HEADER.test(c));
  const debitCol = header.findIndex((c) => DEBIT_HEADER.test(c) && !AMOUNT_HEADER.test(c));
  const creditCol = header.findIndex((c) => CREDIT_HEADER.test(c) && !AMOUNT_HEADER.test(c));
  if (descCol < 0) {
    // fall back to the widest non-numeric column
    let bestLen = -1;
    header.forEach((c, i) => {
      if (i !== dateCol && i !== amountCol && i !== debitCol && i !== creditCol && !SKIP_HEADER.test(c) && c.length > bestLen) {
        bestLen = c.length;
        descCol = i;
      }
    });
  }

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitDelimited(lines[i], delim);
    if (cols.length < header.length - 1) {
      skipped++;
      continue;
    }
    const date = parseDate(cols[dateCol] ?? "");
    let amount: number | null = null;
    if (amountCol >= 0) {
      amount = parseAmount(cols[amountCol] ?? "");
    } else {
      const debit = debitCol >= 0 ? parseAmount(cols[debitCol] ?? "") : null;
      const credit = creditCol >= 0 ? parseAmount(cols[creditCol] ?? "") : null;
      if (credit !== null && credit !== 0) amount = Math.abs(credit);
      else if (debit !== null && debit !== 0) amount = -Math.abs(debit);
    }
    const description = (descCol >= 0 ? cols[descCol] : "") || "Bank transaction";
    if (!date || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    rows.push({ date, description: description.slice(0, 500), amount });
  }
  return { rows, skipped };
}
