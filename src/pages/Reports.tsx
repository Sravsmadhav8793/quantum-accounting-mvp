import { PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { formatMoney } from "@contracts/currencies";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function Cell({ value, currency, bold = false, tone }: { value: number; currency: string; bold?: boolean; tone?: "pos" | "neg" }) {
  return (
    <td
      className={`tnum whitespace-nowrap px-4 py-2.5 text-right ${bold ? "font-semibold" : ""} ${
        tone === "pos" ? "text-primary" : tone === "neg" ? "text-[hsl(var(--danger))]" : ""
      }`}
    >
      {formatMoney(value, currency)}
    </td>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ProfitLoss({ months }: { months: number }) {
  const pl = trpc.reports.profitLoss.useQuery({ months });
  if (pl.isLoading) return <Skeleton className="h-96" />;
  if (!pl.data) return null;
  const d = pl.data;

  const exportCsv = () => {
    const rows: string[][] = [["Profit & Loss", ...d.months]];
    rows.push(["Revenue"]);
    d.revenueRows.forEach((r) => rows.push([r.category, ...r.values.map(String)]));
    rows.push(["Total revenue", ...d.revenueTotals.map(String)]);
    rows.push(["Expenses"]);
    d.expenseRows.forEach((r) => rows.push([r.category, ...r.values.map(String)]));
    rows.push(["Total expenses", ...d.expenseTotals.map(String)]);
    rows.push(["Net profit", ...d.netTotals.map(String)]);
    downloadCsv("profit-and-loss.csv", rows);
    toast.success("P&L exported as CSV");
  };

  const section = (title: string, rows: typeof d.revenueRows, totals: number[], totalLabel: string) => (
    <>
      <tr className="border-b bg-secondary/50">
        <td className="px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-wider" colSpan={d.months.length + 2}>
          {title}
        </td>
      </tr>
      {rows.length === 0 ? (
        <tr className="border-b">
          <td className="px-4 py-2.5 text-muted-foreground" colSpan={d.months.length + 2}>
            No entries in this period
          </td>
        </tr>
      ) : (
        rows.map((r) => (
          <tr key={r.category} className="border-b hover:bg-secondary/30">
            <td className="px-4 py-2.5">{r.category}</td>
            {r.values.map((v, i) => (
              <Cell key={i} value={v} currency={d.baseCurrency} />
            ))}
            <Cell value={r.total} currency={d.baseCurrency} bold />
          </tr>
        ))
      )}
      <tr className="border-b font-medium">
        <td className="px-4 py-2.5">{totalLabel}</td>
        {totals.map((v, i) => (
          <Cell key={i} value={v} currency={d.baseCurrency} bold />
        ))}
        <Cell value={totals.reduce((a, b) => a + b, 0)} currency={d.baseCurrency} bold />
      </tr>
    </>
  );

  return (
    <div className="surface overflow-hidden">
      <div className="flex justify-end border-b p-3">
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Category</th>
              {d.months.map((m) => (
                <th key={m} className="px-4 py-3 text-right font-medium">
                  {m}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {section("Revenue", d.revenueRows, d.revenueTotals, "Total revenue")}
            {section("Expenses", d.expenseRows, d.expenseTotals, "Total expenses")}
            <tr className="bg-primary/5">
              <td className="px-4 py-3 font-display font-semibold">Net profit</td>
              {d.netTotals.map((v, i) => (
                <Cell key={i} value={v} currency={d.baseCurrency} bold tone={v >= 0 ? "pos" : "neg"} />
              ))}
              <Cell
                value={d.netTotals.reduce((a, b) => a + b, 0)}
                currency={d.baseCurrency}
                bold
                tone={d.netTotals.reduce((a, b) => a + b, 0) >= 0 ? "pos" : "neg"}
              />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BalanceSheet() {
  const bs = trpc.reports.balanceSheet.useQuery();
  if (bs.isLoading) return <Skeleton className="h-72" />;
  if (!bs.data) return null;
  const d = bs.data;
  return (
    <div className="surface max-w-2xl overflow-hidden">
      <div className="border-b px-5 py-4">
        <p className="text-xs text-muted-foreground">
          As of {new Date(d.asOf).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · simplified,
          derived from your ledger
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b bg-secondary/50">
            <td className="px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-wider" colSpan={2}>
              Assets
            </td>
          </tr>
          {d.assets.map((a) => (
            <tr key={a.label} className="border-b">
              <td className="px-5 py-2.5">{a.label}</td>
              <td className="tnum px-5 py-2.5 text-right">{formatMoney(a.amount, d.baseCurrency)}</td>
            </tr>
          ))}
          <tr className="border-b font-medium">
            <td className="px-5 py-2.5">Total assets</td>
            <td className="tnum px-5 py-2.5 text-right font-semibold">{formatMoney(d.totalAssets, d.baseCurrency)}</td>
          </tr>
          <tr className="border-b bg-secondary/50">
            <td className="px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-wider" colSpan={2}>
              Liabilities
            </td>
          </tr>
          <tr className="border-b">
            <td className="px-5 py-2.5 text-muted-foreground">None recorded</td>
            <td className="tnum px-5 py-2.5 text-right text-muted-foreground">{formatMoney(0, d.baseCurrency)}</td>
          </tr>
          <tr className="border-b bg-secondary/50">
            <td className="px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-wider" colSpan={2}>
              Equity
            </td>
          </tr>
          {d.equityRows.map((r) => (
            <tr key={r.label} className="border-b">
              <td className="px-5 py-2.5">{r.label}</td>
              <td className="tnum px-5 py-2.5 text-right">{formatMoney(r.amount, d.baseCurrency)}</td>
            </tr>
          ))}
          <tr className="bg-primary/5">
            <td className="px-5 py-3 font-display font-semibold">Net assets / equity</td>
            <td className="tnum px-5 py-3 text-right font-display font-semibold text-primary">
              {formatMoney(d.equity, d.baseCurrency)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CashFlow({ months }: { months: number }) {
  const cf = trpc.reports.cashFlow.useQuery({ months });
  if (cf.isLoading) return <Skeleton className="h-96" />;
  if (!cf.data) return null;
  const d = cf.data;
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Month</th>
              <th className="px-5 py-3 text-right font-medium">Money in</th>
              <th className="px-5 py-3 text-right font-medium">Money out</th>
              <th className="px-5 py-3 text-right font-medium">Owner capital</th>
              <th className="px-5 py-3 text-right font-medium">Net</th>
              <th className="px-5 py-3 text-right font-medium">Closing balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b text-muted-foreground">
              <td className="px-5 py-2.5">Opening balance</td>
              <td />
              <td />
              <td />
              <td />
              <td className="tnum px-5 py-2.5 text-right">{formatMoney(d.opening, d.baseCurrency)}</td>
            </tr>
            {d.rows.map((r) => (
              <tr key={r.month} className="border-b last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-2.5 font-medium">{r.month}</td>
                <td className="tnum px-5 py-2.5 text-right text-primary">{formatMoney(r.inflow, d.baseCurrency)}</td>
                <td className="tnum px-5 py-2.5 text-right">{formatMoney(r.outflow, d.baseCurrency)}</td>
                <td className="tnum px-5 py-2.5 text-right text-muted-foreground">
                  {r.financing !== 0 ? formatMoney(r.financing, d.baseCurrency) : "—"}
                </td>
                <td
                  className={`tnum px-5 py-2.5 text-right font-medium ${
                    r.net >= 0 ? "text-primary" : "text-[hsl(var(--danger))]"
                  }`}
                >
                  {r.net >= 0 ? "+" : ""}
                  {formatMoney(r.net, d.baseCurrency)}
                </td>
                <td className="tnum px-5 py-2.5 text-right">{formatMoney(r.closing, d.baseCurrency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Reports() {
  const [months, setMonths] = useState(6);
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Computed live from the ledger — no month-end closing ritual required."
        actions={
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <Tabs defaultValue="pnl">
        <TabsList className="mb-4">
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cf">Cash Flow</TabsTrigger>
        </TabsList>
        <TabsContent value="pnl">
          <ProfitLoss months={months} />
        </TabsContent>
        <TabsContent value="bs">
          <BalanceSheet />
        </TabsContent>
        <TabsContent value="cf">
          <CashFlow months={months} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
