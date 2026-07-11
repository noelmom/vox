import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3, PencilLine, Settings, UserRound, X } from "lucide-react";
import voxLogo from "@/assets/vox-logo-app.png";
import voxIcon from "@/assets/vox-icon-2.png";
import { cancelJob, getAlerts, getJob, getRuntimeStatus, healthCheck, type Job, type SystemAlert } from "@/lib/api";
import { getGenerationState, setGenerationState, subscribeGenerationState, type DurableGenerationState, type GenerationStatus } from "@/lib/generation";
import { PlaybackProvider } from "@/features/playback/PlaybackProvider";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Vox Studio" }, { name: "description", content: "Private, local voice creation on your Mac." }] }),
  component: AppLayout,
});

const NAV = [
  { label: "Create", to: "/app" as const, Icon: PencilLine },
  { label: "Voices", to: "/app/voices" as const, Icon: UserRound },
  { label: "History", to: "/app/history" as const, Icon: Clock3 },
  { label: "Settings", to: "/app/settings" as const, Icon: Settings },
];

function AppLayout() {
  return <PlaybackProvider><AppWorkspace /></PlaybackProvider>;
}

function AppWorkspace() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: health, isLoading, isError } = useQuery({ queryKey: ["health"], queryFn: healthCheck, refetchInterval: 15_000, retry: 1 });
  const { data: runtime, isError: runtimeError } = useQuery({ queryKey: ["runtime-status"], queryFn: getRuntimeStatus, refetchInterval: 5_000, retry: 1 });
  const { data: alerts = [] } = useQuery<SystemAlert[]>({ queryKey: ["alerts"], queryFn: getAlerts, refetchInterval: 5 * 60_000, retry: 1 });
  const [authExpired, setAuthExpired] = useState<string | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);
  useEffect(() => {
    const handler = (event: Event) => setAuthExpired((event as CustomEvent<{ reason?: string }>).detail?.reason ?? "Pairing is required.");
    window.addEventListener("vox:auth-expired", handler);
    return () => window.removeEventListener("vox:auth-expired", handler);
  }, []);
  const routeLabel = NAV.find(({ to }) => to === "/app" ? pathname === "/app" : pathname.startsWith(to))?.label ?? "Vox Studio";
  const modelReady = runtime?.model.ready === true;

  if (authExpired) return <PairingGate reason={authExpired} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#workspace-main" className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus:translate-y-0">Skip to content</a>
      <div id="pairing-gate-slot" hidden />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[68px] border-r border-border/70 bg-white/90 px-2 py-5 backdrop-blur-xl md:flex md:flex-col xl:w-[216px] xl:px-4">
        <Link to="/app" aria-label="Vox Studio home" className="mb-8 flex justify-center xl:justify-start xl:px-2">
          <img src={voxIcon} alt="" className="h-10 w-10 xl:hidden" />
          <img src={voxLogo} alt="Vox Studio" className="hidden h-12 w-auto xl:block" />
        </Link>
        <PrimaryNavigation pathname={pathname} />
        <div className="mt-auto px-1 pb-2">
          <div className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-xs font-semibold xl:justify-start xl:px-3 ${isError ? "border-red-500/40 bg-red-950/30 text-red-300" : "border-border bg-card text-foreground/70"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${isLoading || runtimeError || !modelReady ? "bg-amber-400" : isError ? "bg-red-500" : "bg-emerald-500"}`} />
            <span className="hidden xl:inline">{isLoading ? "Connecting" : isError || runtimeError ? "Unavailable" : !modelReady ? modelStatusLabel(runtime?.model.state) : "Ready"}</span>
          </div>
        </div>
      </aside>

      <div className="min-h-screen md:pl-[68px] xl:pl-[216px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <img src={voxIcon} alt="" className="h-9 w-9 md:hidden" />
            <span className="text-base font-bold md:hidden">{routeLabel}</span>
          </div>
          <span className="text-xs font-medium text-foreground/45">On-device voice studio</span>
        </header>
        {isError && <GlobalBanner message="Vox server is unavailable. Your draft and paused playback metadata are safe." action="Retry" onAction={() => window.location.reload()} />}
        {!isError && runtimeError && <GlobalBanner message="Runtime status is unavailable. Existing playback remains available; reconnect to enable generation." action="Retry" onAction={() => window.location.reload()} />}
        {!isError && !runtimeError && !isLoading && runtime && !modelReady && <GlobalBanner message={`The voice model is ${modelStatusLabel(runtime.model.state).toLowerCase()}. Existing playback remains available; generation will resume when it is ready.`} action="Retry" onAction={() => window.location.reload()} />}
        <GenerationStatusBar />
        <AlertBanners alerts={alerts} />
        <main id="workspace-main" tabIndex={-1} className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-[1500px] px-4 pb-40 pt-7 outline-none sm:px-6 md:px-8 md:pb-32">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-border bg-background/95 px-1 backdrop-blur-xl md:hidden">
        {NAV.map(({ label, to, Icon }) => {
          const active = to === "/app" ? pathname === "/app" : pathname.startsWith(to);
          return <Link key={to} to={to} aria-current={active ? "page" : undefined} className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold ${active ? "text-[var(--brand)]" : "text-foreground/55"}`}><Icon className="h-5 w-5" /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}

