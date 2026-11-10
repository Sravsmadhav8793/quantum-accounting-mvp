import { Money, PageHeader, StatusBadge, fmtDate, toISODate } from "@/components/kit";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/providers/trpc";
import { CATEGORY_NAMES } from "@contracts/categories";
import { CURRENCIES, formatMoney } from "@contracts/currencies";
import { ArrowLeftRight, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function AddTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();
  const create = trpc.transactions.create.useMutation({
    onSuccess: () => {
      toast.success("Transaction added to the ledger");
      utils.transactions.list.invalidate();
      utils.dashboard.invalidate();
      utils.reports.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const [date, setDate] = useState(toISODate(new Date()));
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("Uncategorized");
  const [counterparty, setCounterparty] = useState("");

  const base = settings.data?.baseCurrency ?? "USD";

  const submit = () => {
    const value = Number(amount);
    if (!description.trim()) return toast.error("Description is required");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a valid amount");
    create.mutate({
      date: new Date(`${date}T12:00:00Z`),
      description: description.trim(),
      amount: direction === "in" ? value : -value,
      currency,
      category,
      counterparty: counterparty.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add transaction</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-date">Date</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Money out</SelectItem>
                  <SelectItem value="in">Money in</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="tx-desc">Description</Label>
            <Input
              id="tx-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. AWS — cloud infrastructure"
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 tnum"
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1.5">
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
          </div>
          <div>
            <Label htmlFor="tx-cp">Counterparty (optional)</Label>
            <Input
              id="tx-cp"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="e.g. Amazon Web Services"
              className="mt-1.5"
            />
          </div>
          {currency !== base && Number(amount) > 0 ? (
            <p className="text-xs text-muted-foreground">
              Reported in your base currency ({base}) at the current reference rate.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Add to ledger"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "in" | "out">("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const list = trpc.transactions.list.useQuery({
    search: search || undefined,
    type,
    category: category === "all" ? undefined : category,
    months: 12,
    limit: 50,
    offset: page * 50,
  });
  const settings = trpc.settings.get.useQuery();
  const base = settings.data?.baseCurrency ?? "USD";

  const update = trpc.transactions.update.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.dashboard.invalidate();
      toast.success("Category updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.transactions.remove.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.dashboard.invalidate();
      utils.reports.invalidate();
      toast.success("Transaction deleted");
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="The ledger. Every approved import, invoice payment, expense and manual entry lands here."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add transaction
          </Button>
        }
      />

      {/* filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search descriptions…"
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as typeof type);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in">Money in</SelectItem>
            <SelectItem value="out">Money out</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_NAMES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* table */}
      <div className="surface overflow-hidden">
        {list.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (list.data?.rows.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <ArrowLeftRight className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No transactions match these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-right font-medium">In {base}</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.data?.rows.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-secondary/40">
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtDate(t.date)}</td>
                    <td className="max-w-72 px-5 py-3">
                      <span className="block truncate">{t.description}</span>
                      {t.counterparty ? (
                        <span className="block truncate text-xs text-muted-foreground">{t.counterparty}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        value={t.category}
                        onValueChange={(v) => update.mutate({ id: t.id, category: v })}
                      >
                        <SelectTrigger className="h-8 w-44 border-transparent bg-transparent text-xs hover:border-input">
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
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={t.source === "seed" ? "posted" : t.source} />
                    </td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-right">
                      <Money amount={Number(t.amount)} currency={t.currency} signed className="font-medium" />
                    </td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-right text-muted-foreground">
                      {t.currency === base ? "—" : formatMoney(Number(t.baseAmount), base)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => setDeleteId(t.id)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[hsl(var(--danger))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Delete transaction"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span className="tnum">
          {total} entries · page {page + 1} of {pages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from the ledger and all reports update immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && remove.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
