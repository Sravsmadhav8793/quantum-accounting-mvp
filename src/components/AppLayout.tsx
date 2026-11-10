import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { LOGIN_PATH } from "@/const";
import {
  ArrowLeftRight,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  PieChart,
  Receipt,
  ScanLine,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthLayoutSkeleton } from "./AuthLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: ArrowLeftRight, label: "Transactions", path: "/transactions" },
  { icon: Landmark, label: "Bank Import", path: "/import" },
  { icon: FileText, label: "Invoices", path: "/invoices" },
  { icon: Receipt, label: "Expenses", path: "/expenses" },
  { icon: PieChart, label: "Reports", path: "/reports" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-lg bg-primary shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <ScanLine className="text-primary-foreground" style={{ width: size * 0.58, height: size * 0.58 }} />
    </span>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { isLoading, user, logout } = useAuth();

  if (isLoading) return <AuthLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-4">
            <BrandMark size={44} />
            <h1 className="font-display text-2xl font-semibold tracking-tight text-center">
              Sign in to QuantumAccounting
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Your books, dashboards and AI bookkeeping live behind your account.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = LOGIN_PATH;
            }}
            size="lg"
            className="w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Shell user={user} onLogout={logout}>
        {children}
      </Shell>
    </SidebarProvider>
  );
}

function Shell({
  children,
  user,
  onLogout,
}: {
  children: ReactNode;
  user: { name?: string | null; email?: string | null };
  onLogout: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = menuItems.find((m) => location.pathname.startsWith(m.path));

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="h-16 justify-center">
          <div className="flex items-center gap-3 px-2 w-full">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2.5 min-w-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Go to dashboard"
            >
              <BrandMark />
              <span className="font-display font-semibold tracking-tight truncate group-data-[collapsible=icon]:hidden">
                Quantum<span className="text-primary">Accounting</span>
              </span>
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-0">
          <SidebarMenu className="px-2 py-2 gap-1">
            {menuItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => navigate(item.path)}
                    tooltip={item.label}
                    className="h-10"
                  >
                    <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="p-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                    {(user?.name ?? "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-medium leading-none text-foreground">
                    {user?.name || "Account"}
                  </p>
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{user?.email || "—"}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="h-9 w-9 rounded-lg" aria-label="Toggle navigation" />
            <span className="font-display text-sm font-medium tracking-tight text-muted-foreground">
              {active?.label ?? "QuantumAccounting"}
            </span>
          </div>
          <Link
            to="/import"
            className="hidden sm:inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Import statement
          </Link>
        </div>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