function PairingGate({ reason }: { reason: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-background px-5"><section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-xl"><img src={voxLogo} alt="Vox Studio" className="mx-auto h-12 w-auto" /><h1 className="mt-6 text-2xl font-bold">Pair this device</h1><p className="mt-2 text-sm leading-6 text-foreground/60">{reason} Open Vox Helper on the host Mac to create a new one-time pairing code.</p><a href="/pair" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white">Open pairing</a></section></main>;
}

function modelStatusLabel(state?: string) {
  if (state === "recovering") return "Recovering";
  if (state === "error") return "Model error";
  return "Loading model";
}

function PrimaryNavigation({ pathname }: { pathname: string }) {
  return <nav aria-label="Primary" className="flex flex-col gap-1">{NAV.map(({ label, to, Icon }) => {
    const active = to === "/app" ? pathname === "/app" : pathname.startsWith(to);
    return <Link key={to} to={to} aria-current={active ? "page" : undefined} title={label} className={`flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium xl:justify-start ${active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-foreground/65 hover:bg-muted hover:text-foreground"}`}><Icon className="h-5 w-5 shrink-0" /><span className="hidden xl:inline">{label}</span></Link>;
  })}</nav>;
}

function GenerationStatusBar() {
  const [state, setState] = useState<GenerationStatus>(() => getGenerationState());
  useEffect(() => subscribeGenerationState(setState), []);
  useEffect(() => {
    if (state.phase !== "polling") return;
    const requestId = state.requestId;
    let stopped = false;
    const apply = (job: Job) => {
      if (stopped) return;
      if (["queued", "processing", "cancelling", "encoding", "recovering"].includes(job.status)) setGenerationState({ ...state, status: job.status as DurableGenerationState });
      else if (job.status === "completed") setGenerationState({ phase: "done", requestId });
      else if (job.status === "cancelled") setGenerationState({ phase: "cancelled", requestId });
      else if (job.status === "failed" || job.status === "interrupted") setGenerationState({ phase: "error", requestId, message: job.error ?? "Generation was interrupted." });
    };
    const reconcile = () => { void getJob(requestId).then(apply).catch(() => undefined); };
    const source = new EventSource(`/api/v1/jobs/${encodeURIComponent(requestId)}/events`);
    source.addEventListener("job", (event) => apply(JSON.parse((event as MessageEvent).data) as Job));
    reconcile();
    const interval = window.setInterval(reconcile, 5000);
    return () => { stopped = true; source.close(); window.clearInterval(interval); };
  }, [state.phase === "polling" ? state.requestId : null]);
  if (state.phase !== "submitting" && state.phase !== "polling") return null;
  const status = state.phase === "submitting" ? "Submitting" : statusLabel(state.status);
  return <div role="status" aria-live="polite" className="flex min-h-12 items-center gap-3 border-b border-[color-mix(in_oklch,var(--brand)_35%,var(--border))] bg-[var(--brand-soft)] px-4 py-2 text-sm md:px-8"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--brand)] motion-reduce:animate-none" /><strong>{status}</strong><span className="min-w-0 flex-1 truncate text-foreground/65">{state.phase === "polling" ? `Job ${state.requestId.slice(0, 8)}` : "Sending your script to Vox"}</span>{state.phase === "polling" && <button type="button" disabled={state.status === "cancelling"} onClick={async () => { const result = await cancelJob(state.requestId); if (result.status !== "cancelled") setGenerationState({ ...state, status: "cancelling" }); }} className="min-h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50">{state.status === "cancelling" ? "Stopping…" : "Stop"}</button>}</div>;
}

function statusLabel(status?: DurableGenerationState) {
  return ({ queued: "Queued", processing: "Generating", cancelling: "Stopping…", encoding: "Encoding audio", recovering: "Recovering model" } as const)[status ?? "queued"];
}

function AlertBanners({ alerts }: { alerts: SystemAlert[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  return <>{alerts.filter((alert) => !dismissed.includes(alert.id)).map((alert) => <GlobalBanner key={alert.id} message={alert.message} action="Dismiss" onAction={() => setDismissed((value) => [...value, alert.id])} />)}</>;
}

function GlobalBanner({ message, action, onAction }: { message: string; action: string; onAction: () => void }) {
  return <div role="alert" className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-8"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">{message}</span><button type="button" onClick={onAction} className="flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold hover:bg-amber-100">{action === "Dismiss" && <X className="h-3.5 w-3.5" />}{action}</button></div>;
}
