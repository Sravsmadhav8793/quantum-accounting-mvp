import { AiError, PageHeader, StatusBadge, fmtDate, toISODate } from "@/components/kit";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CURRENCIES, formatMoney, formatMoneyCompact } from "@contracts/currencies";
import {
  Ban,
  CheckCircle2,
  Copy,
  FileText,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type LineItem = { description: string; quantity: string; unitPrice: string };

function InvoiceEditor({
  open,
  onClose,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  editId: number | null;
}) {
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();
  const existing = trpc.invoices.get.useQuery({ id: editId! }, { enabled: editId !== null });

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [issueDate, setIssueDate] = useState(toISODate(new Date()));
  const [dueDate, setDueDate] = useState(toISODate(new Date(Date.now() + 30 * 86_400_000)));
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [sendNow, setSendNow] = useState(false);
  const [loadedFor, setLoadedFor] = useState<number | "new" | null>(null);

  // hydrate when editing
  if (open && editId !== null && existing.data && loadedFor !== editId) {
    const { invoice, items: its } = existing.data;
    setClientName(invoice.clientName);
    setClientEmail(invoice.clientEmail ?? "");
    setCurrency(invoice.currency);
    setIssueDate(toISODate(invoice.issueDate));
    setDueDate(toISODate(invoice.dueDate));
    setTaxRate(String(Number(invoice.taxRate)));
    setNotes(invoice.notes ?? "");
    setItems(
      its.map((it) => ({
        description: it.description,
        quantity: String(Number(it.quantity)),
        unitPrice: String(Number(it.unitPrice)),
      })),
    );
    setLoadedFor(editId);
  }
  if (open && editId === null && loadedFor !== "new") {
    setClientName("");
    setClientEmail("");
    setCurrency(settings.data?.baseCurrency ?? "USD");
    setIssueDate(toISODate(new Date()));
    setDueDate(toISODate(new Date(Date.now() + 30 * 86_400_000)));
    setTaxRate(String(Number(settings.data?.defaultTaxRate ?? 0)));
    setNotes("");
    setItems([{ description: "", quantity: "1", unitPrice: "" }]);
    setSendNow(false);
    setLoadedFor("new");
  }

  const invalidate = () => {
    utils.invoices.list.invalidate();
    utils.dashboard.invalidate();
    utils.reports.invalidate();
  };

  const create = trpc.invoices.create.useMutation({
    onSuccess: (d) => {
      toast.success(`Invoice ${d.number} ${sendNow ? "sent" : "saved as draft"}`);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.invoices.update.useMutation({
    onSuccess: () => {
      toast.success("Invoice updated");
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
    const tax = subtotal * ((Number(taxRate) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxRate]);

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const submit = () => {
    if (!clientName.trim()) return toast.error("Client name is required");
    const cleanItems = items
      .filter((it) => it.description.trim() && Number(it.unitPrice) >= 0 && Number(it.quantity) > 0)
      .map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      }));
    if (cleanItems.length === 0) return toast.error("Add at least one line item");
    const payload = {
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      currency,
      issueDate: new Date(`${issueDate}T12:00:00Z`),
      dueDate: new Date(`${dueDate}T12:00:00Z`),
      taxRate: Number(taxRate) || 0,
      notes: notes.trim() || undefined,
      items: cleanItems,
    };
    if (editId !== null) update.mutate({ id: editId, ...payload });
    else create.mutate({ ...payload, sendImmediately: sendNow });
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">{editId !== null ? "Edit invoice" : "New invoice"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="inv-client">Client name</Label>
              <Input id="inv-client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Corp" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inv-email">Client email</Label>
              <Input id="inv-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="ap@acme.com" className="mt-1.5" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
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
            <div>
              <Label htmlFor="inv-issue">Issue date</Label>
              <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inv-due">Due date</Label>
              <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="inv-tax">Tax %</Label>
              <Input id="inv-tax" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1.5 tnum" />
            </div>
          </div>

          {/* line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Line items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((p) => [...p, { description: "", quantity: "1", unitPrice: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add line
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_76px_110px_36px] items-center gap-2">
                  <Input
                    value={it.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                    placeholder="Description of work"
                    aria-label={`Line ${i + 1} description`}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: e.target.value })}
                    aria-label={`Line ${i + 1} quantity`}
                    className="tnum"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.unitPrice}
                    onChange={(e) => setItem(i, { unitPrice: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Line ${i + 1} unit price`}
                    className="tnum"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-[hsl(var(--danger))] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tnum">{formatMoney(totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax ({Number(taxRate) || 0}%)</span>
                <span className="tnum">{formatMoney(totals.tax, currency)}</span>
              </div>
              <div className="flex justify-between font-display text-base font-semibold">
                <span>Total</span>
                <span className="tnum text-primary">{formatMoney(totals.total, currency)}</span>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, bank details…" className="mt-1.5 min-h-20" />
          </div>

          {editId === null ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendNow}
                onChange={(e) => setSendNow(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              Mark as sent immediately
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : editId !== null ? "Save changes" : sendNow ? "Create & send" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const reminder = trpc.invoices.reminder.useMutation({
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    reminder.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const run = () => {
    if (invoiceId === null) return;
    reminder.mutate(
      { id: invoiceId },
      {
        onSuccess: () => {
          utils.invoices.list.invalidate();
          toast.success("Reminder drafted and logged");
        },
      },
    );
  };

  return (
    <Dialog open={invoiceId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI payment reminder
          </DialogTitle>
        </DialogHeader>
        {reminder.isPending ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-40" />
            <p className="text-xs text-muted-foreground">Drafting a polite-but-firm reminder…</p>
          </div>
        ) : reminder.isError ? (
          <AiError message={reminder.error.message} onRetry={run} />
        ) : reminder.data ? (
          <div className="space-y-3">
            <div>
              <p className="kicker mb-1">Subject</p>
              <p className="rounded-lg bg-secondary px-3 py-2 text-sm">{reminder.data.subject}</p>
            </div>
            <div>
              <p className="kicker mb-1">Body</p>
              <p className="whitespace-pre-wrap rounded-lg bg-secondary px-3 py-2 text-sm leading-relaxed">
                {reminder.data.body}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              The AI drafts a reminder email referencing the invoice number, amount and how overdue it is.
              It is also logged against the invoice.
            </p>
          </div>
        )}
        <DialogFooter>
          {reminder.data ? (
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  .writeText(`Subject: ${reminder.data!.subject}\n\n${reminder.data!.body}`)
                  .then(() => toast.success("Copied to clipboard"));
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              Copy email
            </Button>
          ) : null}
          {reminder.data ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <Button onClick={run} disabled={reminder.isPending}>
              {reminder.isPending ? "Drafting…" : "Draft reminder"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Invoices() {
  const utils = trpc.useUtils();
  const list = trpc.invoices.list.useQuery();
  const settings = trpc.settings.get.useQuery();
  const base = settings.data?.baseCurrency ?? "USD";

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [reminderId, setReminderId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const invalidate = () => {
    utils.invoices.list.invalidate();
    utils.dashboard.invalidate();
    utils.reports.invalidate();
    utils.transactions.list.invalidate();
  };

  const markSent = trpc.invoices.markSent.useMutation({
    onSuccess: () => {
      toast.success("Invoice sent");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const recordPayment = trpc.invoices.recordPayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded — revenue booked to the ledger");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setVoid = trpc.invoices.setVoid.useMutation({
    onSuccess: () => {
      toast.success("Invoice voided");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.invoices.remove.useMutation({
    onSuccess: () => {
      toast.success("Invoice deleted");
      invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = list.data ?? [];
  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const outstanding = rows
    .filter((r) => r.status === "sent" || r.status === "overdue")
    .reduce((s, r) => s + Number(r.baseTotal), 0);
  const overdue = rows
    .filter((r) => r.status === "overdue")
    .reduce((s, r) => s + Number(r.baseTotal), 0);
  const paidMonth = rows
    .filter((r) => {
      if (r.status !== "paid" || !r.paidAt) return false;
      const now = new Date();
      return r.paidAt.getUTCMonth() === now.getUTCMonth() && r.paidAt.getUTCFullYear() === now.getUTCFullYear();
    })
    .reduce((s, r) => s + Number(r.baseTotal), 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Multi-currency invoicing with automatic overdue tracking and AI-drafted reminders."
        actions={
          <Button
            onClick={() => {
              setEditId(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New invoice
          </Button>
        }
      />

      {/* summary strip */}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="kicker">Outstanding</p>
          <p className="tnum mt-1 font-display text-xl font-semibold">{formatMoneyCompact(outstanding, base)}</p>
        </div>
        <div className="surface p-4">
          <p className="kicker">Overdue</p>
          <p className={`tnum mt-1 font-display text-xl font-semibold ${overdue > 0 ? "text-[hsl(var(--danger))]" : ""}`}>
            {formatMoneyCompact(overdue, base)}
          </p>
        </div>
        <div className="surface p-4">
          <p className="kicker">Collected this month</p>
          <p className="tnum mt-1 font-display text-xl font-semibold text-primary">{formatMoneyCompact(paidMonth, base)}</p>
        </div>
      </div>

      {/* filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "draft", "sent", "overdue", "paid", "void"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
            {f !== "all" ? ` (${rows.filter((r) => r.status === f).length})` : ` (${rows.length})`}
          </button>
        ))}
      </div>

      <div className="surface overflow-hidden">
        {list.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === "all" ? "No invoices yet — create your first one." : `No ${filter} invoices.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Issued</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/40">
                    <td className="tnum px-5 py-3 font-medium">{inv.number}</td>
                    <td className="max-w-48 px-5 py-3">
                      <span className="block truncate">{inv.clientName}</span>
                      {inv.reminderCount > 0 ? (
                        <span className="tnum text-xs text-muted-foreground">
                          {inv.reminderCount} reminder{inv.reminderCount > 1 ? "s" : ""} sent
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtDate(inv.issueDate)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtDate(inv.dueDate)}</td>
                    <td className="tnum whitespace-nowrap px-5 py-3 text-right font-medium">
                      {formatMoney(Number(inv.total), inv.currency)}
                      {inv.currency !== base ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          ≈ {formatMoney(Number(inv.baseTotal), base)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Actions for ${inv.number}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {inv.status === "draft" ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditId(inv.id);
                                  setEditorOpen(true);
                                }}
                              >
                                <FileText className="mr-2 h-4 w-4" /> Edit draft
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => markSent.mutate({ id: inv.id })}>
                                <Send className="mr-2 h-4 w-4" /> Mark as sent
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {inv.status === "sent" || inv.status === "overdue" ? (
                            <>
                              <DropdownMenuItem onClick={() => recordPayment.mutate({ id: inv.id })}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Record payment
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setReminderId(inv.id)}>
                                <Sparkles className="mr-2 h-4 w-4" /> AI payment reminder
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {inv.status !== "paid" && inv.status !== "void" ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setVoid.mutate({ id: inv.id })}>
                                <Ban className="mr-2 h-4 w-4" /> Void
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteId(inv.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InvoiceEditor open={editorOpen} onClose={() => setEditorOpen(false)} editId={editId} />
      <ReminderDialog invoiceId={reminderId} onClose={() => setReminderId(null)} />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Draft, sent and overdue invoices can be deleted. Paid invoices must be voided instead.
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
