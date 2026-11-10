import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@contracts/currencies";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Money({
  amount,
  currency,
  signed = false,
  className = "",
}: {
  amount: number;
  currency: string;
  signed?: boolean;
  className?: string;
}) {
  const positive = amount >= 0;
  return (
    <span className={`tnum ${signed ? (positive ? "text-primary" : "text-foreground") : ""} ${className}`}>
      {signed && positive ? "+" : ""}
      {formatMoney(amount, currency)}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  paid: "border-transparent bg-primary/15 text-primary",
  sent: "border-transparent bg-[hsl(var(--info)/0.15)] text-[hsl(var(--info))]",
  overdue: "border-transparent bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]",
  draft: "border-border bg-secondary text-muted-foreground",
  void: "border-border bg-secondary text-muted-foreground line-through",
  approved: "border-transparent bg-primary/15 text-primary",
  pending: "border-transparent bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  rejected: "border-border bg-secondary text-muted-foreground",
  review: "border-transparent bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  completed: "border-transparent bg-primary/15 text-primary",
  posted: "border-transparent bg-primary/15 text-primary",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {status}
    </Badge>
  );
}

export function ConfidenceBadge({ confidence, by }: { confidence: number; by?: string }) {
  const tone =
    confidence >= 85
      ? "bg-primary/15 text-primary"
      : confidence >= 60
        ? "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]"
        : "bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tnum ${tone}`}>
      {by === "ai" ? <Sparkles className="h-3 w-3" /> : null}
      {confidence}%
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export function AiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.08)] px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
      <div className="flex-1">
        <p className="font-medium">AI feature temporarily unavailable</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
