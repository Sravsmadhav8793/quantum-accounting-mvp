import { PageHeader } from "@/components/kit";
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
import { trpc } from "@/providers/trpc";
import { CURRENCIES } from "@contracts/currencies";
import { RefreshCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const settings = trpc.settings.get.useQuery();

  const [companyName, setCompanyName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("0");
  const [confirm, setConfirm] = useState<"reset" | "clear" | null>(null);

  useEffect(() => {
    if (settings.data) {
      setCompanyName(settings.data.companyName);
      setBaseCurrency(settings.data.baseCurrency);
      setTaxRate(String(Number(settings.data.defaultTaxRate)));
    }
  }, [settings.data]);

  const invalidateAll = () => {
    utils.settings.get.invalidate();
    utils.dashboard.invalidate();
    utils.reports.invalidate();
    utils.transactions.list.invalidate();
    utils.invoices.list.invalidate();
    utils.expenses.list.invalidate();
    utils.imports.listBatches.invalidate();
  };

  const update = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.settings.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetDemo = trpc.settings.resetDemo.useMutation({
    onSuccess: () => {
      toast.success("Demo workspace restored");
      invalidateAll();
      setConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const clearAll = trpc.settings.clearAll.useMutation({
    onSuccess: () => {
      toast.success("Workspace cleared — starting fresh");
      invalidateAll();
      setConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (settings.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 max-w-xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" description="Organisation profile, currency and data controls." />

      <div className="grid max-w-3xl gap-4">
        <div className="surface p-6">
          <h2 className="font-display mb-4 text-base font-semibold">Organisation</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="set-company">Company name</Label>
              <Input id="set-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>Base currency</Label>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
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
              <p className="mt-1.5 text-xs text-muted-foreground">
                All dashboards and reports convert to this currency. Applies to new entries.
              </p>
            </div>
            <div>
              <Label htmlFor="set-tax">Default tax rate (%)</Label>
              <Input
                id="set-tax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="mt-1.5 tnum"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Pre-filled on new invoices.</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              onClick={() =>
                update.mutate({
                  companyName: companyName.trim() || undefined,
                  baseCurrency,
                  defaultTaxRate: Number(taxRate) || 0,
                })
              }
              disabled={update.isPending}
            >
              {update.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>

        <div className="surface border-[hsl(var(--warning)/0.3)] p-6">
          <h2 className="font-display mb-2 text-base font-semibold">Workspace data</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This workspace ships with a realistic demo set of books so every feature is explorable.
            Reset it any time, or wipe it clean to start your real books.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirm("reset")}>
              <RefreshCcw className="mr-1.5 h-4 w-4" />
              Restore demo data
            </Button>
            <Button
              variant="outline"
              className="border-[hsl(var(--danger)/0.4)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.08)]"
              onClick={() => setConfirm("clear")}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear everything
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "reset" ? "Restore the demo workspace?" : "Clear all data?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? "Every transaction, invoice, expense and import is deleted and replaced with fresh demo data."
                : "Every transaction, invoice, expense and import is permanently deleted. Your settings are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => (confirm === "reset" ? resetDemo.mutate() : clearAll.mutate())}
              className={confirm === "clear" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirm === "reset" ? "Restore demo" : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
