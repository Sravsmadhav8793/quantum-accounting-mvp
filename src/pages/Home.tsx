import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowRight,
  ArrowUpRight,
  Landmark,
  FileText,
  ScanLine,
  PieChart,
  Sparkles,
  UploadCloud,
  CheckCheck,
  ScanSearch,
  Check,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

const FEATURES = [
  {
    icon: Landmark,
    title: "AI bank statement import",
    body: "Drop a CSV from any bank. Every line is read, auto-categorized with a confidence score, and parked in a review queue — approve a month of bookkeeping in minutes.",
  },
  {
    icon: FileText,
    title: "Smart invoicing",
    body: "Multi-currency invoices with tax handling, automatic overdue tracking, aging reports, and AI-drafted payment reminders that nudge clients for you.",
  },
  {
    icon: ScanLine,
    title: "Receipt & bill OCR",
    body: "Snap a receipt. The AI reads the merchant, date, total and category — you confirm, it posts to the ledger. No more shoebox accounting.",
  },
  {
    icon: PieChart,
    title: "Real-time reports",
    body: "Live P&L, balance sheet and cash-flow statements plus burn rate and runway — computed from your ledger the moment anything changes.",
  },
];

const STEPS = [
  { icon: UploadCloud, title: "Upload", body: "Bank statements, receipts, invoices — bring everything into one place." },
  { icon: Sparkles, title: "AI does the work", body: "Transactions are categorized, matched and mapped with confidence scores." },
  { icon: ScanSearch, title: "You review", body: "A clean queue shows exactly what the AI proposed. Edit anything in one click." },
  { icon: CheckCheck, title: "Books are done", body: "Approved entries post to the ledger. Reports update instantly." },
];

const COMPARISON: Array<[string, boolean, boolean, boolean]> = [
  ["AI auto-categorization of bank lines", true, false, false],
  ["Receipt OCR straight to ledger", true, false, true],
  ["Cloud-native, nothing to install", true, false, true],
  ["Multi-currency with base-currency reporting", true, true, true],
  ["AI-drafted payment reminders", true, false, false],
  ["Burn rate & runway built in", true, false, false],
];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cta = () => navigate(user ? "/dashboard" : "/login");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* nav */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </span>
            <span className="font-display font-semibold tracking-tight">
              Quantum<span className="text-primary">Accounting</span>
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
            <a href="#compare" className="transition-colors hover:text-foreground">Compare</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? null : (
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                Sign in
              </Button>
            )}
            <Button size="sm" onClick={cta}>
              {user ? "Open app" : "Get started"}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-6 md:pt-20">
        <div className="max-w-3xl">
          <p className="kicker mb-4">AI-powered cloud accounting</p>
          <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
            Accounting that
            <br />
            does <span className="text-primary">itself.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            QuantumAccounting replaces the manual grind of desktop bookkeeping: upload statements,
            let the AI categorize every line, invoice in any currency, and watch your reports
            update in real time.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={cta}>
              Start free — open your books
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#features">See how it works</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Multi-currency · AI categorization & OCR · Real-time P&L, cash flow, runway
          </p>
        </div>

        {/* live product preview — the interface is the imagery */}
        <div className="surface mt-14 overflow-hidden" aria-hidden>
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              LIVE BOOKS · ACME CORP
            </div>
            <span className="text-xs text-muted-foreground">FY 2026</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            {[
              { label: "Cash on hand", value: "$128,540", delta: "+12.4% vs last month" },
              { label: "Revenue (MTD)", value: "$46,210", delta: "+8.1%" },
              { label: "Runway", value: "14.2 mo", delta: "burn $9.1K/mo" },
              { label: "Receivables", value: "$18,900", delta: "$3.2K overdue", warn: true },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-card px-5 py-4">
                <p className="kicker">{kpi.label}</p>
                <p className="tnum mt-1.5 font-display text-xl font-semibold md:text-2xl">{kpi.value}</p>
                <p className={`mt-1 text-xs ${kpi.warn ? "text-[hsl(var(--danger))]" : "text-primary"}`}>
                  {kpi.delta}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-px bg-border md:grid-cols-5">
            <div className="bg-card p-5 md:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <p className="kicker">AI categorization queue</p>
                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                  214 of 218 auto-matched
                </span>
              </div>
              <div className="space-y-2.5">
                {[
                  { desc: "UPI-483 · WeWork office rent", cat: "Rent", conf: 96 },
                  { desc: "NEFT-921 · Amazon Web Services", cat: "Cloud & Hosting", conf: 94 },
                  { desc: "IMPS-207 · Google Ads campaign", cat: "Marketing & Ads", conf: 91 },
                  { desc: "ACH-114 · Stripe payout", cat: "Sales", conf: 97 },
                ].map((row) => (
                  <div key={row.desc} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted-foreground">{row.desc}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                        <Sparkles className="h-3 w-3" />
                        {row.cat}
                      </span>
                      <span className="tnum text-xs text-muted-foreground">{row.conf}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card p-5 md:col-span-2">
              <p className="kicker mb-4">Cash flow — last 6 months</p>
              <div className="flex h-28 items-end gap-2">
                {[42, 55, 48, 63, 58, 74].map((h, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-primary"
                      style={{ height: `${h}%`, opacity: 0.35 + i * 0.13 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <p className="kicker mb-3">Everything the old tools make you do by hand</p>
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">
            Four modules. Zero data entry.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="surface group p-6 transition-colors hover:border-primary/40">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="font-display mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            From statement to ledger in one review.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="surface p-6">
                <div className="flex items-center justify-between">
                  <s.icon className="h-6 w-6 text-primary" />
                  <span className="font-display text-sm font-semibold text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-display mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* compare */}
      <section id="compare" className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Built to replace the old guard.
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            The depth of a desktop ERP, the polish of a modern cloud app, and an AI layer
            neither of them has.
          </p>
          <div className="surface mt-10 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Capability</th>
                  <th className="px-5 py-3.5 font-display font-semibold text-primary">Quantum</th>
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Desktop ERPs</th>
                  <th className="px-5 py-3.5 font-medium text-muted-foreground">Legacy cloud books</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, us, desktop, cloud]) => (
                  <tr key={label} className="border-b last:border-0">
                    <td className="px-5 py-3">{label}</td>
                    {[us, desktop, cloud].map((v, i) => (
                      <td key={i} className="px-5 py-3">
                        {v ? (
                          <Check className={`h-4 w-4 ${i === 0 ? "text-primary" : "text-muted-foreground"}`} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 md:px-6 md:py-24">
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-tight md:text-5xl">
            Close this month's books today.
          </h2>
          <Button size="lg" onClick={cta}>
            {user ? "Open your dashboard" : "Get started free"}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Demo workspace loads automatically — explore every feature with realistic data.
          </p>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground md:px-6">
          <span>
            Quantum<span className="text-primary">Accounting</span> — accounting that does itself
          </span>
          <Link to="/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
