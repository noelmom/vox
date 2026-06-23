import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Zap,
  User,
  Clock,
  Settings,
  Bell,
  Sun,
  ChevronDown,
  Menu,
  X,
  Heart,
  Home,
  ArrowUpRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import voxLogo from "@/assets/vox-logo-app.png";
import voxIcon from "@/assets/vox-icon.png";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Studio — Vox" },
      { name: "description", content: "Generate private, local text-to-speech with Vox." },
    ],
  }),
  component: AppLayout,
});

const NAV: { label: string; to: "/app" | "/app/voices" | "/app/history" | "/app/settings"; Icon: typeof Zap }[] = [
  { label: "Generate", to: "/app", Icon: Zap },
  { label: "Voices", to: "/app/voices", Icon: User },
  { label: "History", to: "/app/history", Icon: Clock },
  { label: "Settings", to: "/app/settings", Icon: Settings },
];

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("vox.sidebarCollapsed") === "1";
  });

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("vox.sidebarCollapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  return (
    <div className="flex min-h-screen w-full bg-[oklch(0.985_0.005_260)] text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-white py-5 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[68px] px-2" : "w-[232px] px-4"
        }`}
      >
        <SidebarContent
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-border bg-white px-4 py-5 shadow-xl lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-foreground/60 hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent pathname={pathname} />
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground/70 transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex shrink-0 items-center lg:hidden" aria-label="Vox Studio">
              <img src={voxLogo} alt="Vox" className="h-8 w-auto" />
            </div>
            <div className="hidden min-w-0 items-center gap-5 text-[13px] font-medium text-foreground/75 md:flex">
              <StatusPill color="green" label="Ready" />
              <StatusPill color="green" label="Apple MPS" />
              <StatusPill color="green" label="Chatterbox Turbo" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconBtn aria-label="Toggle theme"><Sun className="h-4 w-4" /></IconBtn>
            <IconBtn aria-label="Notifications"><Bell className="h-4 w-4" /></IconBtn>
            <button
              type="button"
              className="ml-1 flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 hover:bg-muted"
              aria-label="Account"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[oklch(0.55_0.22_260)] text-[12px] font-bold text-white">
                V
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-foreground/60" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="shrink-0 border-t border-border bg-white px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11.5px] text-foreground/55">
            <span className="inline-flex items-center gap-1">
              Made with
              <Heart className="h-3 w-3 fill-[oklch(0.62_0.22_25)] text-[oklch(0.62_0.22_25)]" />
              from South Florida
            </span>
            <div className="flex items-center gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 bg-white px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-foreground hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                </svg>
                GitHub
              </a>
              <a
                href="https://www.buymeacoffee.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Buy me a coffee"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#FFDD00] px-2 py-1 text-[11px] font-semibold text-black transition-colors hover:bg-[#FFD400]"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                  <path d="M20 3H6a1 1 0 0 0-1 1v9a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5v-1h3a3 3 0 0 0 0-6Zm0 4v2h-3V7h3ZM4 20h14v2H4z" />
                </svg>
                Buy me a coffee
              </a>
            </div>
            <span className="font-mono tabular-nums">
              Apple M1 — macOS 26.5.1 (25F80) · VOX v1.0.0
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  collapsed = false,
  onToggleCollapsed,
}: {
  pathname: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  return (
    <>
      <div className={`mb-7 flex items-center ${collapsed ? "justify-center" : "px-2"}`}>
        {collapsed ? (
          <img src={voxIcon.url} alt="Vox" className="h-8 w-8 rounded-lg" />
        ) : (
          <img src={voxLogo} alt="Vox Studio" className="h-10 w-auto" />
        )}
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ label, to, Icon }) => {
          const active = to === "/app" ? pathname === "/app" : pathname.startsWith(to);
          const base = collapsed
            ? "flex items-center justify-center rounded-lg p-2.5"
            : "flex items-center gap-3 rounded-lg px-3 py-2.5";
          return (
            <Link
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              aria-label={label}
              className={
                active
                  ? `${base} bg-[oklch(0.96_0.03_260)] text-[14px] font-semibold text-[oklch(0.55_0.22_260)]`
                  : `${base} text-[14px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground`
              }
            >
              <Icon className="h-4 w-4" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <>
          <section className="mt-auto rounded-2xl border border-border bg-white p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              System Status
              <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.7_0.18_145)]" />
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">All systems go</div>

            <div className="mt-4 text-[12px] font-semibold text-foreground/70">Requests Today</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-[28px] font-black leading-none text-foreground">12</div>
              <Sparkline />
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-border bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[13px] font-semibold text-foreground">Minutes Recorded</div>
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">All time</div>
            </div>

            <div className="mt-3 text-[12px] font-semibold text-foreground/70">Hours</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-[28px] font-black leading-none text-foreground tabular-nums">22.3</div>
              <Sparkline color="oklch(0.55 0.22 260)" points={[2, 4, 3, 6, 5, 8, 7, 9, 11, 13]} />
            </div>
          </section>

          <Link
            to="/"
            className="group mt-3 flex items-center gap-3 rounded-2xl border border-border bg-white px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-[oklch(0.55_0.22_260/0.35)] hover:shadow-[0_8px_18px_-12px_oklch(0.55_0.22_260/0.35)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[oklch(0.96_0.02_260)] text-[oklch(0.55_0.22_260)] transition-colors group-hover:bg-[oklch(0.94_0.04_260)]">
              <Home className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-foreground">Landing page</span>
              <span className="block text-[11px] text-muted-foreground">vox.studio · marketing site</span>
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[oklch(0.55_0.22_260)]" />
          </Link>
        </>
      )}

      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`${collapsed ? "mt-auto" : "mt-3"} flex items-center ${
            collapsed ? "justify-center p-2.5" : "gap-2 px-3 py-2"
          } rounded-lg text-[12px] font-medium text-foreground/60 transition-colors hover:bg-muted hover:text-foreground`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              Collapse
            </>
          )}
        </button>
      )}
    </>
  );
}

function StatusPill({ color, label }: { color: "green"; label: string }) {
  const dot = color === "green" ? "bg-[oklch(0.7_0.18_145)]" : "bg-muted";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Sparkline({
  points = [6, 7, 5, 8, 10, 9, 12, 11, 13, 12],
  color = "oklch(0.62 0.13 175)",
}: {
  points?: number[];
  color?: string;
}) {
  const max = Math.max(...points);
  const w = 96;
  const h = 32;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (v / max) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ color }}>
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="currentColor" opacity="0.15" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
      {...props}
    >
      {children}
    </button>
  );
}
