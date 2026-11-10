import { ConfidenceBadge, EmptyState, Money, PageHeader, StatusBadge, fmtDate } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { CATEGORY_NAMES } from "@contracts/categories";
import { CURRENCIES } from "@contracts/currencies";
import {
  ArrowLeft,
  CheckCheck,
  FileSpreadsheet,
  Landmark,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

/* ---------------- upload card ---------------- */

function UploadCard({ onDone }: { onDone: (batchId: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currency, setCurrency] = useState("USD");
  const [dragOver, setDragOver] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const upload = trpc.imports.upload.useMutation({
    onSuccess: (d) => {
      toast.success(
        `${d.rowCount} transactions read — ${d.aiUsed ? "AI categorized the tricky ones" : "categorized by rules"}` +
          (d.skipped ? ` (${d.skipped} rows skipped)` : ""),
      );
      if (d.aiError) toast.warning(`AI pass skipped: ${d.aiError}`);
      onDone(d.batchId);
    },
    onError: (e) => {
      setBusyLabel(null);
      toast.error(e.message);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
        toast.error("Upload a CSV or TSV export from your bank");
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        toast.error("File too large — keep it under 4 MB");
        return;
      }
      setBusyLabel("Reading statement…");
      const reader = new FileReader();
      reader.onload = () => {
        setBusyLabel("AI is categorizing transactions…");
        upload.mutate({ filename: file.name, content: String(reader.result ?? ""), currency });
      };
      reader.onerror = () => {
        setBusyLabel(null);
        toast.error("Could not read that file");
      };
      reader.readAsText(file);
    },
    [currency, upload],
  );

  return (
    <div className="surface p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">New statement import</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            CSV / TSV export from any bank — the AI reads every line and suggests the right category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Statement currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <button
        type="button"
        disabled={busyLabel !== null}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/40"
        } ${busyLabel ? "opacity-70" : ""}`}
      >
        {busyLabel ? (
          <>
            <Sparkles className="h-8 w-8 animate-pulse text-primary" />
            <p className="text-sm font-medium">{busyLabel}</p>
            <p className="text-xs text-muted-foreground">Large statements take a few seconds.</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drop your bank statement here, or <span className="text-primary">browse</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Date + description + amount columns are detected automatically. Debit/credit columns supported.
            </p>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ---------------- batch list ---------------- */

function BatchList() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const batches = trpc.imports.listBatches.useQuery();
  const remove = trpc.imports.remove.useMutation({
    onSuccess: () => {
      utils.imports.listBatches.invalidate();
      toast.success("Import deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Bank Import"
        description="Upload statements, let the AI categorize every line, review, approve — done."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <UploadCard onDone={(id) => navigate(`/import/${id}`)} />
        </div>
        <div className="lg:col-span-2">
          <div className="surface p-5">
            <h2 className="font-display mb-4 text-sm font-semibold">Recent imports</h2>
            {batches.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (batches.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing imported yet. Your first statement usually takes under a minute to process.
              </p>
            ) : (
              <ul className="space-y-2">
                {batches.data?.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <button
                      onClick={() => navigate(`/import/${b.id}`)}
                      className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      <span className="block truncate text-sm font-medium hover:text-primary">{b.filename}</span>
                      <span className="tnum block text-xs text-muted-foreground">
                        {b.approvedCount}/{b.rowCount} approved · {fmtDate(b.createdAt)}
                      </span>
                    </button>
                    <StatusBadge status={b.status} />
                    {b.approvedCount === 0 ? (
                      <button
                        onClick={() => remove.mutate({ batchId: b.id })}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[hsl(var(--danger))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Delete import"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- review queue ---------------- */

function BatchReview({ batchId }: { batchId: number }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const detail = trpc.imports.getBatch.useQuery({ batchId });
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const invalidateAll = () => {
    utils.imports.getBatch.invalidate({ batchId });
    utils.imports.listBatches.invalidate();
    utils.transactions.list.invalidate();
    utils.dashboard.invalidate();
    utils.reports.invalidate();
  };

  const setRow = trpc.imports.setRow.useMutation({
    onSuccess: () => utils.imports.getBatch.invalidate({ batchId }),
    onError: (e) => toast.error(e.message),
  });
  const approve = trpc.imports.approve.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.approved} entries posted to the ledger`);
      setSelected(new Set());
      invalidateAll();
    },
    onError: (e) => toast.error(e.message),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <EmptyState
        icon={<Landmark className="h-6 w-6" />}
        title="Import not found"
        action={
          <Button variant="outline" asChild>
            <Link to="/import">Back to imports</Link>
          </Button>
        }
      />
    );
  }

  const { batch, rows } = detail.data;
  const pending = rows.filter((r) => r.status === "pending");
  const approvedCount = rows.filter((r) => r.status === "approved").length;
  const progress = rows.length === 0 ? 100 : Math.round((approvedCount / rows.length) * 100);
  const allSelected = pending.length > 0 && pending.every((r) => selected.has(r.id));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate("/import")}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft className="h-4 w-4" />
          All imports
        </button>
        <PageHeader
          title={batch.filename}
          description={`${batch.rowCount} lines read · review the AI's suggestions, fix anything, then approve.`}
          actions={
            <>
              <Button
                variant="outline"
                disabled={selected.size === 0 || approve.isPending}
                onClick={() => approve.mutate({ batchId, rowIds: [...selected] })}
              >
                Approve selected ({selected.size})
              </Button>
              <Button
                disabled={pending.length === 0 || approve.isPending}
                onClick={() => approve.mutate({ batchId })}
              >
                <CheckCheck className="mr-1.5 h-4 w-4" />
                {approve.isPending ? "Posting…" : `Approve all ${pending.length} remaining`}
              </Button>
            </>
          }
        />
      </div>

      {/* progress */}
      <div className="surface mb-4 p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="tnum text-muted-foreground">
            {approvedCount} posted · {pending.length} awaiting review · {rows.length - approvedCount - pending.length} rejected
          </span>
          <span className="tnum font-medium text-primary">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        {progress === 100 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-primary">
            <CheckCheck className="h-4 w-4" />
            This statement is fully reconciled — every line is in your books.
          </p>
        ) : null}
      </div>

      {/* rows */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => setSelected(v ? new Set(pending.map((r) => r.id)) : new Set())}
                    aria-label="Select all pending rows"
                  />
                </th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Narration</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">AI suggestion</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isPending = r.status === "pending";
                return (
                  <tr key={r.id} className={`border-b last:border-0 ${isPending ? "hover:bg-secondary/40" : "opacity-60"}`}>
                    <td className="px-4 py-2.5">
                      {isPending ? (
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                          aria-label={`Select row ${r.description}`}
                        />
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{fmtDate(r.date)}</td>
                    <td className="max-w-64 px-3 py-2.5">
                      <span className="block truncate" title={r.description}>
                        {r.description}
                      </span>
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-2.5 text-right">
                      <Money amount={Number(r.amount)} currency={r.currency} signed className="font-medium" />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-xs">
                        {r.categorizedBy === "ai" ? (
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        ) : null}
                        {r.suggestedCategory}
                        <ConfidenceBadge confidence={r.confidence} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isPending ? (
                        <Select
                          value={r.finalCategory ?? r.suggestedCategory}
                          onValueChange={(v) => setRow.mutate({ rowId: r.id, finalCategory: v })}
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_NAMES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.finalCategory ?? r.suggestedCategory}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isPending ? (
                        <button
                          onClick={() => setRow.mutate({ rowId: r.id, status: "rejected" })}
                          className="text-xs font-medium text-muted-foreground transition-colors hover:text-[hsl(var(--danger))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          Reject
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function BankImport() {
  const { batchId } = useParams<{ batchId: string }>();
  if (batchId) return <BatchReview batchId={Number(batchId)} />;
  return <BatchList />;
}
