import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  Library,
  Mic,
  Settings,
  Menu,
  X,
  Heart,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
} from "lucide-react";
import voxLogo from "@/assets/vox-logo-app.png";
import voxIcon from "@/assets/vox-icon-2.png";
import voxLogoDark from "@/assets/vox-logo-dark-trim.png";
import { getAlerts, getStats, getServerSettings, healthCheck, type Stats, type ServerSettings, type SystemAlert } from "@/lib/api";
import { cancelJob } from "@/lib/api";
import { getGenerationState, subscribeGenerationState, type GenerationStatus } from "@/lib/generation";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Studio — Vox" },
      { name: "description", content: "Generate private, local text-to-speech with Vox." },
    ],
  }),
  component: AppLayout,
});

const NAV: { label: string; to: "/app" | "/app/library" | "/app/recordings" | "/app/settings"; Icon: typeof Zap }[] = [
  { label: "Create", to: "/app", Icon: Zap },
  { label: "Library", to: "/app/library", Icon: Library },
  { label: "Recordings", to: "/app/recordings", Icon: Mic },
  { label: "Settings", to: "/app/settings", Icon: Settings },
];

function AppLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("vox.sidebarCollapsed") === "1";
  });

  const { data: serverInfo, isLoading: serverLoading, isError: serverError } = useQuery<ServerSettings>({
    queryKey: ["settings"],
    queryFn: getServerSettings,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const { isLoading: healthLoading, isError: healthError } = useQuery({
    queryKey: ["health"],
    queryFn: healthCheck,
    staleTime: 0,
    refetchInterval: 15_000,
    retry: 1,
  });

  const { data: alerts = [] } = useQuery<SystemAlert[]>({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
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
    <div className="flex min-h-screen w-full bg-transparent text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/60 bg-white/75 py-5 backdrop-blur-xl transition-[width] duration-200 lg:flex ${
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
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-border/60 bg-white/90 px-4 py-5 shadow-xl backdrop-blur-xl lg:hidden">
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
        <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-white/70 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
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
          </div>
          <div className="hidden items-center gap-3 md:flex">
            {(() => {
              const serverStatus = serverLoading ? "loading" : serverError ? "error" : "ok";
              const healthStatus = healthLoading ? "loading" : healthError ? "error" : "ok";
              const device = serverInfo?.device_resolved === "mps" ? "Apple MPS" : serverInfo?.device_resolved?.toUpperCase() ?? "…";
              const model = serverInfo?.model_name ?? "…";
              return (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground/35">
                    System Status
                  </span>
                  <div className="h-3.5 w-px bg-border" />
                  <StatusPill status={healthStatus} label="Ready" />
                  <StatusPill status={serverStatus} label={device} />
                  <StatusPill status={serverStatus} label={model} />
                </>
              );
            })()}
          </div>
        </header>

        <GenerationWidget />
        <AlertBanners alerts={alerts} />

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 pb-12 pt-6 sm:px-8">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="shrink-0 border-t border-border/60 bg-white/70 px-4 py-3 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11.5px] text-foreground/55">
            <span className="inline-flex items-center gap-1">
              Made with
              <Heart className="h-3 w-3 fill-[var(--brand-warm)] text-[var(--brand-warm)]" />
              from South Florida
            </span>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                aria-label="Go to landing page"
                className="inline-flex items-center justify-center transition-all hover:-translate-y-0.5"
              >
                <img src={voxLogoDark} alt="Vox" className="h-6 w-auto" />
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 bg-white/80 px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm"
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
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/80 px-2 py-1 text-[11px] font-semibold text-foreground/80 transition-colors hover:border-[var(--brand)] hover:bg-white hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                  <path d="M20 3H6a1 1 0 0 0-1 1v9a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5v-1h3a3 3 0 0 0 0-6Zm0 4v2h-3V7h3ZM4 20h14v2H4z" />
                </svg>
                Buy me a coffee
              </a>
            </div>
            <span
              className="font-mono tabular-nums"
              title={serverInfo ? `Built ${serverInfo.build_built_at}` : undefined}
            >
              {serverInfo
                ? `${serverInfo.chip} — macOS ${serverInfo.macos_version} · Studio v${serverInfo.vox_version} · ${serverInfo.build_commit}`
                : "—"}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function GenerationWidget() {
  const [state, setState] = useState<GenerationStatus>(() => getGenerationState());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeGenerationState(setState), []);
  useEffect(() => {
    if (state.phase !== "submitting" && state.phase !== "polling") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  if (state.phase !== "submitting" && state.phase !== "polling") return null;

  const startedAt = state.phase === "polling" ? state.startedAt : Date.now();
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const requestLabel = state.phase === "polling" ? state.requestId.slice(0, 8) : "pending";
  const queued = state.phase === "polling" && state.status === "queued";
  const progressPct = queued ? 18 : Math.min(92, 24 + elapsed / 3);

  return (
    <div className="border-b border-[color-mix(in_oklch,var(--brand)_12%,white)] bg-white/85 px-4 py-2 backdrop-blur-xl sm:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
            <span className="font-bold text-foreground">{queued ? "Queued" : "Generating audio"}</span>
            <span className="text-foreground/45">job {requestLabel}</span>
            <span className="font-medium text-foreground/65">
              {queued ? "Waiting for engine" : `${formatElapsed(elapsed)} elapsed`}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--brand-soft)_60%,white)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),var(--brand-secondary),var(--brand-warm))] transition-[width] duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={state.phase !== "polling"}
          onClick={async () => {
            if (state.phase !== "polling") return;
            await cancelJob(state.requestId);
            setState({ phase: "cancelled", requestId: state.requestId });
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[oklch(0.78_0.12_25)] bg-[oklch(0.99_0.02_25)] px-3 text-[12px] font-semibold text-[oklch(0.55_0.2_25)] transition-colors hover:bg-[oklch(0.97_0.03_25)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

function AlertBanners({ alerts }: { alerts: SystemAlert[] }) {
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("vox:dismissed-alerts") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const visible = alerts.filter((alert) => !dismissed.includes(alert.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissed((current) => {
      const next = Array.from(new Set([...current, id]));
      sessionStorage.setItem("vox:dismissed-alerts", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="border-b border-border/60 bg-white/80 px-4 py-2 backdrop-blur-xl sm:px-8">
      <div className="flex flex-col gap-2">
        {visible.map((alert) => {
          const danger = alert.level === "error";
          return (
            <div
              key={alert.id}
              className={[
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
                danger
                  ? "border-[oklch(0.78_0.12_25)] bg-[oklch(0.99_0.02_25)] text-[oklch(0.45_0.18_25)]"
                  : "border-[oklch(0.86_0.12_80)] bg-[oklch(0.99_0.03_85)] text-[oklch(0.42_0.12_75)]",
              ].join(" ")}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 font-medium leading-relaxed">{alert.message}</span>
              <button
                type="button"
                onClick={() => dismiss(alert.id)}
                aria-label="Dismiss alert"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readWidgetPrefs() {
  return {
    requests: lsGet("vox:widget.requests", true),
    minutes: lsGet("vox:widget.minutes", true),
    library: lsGet("vox:widget.library", true),
  };
}

const EMPTY_STATS: Stats = {
  total_requests: 0,
  today_requests: 0,
  total_minutes: 0,
  today_minutes: 0,
  sparkline_requests: [],
  sparkline_minutes: [],
  voice_count: 0,
  recording_count: 0,
  voices_disk_bytes: 0,
  recordings_disk_bytes: 0,
  disk_used_bytes: 0,
};

function SidebarContent({
  pathname,
  collapsed = false,
  onToggleCollapsed,
}: {
  pathname: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const [widgetPrefs, setWidgetPrefs] = useState(readWidgetPrefs);

  useEffect(() => {
    const handler = () => setWidgetPrefs(readWidgetPrefs());
    window.addEventListener("vox:prefschanged", handler);
    return () => window.removeEventListener("vox:prefschanged", handler);
  }, []);

  const showAnyWidget = !collapsed && (widgetPrefs.requests || widgetPrefs.minutes || widgetPrefs.library);

  const { data: stats = EMPTY_STATS } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    enabled: showAnyWidget,
    staleTime: 0,
    refetchInterval: 2 * 60 * 1000,
    refetchIntervalInBackground: false,
  });

  return (
    <>
      {/* Scrollable top — logo + nav */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={`mb-7 flex items-center ${collapsed ? "justify-center" : "px-2"}`}>
          {collapsed ? (
            <img src={voxIcon} alt="Vox" className="h-8 w-8 rounded-lg" />
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
                    ? `${base} bg-[var(--brand-soft)] text-[14px] font-semibold text-[var(--brand)]`
                    : `${base} text-[14px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground`
                }
              >
                <Icon className="h-4 w-4" />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Pinned bottom — always visible */}
      <div className="shrink-0 flex flex-col gap-3 pt-3">
        {!collapsed && (
          <>
            {widgetPrefs.requests && (
              <section className="rounded-2xl border border-border bg-white p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Requests</div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">Total</div>
                    <div className="mt-0.5 text-[28px] font-black leading-none text-foreground tabular-nums">
                      {stats.total_requests}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">Today</div>
                    <div className="mt-0.5 text-[22px] font-black leading-none text-[var(--brand)] tabular-nums">
                      {stats.today_requests}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Sparkline
                    points={stats.sparkline_requests.length > 0 ? stats.sparkline_requests : [0]}
                    color="var(--brand-secondary)"
                  />
                </div>
              </section>
            )}

            {widgetPrefs.minutes && (
              <section className="rounded-2xl border border-border bg-white p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Audio Generated</div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">All time (min)</div>
                    <div className="mt-0.5 text-[28px] font-black leading-none text-foreground tabular-nums">
                      {stats.total_minutes < 10 ? stats.total_minutes.toFixed(1) : Math.round(stats.total_minutes)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">Today</div>
                    <div className="mt-0.5 text-[22px] font-black leading-none text-[var(--brand)] tabular-nums">
                      {stats.today_minutes < 10 ? stats.today_minutes.toFixed(1) : Math.round(stats.today_minutes)}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Sparkline
                    points={stats.sparkline_minutes.length > 0 ? stats.sparkline_minutes : [0]}
                    color="var(--brand)"
                  />
                </div>
              </section>
            )}

            {widgetPrefs.library && (
              <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Library & Storage
                </p>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-lg font-bold tabular-nums leading-none">{stats.voice_count}</div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground">Voices</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold tabular-nums leading-none">{stats.recording_count}</div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground">Available Clips</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold tabular-nums leading-none">{formatBytes(stats.disk_used_bytes)}</div>
                    <div className="mt-0.5 text-[9px] text-muted-foreground">Disk Used</div>
                  </div>
                </div>
              </section>
            )}

          </>
        )}

        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex items-center ${
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
      </div>
    </>
  );
}

function StatusPill({ status, label }: { status: "ok" | "loading" | "error"; label: string }) {
  const styles = {
    ok: {
      wrap: "border-[color-mix(in oklch, var(--brand-secondary) 30%, white)] bg-[var(--brand-soft)] text-[var(--brand)]",
      ping: "bg-[var(--brand-secondary)]",
      dot: "bg-[var(--brand)]",
    },
    loading: {
      wrap: "border-[color-mix(in oklch, var(--brand-secondary) 24%, white)] bg-[color-mix(in oklch, var(--brand-soft) 65%, white)] text-[var(--brand-secondary)]",
      ping: "bg-[var(--brand-secondary)]",
      dot: "bg-[var(--brand-secondary)]",
    },
    error: {
      wrap: "border-[color-mix(in oklch, var(--brand-warm) 28%, white)] bg-[color-mix(in oklch, var(--brand-warm) 10%, white)] text-[var(--brand-warm)]",
      ping: "",
      dot: "bg-[var(--brand-warm)]",
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tracking-wide shadow-[inset_0_1px_0_oklch(1_0_0/0.6)] ${styles.wrap}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {status !== "error" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${styles.ping}`} />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      </span>
      {label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Sparkline({
  points = [6, 7, 5, 8, 10, 9, 12, 11, 13, 12],
  color = "oklch(0.62 0.13 175)",
}: {
  points?: number[];
  color?: string;
}) {
  const safePoints = points.length < 2 ? [...points, ...Array(2 - points.length).fill(0)] : points;
  const max = Math.max(...safePoints, 1);
  const w = 160;
  const h = 36;
  const step = w / (safePoints.length - 1);
  const path = safePoints
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (v / max) * (h - 6) - 3}`)
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ color }}>
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill="currentColor" opacity="0.12" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
