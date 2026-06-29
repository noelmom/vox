import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Clipboard,
  Code2,
  ExternalLink,
  FileAudio,
  FolderOpen,
  Gauge,
  Heart,
  Home,
  LifeBuoy,
  Play,
  Server,
  Settings,
  Terminal,
} from "lucide-react";

import voxLogoV2 from "@/assets/vox-logo-v2.png";
import studioScreenshot from "@/assets/studio-screenshot.png";

type HealthResponse = {
  status: string;
  device: string;
  model_state: string;
  model_ready: boolean;
  input_dir: string;
  output_ttl_hours: number;
};

type SettingsResponse = {
  output_dir: string;
  voice_dir: string;
  input_dir: string;
  ffmpeg_available: boolean;
  model_name: string;
  model_ready: boolean;
  macos_version: string;
  chip: string;
  vox_version: string;
  build_commit: string;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Welcome to Vox Studio" },
      {
        name: "description",
        content:
          "Local Vox Studio welcome page with setup status, quick links, API examples, and troubleshooting.",
      },
    ],
  }),
  component: Welcome,
});

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function Welcome() {
  const health = useQuery({
    queryKey: ["welcome-health"],
    queryFn: () => fetchJson<HealthResponse>("/health"),
    refetchInterval: 3000,
  });
  const settings = useQuery({
    queryKey: ["welcome-settings"],
    queryFn: () => fetchJson<SettingsResponse>("/api/v1/settings"),
    refetchInterval: 5000,
  });

  const modelReady = health.data?.model_ready || settings.data?.model_ready;
  const version = settings.data?.vox_version ?? "unknown";
  const commit = settings.data?.build_commit ?? "unknown";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4fbff_0%,#edf8ff_46%,#ffffff_100%)] text-foreground">
      <header className="border-b border-border/70 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] max-w-[1180px] items-center justify-between gap-4 px-6 lg:px-10">
          <img src={voxLogoV2} alt="VOX studio" className="h-12 w-auto" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusPill
              tone={health.data?.status === "ok" ? "ok" : health.isError ? "bad" : "wait"}
              icon={<Server className="h-3.5 w-3.5" />}
            >
              {health.data?.status === "ok" ? "Local server running" : health.isError ? "Server unavailable" : "Checking server"}
            </StatusPill>
            <StatusPill tone={modelReady ? "ok" : "wait"} icon={<Gauge className="h-3.5 w-3.5" />}>
              {modelReady ? "Model ready" : "Model warming up"}
            </StatusPill>
            <span className="rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-bold text-muted-foreground shadow-sm">
              v{version} · {commit}
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1180px] grid-cols-1 gap-7 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
        <div className="min-w-0">
          <div className="mb-7">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[oklch(0.9_0.05_235)] bg-white/85 px-3 py-1.5 text-[12px] font-black uppercase tracking-wide text-[var(--brand)] shadow-sm">
              <Activity className="h-3.5 w-3.5" />
              Installed local studio
            </div>
            <h1 className="max-w-[780px] text-[44px] font-black leading-[0.98] tracking-tight text-foreground sm:text-[58px]">
              Welcome to Vox Studio.
            </h1>
            <p className="mt-5 max-w-[760px] text-[18px] leading-relaxed text-muted-foreground">
              Your local voice studio is ready. Open the app, review setup, or try the local API from this Mac.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Link to="/app" className="group rounded-2xl border border-border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <ActionIcon tone="primary"><Play className="h-5 w-5" fill="currentColor" /></ActionIcon>
              <h2 className="mt-4 text-[18px] font-black">Open Vox Studio</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Create scripts, choose voices, and generate audio.</p>
            </Link>
            <a href="/docs" className="group rounded-2xl border border-border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <ActionIcon tone="cool"><BookOpen className="h-5 w-5" /></ActionIcon>
              <h2 className="mt-4 text-[18px] font-black">API Docs</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Explore the local REST API reference.</p>
            </a>
            <a href="/api/v1/logs" className="group rounded-2xl border border-border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <ActionIcon tone="warm"><Terminal className="h-5 w-5" /></ActionIcon>
              <h2 className="mt-4 text-[18px] font-black">View Logs</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Check recent server activity and install clues.</p>
            </a>
          </div>

          <section className="mt-7 rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-[24px] font-black tracking-tight">Quick API Test</h2>
                <p className="mt-2 max-w-[620px] text-sm leading-relaxed text-muted-foreground">
                  Vox accepts local requests from shell scripts, Shortcuts, Codex, and other AI agents once the model is ready.
                </p>
              </div>
              <a
                href="/docs"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted"
              >
                Full API reference <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-2xl border border-[oklch(0.22_0.03_250)] bg-[oklch(0.14_0.025_250)] p-5 text-[12.5px] leading-7 text-[oklch(0.9_0.04_235)]"><code>{`curl -X POST http://localhost:8000/api/v1/tts \\
  -F "text=Hello from Vox Studio." \\
  -F "voice_name=noelmo-normal" \\
  -F "preset=default"

