import { AiError, Money, PageHeader, fmtDate } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { formatMoneyCompact } from "@contracts/currencies";
import { Link } from "react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Hourglass,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#00d9a3", "#38bdf8", "#f5b942", "#ff8562", "#a78bfa", "#f472b6", "#94a3b8"];

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  const Icon = pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium tnum ${
        good ? "text-primary" : "text-[hsl(var(--danger))]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function Dashboard() {
  const utils = trpc.useUtils();
  const summary = trpc.dashboard.summary.useQuery();
  const cashFlow = trpc.dashboard.cashFlow.useQuery({ months: 6 });
  const breakdown = trpc.dashboard.expenseBreakdown.useQuery({ days: 90 });
  const receivables = trpc.dashboard.receivables.useQuery();
  const recent = trpc.dashboard.recent.useQuery({ limit: 8 });
  const insight = trpc.dashboard.insight.useMutation();
  const [insightText, setInsightText] = useState<string | null>(null);

  const base = summary.data?.baseCurrency ?? "USD";

  const runInsight = () => {
    insight.mutate(undefined, {
      onSuccess: (d) => setInsightText(d.text),
    });
  };

  if (summary.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your books, live. Everything below is computed from the ledger right now."
        actions={
          <Button variant="outline" size="sm" onClick={() => utils.invalidate()}>
            Refresh
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <p className="kicker">Cash on hand</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="tnum mt-2 font-display text-2xl font-semibold">
            {s ? formatMoneyCompact(s.cash, base) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s?.transactionCount ?? 0} posted entries
          </p>
        </div>
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <p className="kicker">Revenue · month to date</p>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="tnum mt-2 font-display text-2xl font-semibold text-primary">
            {s ? formatMoneyCompact(s.revenueMtd, base) : "—"}
          </p>
          <div className="mt-1">{s ? <Delta current={s.revenueMtd} previous={s.revenuePrev} /> : null}</div>
        </div>
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <p className="kicker">Expenses · month to date</p>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="tnum mt-2 font-display text-2xl font-semibold">
            {s ? formatMoneyCompact(s.expensesMtd, base) : "—"}
          </p>
          <div className="mt-1">{s ? <Delta current={s.expensesMtd} previous={s.expensesPrev} invert /> : null}</div>
        </div>
        <div className="surface p-5">
          <div className="flex items-center justify-between">
            <p className="kicker">Runway</p>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="tnum mt-2 font-display text-2xl font-semibold">
            {s?.runwayMonths != null ? `${s.runwayMonths} mo` : "profitable"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {s && s.monthlyBurn > 0 ? `burn ${formatMoneyCompact(s.monthlyBurn, base)}/mo` : "spend covered by revenue"}
          </p>
        </div>
      </div>

      {/* charts row */}
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <div className="surface min-w-0 p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Cash flow — last 6 months</h2>
            <Link to="/reports" className="text-xs font-medium text-primary hover:underline">
              Full report
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlow.data ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d9a3" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00d9a3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(0 0% 14%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "hsl(220 9% 62%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "hsl(220 9% 62%)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatMoneyCompact(v, base)}
                  width={70}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(0 0% 8.5%)", border: "1px solid hsl(0 0% 14%)", borderRadius: 10 }}
                  labelStyle={{ color: "hsl(0 0% 96%)" }}
                  formatter={(value: number, name: string) => [formatMoneyCompact(value, base), name]}
                />
                <Area type="monotone" dataKey="inflow" name="Money in" stroke="#00d9a3" strokeWidth={2} fill="url(#inflow)" />
                <Area type="monotone" dataKey="outflow" name="Money out" stroke="#ff8562" strokeWidth={2} fill="transparent" strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface min-w-0 p-5 xl:col-span-2">
          <h2 className="font-display mb-4 text-sm font-semibold">Where the money went — 90 days</h2>
          <div className="flex items-center gap-4">
            <div className="h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={(breakdown.data ?? []).slice(0, 6)}
                    dataKey="total"
                    nameKey="category"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {(breakdown.data ?? []).slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(0 0% 8.5%)", border: "1px solid hsl(0 0% 14%)", borderRadius: 10 }}
                    formatter={(value: number) => formatMoneyCompact(value, base)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {(breakdown.data ?? []).slice(0, 6).map((row, i) => (
                <li key={row.category} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="truncate text-muted-foreground">{row.category}</span>
                  <span className="tnum ml-auto font-medium">{formatMoneyCompact(row.total, base)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* receivables + recent + AI */}
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <div className="surface min-w-0 p-5 xl:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Receivables aging</h2>
            <Link to="/invoices" className="text-xs font-medium text-primary hover:underline">
              Invoices
            </Link>
          </div>
          <p className="tnum mb-4 text-xs text-muted-foreground">
            {s ? (
              <>
                <span className="text-foreground">{formatMoneyCompact(s.receivables, base)}</span> outstanding ·{" "}
                <span className={s.overdueAmount > 0 ? "text-[hsl(var(--danger))]" : ""}>
                  {formatMoneyCompact(s.overdueAmount, base)} overdue
                </span>
              </>
            ) : null}
          </p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={receivables.data ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="hsl(0 0% 14%)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(220 9% 62%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "hsl(220 9% 62%)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatMoneyCompact(v, base)}
                  width={64}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(0 0% 8.5%)", border: "1px solid hsl(0 0% 14%)", borderRadius: 10 }}
                  formatter={(value: number) => [formatMoneyCompact(value, base), "Outstanding"]}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {(receivables.data ?? []).map((_, i) => (
                    <Cell key={i} fill={["#00d9a3", "#f5b942", "#ff8562", "#ff5c5c"][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface min-w-0 p-5 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Recent activity</h2>
            <Link to="/transactions" className="text-xs font-medium text-primary hover:underline">
              All transactions
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {(recent.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.description}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fmtDate(t.date)} · {t.category}
                  </span>
                </span>
                <Money amount={Number(t.baseAmount)} currency={base} signed className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* AI insight */}
      <div className="surface mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">AI bookkeeper insight</h2>
          </div>
          <Button size="sm" variant="outline" onClick={runInsight} disabled={insight.isPending}>
            {insight.isPending ? "Analyzing…" : insightText ? "Regenerate" : "Generate insight"}
          </Button>
        </div>
        {insight.isError ? (
          <div className="mt-3">
            <AiError message={insight.error.message} onRetry={runInsight} />
          </div>
        ) : insightText ? (
          <div className="mt-3 space-y-1.5">
            {insightText
              .split("\n")
              .filter((l) => l.trim())
              .map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {line.replace(/^[-•*\d.)\s]+/, "")}
                </p>
              ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            One click and the AI reads your ledger — cash position, burn, runway and where to chase money.
          </p>
        )}
      </div>
    </div>
  );
}
