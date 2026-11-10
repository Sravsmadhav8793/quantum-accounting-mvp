import { AiError, Money, PageHeader, StatusBadge, fmtDate, toISODate } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { EXPENSE_CATEGORIES } from "@contracts/categories";
import { CURRENCIES, formatMoneyCompact } from "@contracts/currencies";
import { CheckCircle2, Plus, Receipt, ScanLine, Sparkles, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type ExpenseForm = {
  merchant: string;
  date: string;
  amount: string;
  currency: string;
  category: string;
  notes: string;
};

const EMPTY_FORM: ExpenseForm = {
  merchant: "",
  date: toISODate(new Date()),
  amount: "",
  currency: "USD",
  category: "Uncategorized",
  notes: "",
};

/** Downscale the image before sending — keeps OCR fast and payloads small. */
function fileToDataUrl(file: File, maxDim = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = URL.createObjectURL(file);
  });
}

function ExpenseDialog({
  open,
  onClose,
  initial,
  source,
  ocrConfidence,
  previewUrl,
}: {
  open: boolean;
  onClose: () => void;
  initial: ExpenseForm;
  source: "manual" | "ocr";
  ocrConfidence?: number;
  previewUrl?: string | null;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<ExpenseForm>(initial);
  const [loadedKey, setLoadedKey] = useState<string>("");
  const key = JSON.stringify(initial) + source;
  if (open && loadedKey !== key) {
    setForm(initial);
    setLoadedKey(key);
  }

  const create = trpc.expenses.create.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(vars.approve ? "Expense approved and posted to the ledger" : "Expense saved as draft");
      utils.expenses.list.invalidate();
      utils.dashboard.invalidate();
      utils.reports.invalidate();
      utils.transactions.list.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (approve: boolean) => {
    if (!form.merchant.trim()) return toast.error("Merchant is required");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid amount");
    create.mutate({
      merchant: form.merchant.trim(),
      date: new Date(`${form.date}T12:00:00Z`),
      amount,
      currency: form.currency,
      category: form.category,
      notes: form.notes.trim() || undefined,
      source,
      ocrConfidence,
      approve,
    });
  };

  const set = (patch: Partial<ExpenseForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            {source === "ocr" ? (
              <>
                <Sparkles className="h-4 w-4 text-primary" />
                Review extracted receipt
                {ocrConfidence !== undefined ? (
                  <span className="tnum rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    {ocrConfidence}% confidence
                  </span>
                ) : null}
              </>
            ) : (
              "Add expense"
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Receipt preview"
              className="max-h-44 w-full rounded-lg border border-border object-contain bg-secondary"
            />
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="exp-merchant">Merchant</Label>
              <Input id="exp-merchant" value={form.merchant} onChange={(e) => set({ merchant: e.target.value })} className="mt-1.5" placeholder="e.g. Blue Bottle Coffee" />
            </div>
            <div>
              <Label htmlFor="exp-date">Date</Label>
              <Input id="exp-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="exp-amount">Amount</Label>
              <Input id="exp-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} className="mt-1.5 tnum" placeholder="0.00" />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger className="mt-1.5">
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
          <div>
            <Label htmlFor="exp-notes">Notes (optional)</Label>
            <Textarea id="exp-notes" value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="mt-1.5 min-h-16" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => submit(false)} disabled={create.isPending}>
            Save as draft
          </Button>
          <Button onClick={() => submit(true)} disabled={create.isPending}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {create.isPending ? "Saving…" : "Approve & post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const utils = trpc.useUtils();
  const list = trpc.expenses.list.useQuery();
  const settings = trpc.settings.get.useQuery();
  const base = settings.data?.baseCurrency ?? "USD";
  const fileRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [initial, setInitial] = useState<ExpenseForm>(EMPTY_FORM);
  const [source, setSource] = useState<"manual" | "ocr">("manual");
  const [confidence, setConfidence] = useState<number | undefined>();
  const [preview, setPreview] = useState<string | null>(null);

  const scan = trpc.expenses.scan.useMutation();

  const approve = trpc.expenses.approve.useMutation({
    onSuccess: () => {
      toast.success("Expense posted to the ledger");
      utils.expenses.list.invalidate();
      utils.dashboard.invalidate();
      utils.reports.invalidate();
      utils.transactions.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.expenses.remove.useMutation({
    onSuccess: () => {
      toast.success("Expense deleted");
      utils.expenses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const openManual = () => {
    setInitial({ ...EMPTY_FORM, currency: base });
    setSource("manual");
    setConfidence(undefined);
    setPreview(null);
    setDialogOpen(true);
  };

  const handleReceipt = async (file: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error("Use a PNG, JPG or WebP image of the receipt");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      scan.mutate(
        { imageDataUrl: dataUrl },
        {
          onSuccess: (d) => {
            setInitial({
              merchant: d.merchant,
              date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : toISODate(new Date()),
              amount: String(d.amount),
              currency: CURRENCIES.some((c) => c.code === d.currency) ? d.currency : base,
              category: d.category,
              notes: d.summary,
            });
            setSource("ocr");
            setConfidence(Math.round(d.confidence));
            setDialogOpen(true);
          },
        },
      );
    } catch {
      toast.error("Could not process that image");
    }
  };

  const rows = list.data ?? [];
  const drafts = rows.filter((r) => r.status === "draft");
  const monthTotal = rows
    .filter((r) => {
      const now = new Date();
      return r.date.getUTCMonth() === now.getUTCMonth() && r.date.getUTCFullYear() === now.getUTCFullYear();
    })
    .reduce((s, r) => s + Number(r.baseAmount), 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Snap receipts — the AI reads them. Approve drafts to post them to the ledger."
        actions={
          <>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={scan.isPending}>
              <ScanLine className="mr-1.5 h-4 w-4" />
              {scan.isPending ? "Reading receipt…" : "Scan receipt"}
            </Button>
            <Button onClick={openManual}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add expense
            </Button>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleReceipt(f);
          e.target.value = "";
        }}
      />

      {scan.isPending ? (
        <div className="surface mb-4 flex items-center gap-3 p-4">
          <Sparkles className="h-5 w-5 animate-pulse text-primary" />
          <div>
            <p className="text-sm font-medium">AI is reading your receipt…</p>
            <p className="text-xs text-muted-foreground">Extracting merchant, date, total and category.</p>
          </div>
        </div>
      ) : null}
      {scan.isError ? (
        <div className="mb-4">
          <AiError
            message={scan.error.message}
            onRetry={() => fileRef.current?.click()}
          />
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="kicker">This month</p>
          <p className="tnum mt-1 font-display text-xl font-semibold">{formatMoneyCompact(monthTotal, base)}</p>
        </div>
        <div className="surface p-4">
          <p className="kicker">Awaiting approval</p>
          <p className="tnum mt-1 font-display text-xl font-semibold">
            {drafts.length} <span className="text-sm font-normal text-muted-foreground">drafts</span>
          </p>
        </div>
        <div className="surface p-4">
          <p className="kicker">Total receipts</p>
          <p className="tnum mt-1 font-display text-xl font-semibold">{rows.length}</p>
        </div>
      </div>

      <div className="surface overflow-hidden">
        {list.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No expenses yet — scan a receipt or add one manually.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Merchant</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-secondary/40">
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtDate(e.date)}</td>
                    <td className="max-w-52 px-5 py-3">
                      <span className="block truncate font-medium">{e.merchant}</span>
                      {e.notes ? <span className="block truncate text-xs text-muted-foreground">{e.notes}</span> : null}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{e.category}</td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-right">
                      <Money amount={Number(e.amount)} currency={e.currency} className="font-medium" />
                    </td>
                    <td className="px-5 py-3">
                      {e.source === "ocr" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Sparkles className="h-3.5 w-3.5" />
                          OCR{e.ocrConfidence ? ` · ${e.ocrConfidence}%` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {e.status === "draft" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => approve.mutate({ id: e.id })}>
                              Approve
                            </Button>
                            <button
                              onClick={() => remove.mutate({ id: e.id })}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[hsl(var(--danger))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Delete expense from ${e.merchant}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExpenseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initial={initial}
        source={source}
        ocrConfidence={confidence}
        previewUrl={preview}
      />
    </div>
  );
}