curl http://localhost:8000/api/v1/jobs/{request_id}

curl -L http://localhost:8000/api/v1/jobs/{request_id}/audio \\
  --output voice.mp3`}</code></pre>
          </section>

          <section className="mt-7 overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
            <img src={studioScreenshot} alt="Vox Studio application screenshot" className="w-full border-b border-border" />
            <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
              <MiniFact icon={<FileAudio className="h-4 w-4" />} label="Output" value="MP3 or WAV" />
              <MiniFact icon={<Code2 className="h-4 w-4" />} label="API" value="Local REST" />
              <MiniFact icon={<Home className="h-4 w-4" />} label="Privacy" value="Runs on your Mac" />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <Panel title="Setup Checklist" icon={<CheckCircle2 className="h-4 w-4" />}>
            <ChecklistItem ok={health.data?.status === "ok"} label="Local server responding" />
            <ChecklistItem ok={Boolean(modelReady)} label="Chatterbox model ready" muted={!modelReady} />
            <ChecklistItem ok={settings.data?.ffmpeg_available !== false} label="FFmpeg available" />
            <ChecklistItem ok={Boolean(settings.data?.voice_dir)} label="Voice library ready" />
          </Panel>

          <Panel title="Where Files Live" icon={<FolderOpen className="h-4 w-4" />}>
            <PathRow label="Voices" value={settings.data?.voice_dir ?? "~/Library/Application Support/Vox/voices"} />
            <PathRow label="Outputs" value={settings.data?.output_dir ?? "~/Library/Application Support/Vox/outputs"} />
            <PathRow label="Input" value={settings.data?.input_dir ?? "~/Library/Application Support/Vox/input"} />
            <PathRow label="Logs" value="~/Library/Logs/Vox" />
          </Panel>

          <Panel title="Troubleshooting" icon={<LifeBuoy className="h-4 w-4" />}>
            <HelpLink href="/app/settings" icon={<Settings className="h-4 w-4" />} label="Open Settings" />
            <HelpLine>Restart from the Vox menu bar helper if the model seems stuck.</HelpLine>
            <HelpLine>Add <code>HF_TOKEN</code> in Settings or <code>.env</code> for faster model downloads.</HelpLine>
            <HelpLine>Package install log: <code>/Library/Logs/Vox/pkg-install.log</code></HelpLine>
          </Panel>

          <Panel title="Support The Project" icon={<Heart className="h-4 w-4" />}>
            <HelpLink href="https://noelmom.github.io" icon={<ExternalLink className="h-4 w-4" />} label="Support page" />
            <HelpLink href="https://buymeacoffee.com/noelmo" icon={<Heart className="h-4 w-4 text-yellow-500" />} label="Buy me a Coffee" warm />
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function StatusPill({ children, icon, tone }: { children: React.ReactNode; icon: React.ReactNode; tone: "ok" | "bad" | "wait" }) {
  const styles = {
    ok: "border-[oklch(0.86_0.08_150)] bg-[oklch(0.97_0.05_150)] text-[oklch(0.42_0.16_150)]",
    bad: "border-[oklch(0.86_0.08_25)] bg-[oklch(0.97_0.04_25)] text-[oklch(0.5_0.18_25)]",
    wait: "border-[oklch(0.86_0.06_80)] bg-[oklch(0.98_0.045_80)] text-[oklch(0.5_0.13_80)]",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold shadow-sm ${styles}`}>{icon}{children}</span>;
}

function ActionIcon({ children, tone }: { children: React.ReactNode; tone: "primary" | "cool" | "warm" }) {
  const bg = tone === "warm" ? "linear-gradient(135deg, var(--brand-warm), oklch(0.58 0.2 35))" : tone === "cool" ? "linear-gradient(135deg, oklch(0.62 0.2 235), var(--brand))" : "var(--brand-gradient)";
  return <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: bg }}>{children}</span>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-black uppercase tracking-wide text-foreground/80">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChecklistItem({ ok, label, muted }: { ok: boolean; label: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2 text-sm font-semibold text-foreground/80">
      <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-[oklch(0.56_0.18_150)]" : muted ? "bg-[oklch(0.76_0.08_80)]" : "bg-muted-foreground/30"}`} />
      {label}
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-start gap-2 rounded-lg bg-muted px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/70">
        <Clipboard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="break-all">{value}</span>
      </div>
    </div>
  );
}

function HelpLink({ href, icon, label, warm }: { href: string; icon: React.ReactNode; label: string; warm?: boolean }) {
  return (
    <a href={href} className={`mb-2 flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-bold transition-colors hover:bg-muted ${warm ? "text-yellow-600" : "text-foreground/80"}`}>
      {icon}
      {label}
    </a>
  );
}

function HelpLine({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

function MiniFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">{icon}</span>
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-black text-foreground">{value}</div>
      </div>
    </div>
  );
}
