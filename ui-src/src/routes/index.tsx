import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  HelpCircle,
  Info,
  KeyRound,
  LifeBuoy,
  Loader2,
  MonitorCog,
  RefreshCcw,
  Server,
  Settings,
  Sparkles,
  Volume2,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import voxLogoV2 from "@/assets/vox-logo-v2.png";

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

const API_GENERATE_SAMPLE = `curl -X POST http://localhost:8000/api/v1/tts \\
  -F "text=Hello from Vox Studio." \\
  -F "voice_name=noelmo-normal" \\
  -F "preset=default"`;

const API_STATUS_SAMPLE = `curl http://localhost:8000/api/v1/jobs/{request_id}`;

const API_DOWNLOAD_SAMPLE = `curl -L http://localhost:8000/api/v1/jobs/{request_id}/audio \\
  --output voice.mp3`;

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
  const serverOk = health.data?.status === "ok";
  const version = settings.data?.vox_version ?? "unknown";
  const commit = settings.data?.build_commit ?? "unknown";
  const shortCommit = commit === "unknown" ? "unknown" : commit.slice(0, 8);
  const serverUrl = window.location.origin;
  const appSupport = "~/Library/Application Support/Vox";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fcff_0%,#eef8ff_52%,#ffffff_100%)] text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/75 bg-white/86 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[74px] max-w-[1600px] items-center justify-between gap-5 px-7 xl:px-10">
          <div className="flex min-w-0 items-center gap-6">
            <div className="flex shrink-0 items-center gap-2">
              <img src={voxLogoV2} alt="VOX studio" className="h-12 w-auto" />
            </div>
            <StatusBadge
              tone={serverOk ? "ok" : health.isError ? "bad" : "wait"}
              label={serverOk ? "Local server running" : health.isError ? "Server unavailable" : "Checking server"}
            />
            <span className="hidden h-10 items-center rounded-xl border border-[oklch(0.88_0.05_245)] bg-[oklch(0.97_0.025_245)] px-4 text-sm font-black text-[var(--brand)] shadow-sm md:inline-flex">
              v{version} <span className="mx-3 text-muted-foreground/55">·</span> build {shortCommit}
            </span>
          </div>
          <nav className="hidden shrink-0 items-center gap-7 text-sm font-black text-foreground/68 md:flex" aria-label="Welcome navigation">
            <a className="inline-flex items-center gap-2 transition-colors hover:text-[var(--brand)]" href="/docs">
              <BookOpen className="h-4 w-4" /> Docs
            </a>
            <a className="inline-flex items-center gap-2 transition-colors hover:text-[var(--brand)]" href="https://noelmom.github.io">
              <HelpCircle className="h-4 w-4" /> Help
            </a>
            <Link className="inline-flex items-center gap-2 transition-colors hover:text-[var(--brand)]" to="/app/settings">
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1600px] px-7 py-8 xl:px-10">
        <div className="mb-6">
          <h1 className="text-[40px] font-black leading-tight tracking-tight text-foreground sm:text-[48px]">
            Welcome to Vox Studio <span aria-hidden="true">🎉</span>
          </h1>
          <p className="mt-2 text-[18px] font-semibold leading-relaxed text-muted-foreground">
            Your local voice studio is ready. Open the app, review setup, or try the local API.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
          <LaunchCard
            title="Open Vox Studio"
            description="Launch the full app in your browser."
            href="/app"
            route="/app"
            tone="blue"
            icon={<Volume2 className="h-8 w-8" />}
          />
          <LaunchCard
            title="API Docs"
            description="Explore the local HTTP API."
            href="/docs"
            route="/docs"
            tone="teal"
            icon={<BookOpen className="h-8 w-8" />}
          />
          <LaunchCard
            title="View Logs"
            description="Monitor server and app logs."
            href="/logs"
            route="/logs"
            tone="purple"
            icon={<FileText className="h-8 w-8" />}
          />
        </div>

        <div className="mt-7 grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,.95fr)]">
          <div className="grid gap-7">
            <Panel title="Setup checklist" icon={null}>
              <div className="mt-4 grid grid-cols-1 gap-5 border-t border-border pt-5 md:grid-cols-4">
                <SetupItem
                  ok={serverOk || !health.isError}
                  title="Helper installed"
                  detail="Vox Helper is installed and accessible."
                />
                <SetupItem ok={serverOk} title="Server running" detail="Local server is up and responding." />
                <SetupItem ok={Boolean(modelReady)} title="Demo voice ready" detail="Default voice profile is available." wait={!modelReady} />
                <SetupItem
                  ok={settings.data?.ffmpeg_available !== false}
                  title="Homebrew detected"
                  detail="brew is installed and available."
                />
              </div>
            </Panel>

            <Panel title="Quick API test" icon={null}>
              <p className="mt-2 text-[15px] font-semibold text-muted-foreground">
                Generate a short clip using the local API in three simple steps.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Step active number="1" label="Generate" />
                <StepLine />
                <Step number="2" label="Poll job" />
                <StepLine />
                <Step number="3" label="Download audio" />
              </div>
              <div className="mt-6 grid gap-5">
                <ApiStep title="Step 1: Generate" description="Create a generation job. Copy the request id from the JSON response.">
                  <CodeBlock code={API_GENERATE_SAMPLE}>
                    <span className="text-[oklch(0.34_0.13_250)]">curl</span>{" "}
                    <span className="text-[oklch(0.45_0.14_150)]">-X POST</span>{" "}
                    <span>http://localhost:8000/api/v1/tts</span> {"\\"}
                    {"\n  "}
                    <span className="text-[oklch(0.45_0.14_150)]">-F</span>{" "}
                    <span className="text-[oklch(0.55_0.18_350)]">"text=Hello from Vox Studio."</span> {"\\"}
                    {"\n  "}
                    <span className="text-[oklch(0.45_0.14_150)]">-F</span>{" "}
                    <span className="text-[oklch(0.55_0.18_350)]">"voice_name=noelmo-normal"</span> {"\\"}
                    {"\n  "}
                    <span className="text-[oklch(0.45_0.14_150)]">-F</span>{" "}
                    <span className="text-[oklch(0.55_0.18_350)]">"preset=default"</span>
                  </CodeBlock>
                </ApiStep>

                <ApiStep title="Step 2: Check status" description="Replace {request_id} with the id returned from step 1 and poll until the job is complete.">
                  <CodeBlock code={API_STATUS_SAMPLE}>
                    <span className="text-[oklch(0.34_0.13_250)]">curl</span>{" "}
                    <span>http://localhost:8000/api/v1/jobs/</span>
                    <span className="text-[oklch(0.55_0.18_285)]">{"{request_id}"}</span>
                  </CodeBlock>
                </ApiStep>

                <ApiStep title="Step 3: Download audio" description="Download the finished audio file to the current folder.">
                  <CodeBlock code={API_DOWNLOAD_SAMPLE}>
                    <span className="text-[oklch(0.34_0.13_250)]">curl</span>{" "}
                    <span className="text-[oklch(0.45_0.14_150)]">-L</span>{" "}
                    <span>http://localhost:8000/api/v1/jobs/</span>
                    <span className="text-[oklch(0.55_0.18_285)]">{"{request_id}"}</span>
                    <span>/audio</span> {"\\"}
                    {"\n  "}
                    <span className="text-[oklch(0.45_0.14_150)]">--output</span>{" "}
                    <span className="text-[oklch(0.55_0.18_350)]">voice.mp3</span>
                  </CodeBlock>
                </ApiStep>
              </div>
              <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                The local API docs include the full schema and response fields if you want to automate this from an agent or script.
              </p>
              <div className="mt-5 flex flex-wrap gap-8 text-sm font-black text-[var(--brand)]">
                <a className="inline-flex items-center gap-2 hover:underline" href="/docs">
                  View full API docs <ExternalLink className="h-4 w-4" />
                </a>
                <a className="inline-flex items-center gap-2 hover:underline" href="/api/v1/openapi.json">
                  OpenAPI schema <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </Panel>
          </div>

          <aside className="grid gap-7">
            <Panel title="Where files live" icon={<FolderOpen className="h-6 w-6" />}>
              <p className="mt-2 text-[15px] font-semibold text-muted-foreground">All files are stored locally on your Mac.</p>
              <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                <PathRow label="Application Support" value={appSupport} />
                <PathRow label="Voices" value={settings.data?.voice_dir ?? `${appSupport}/voices`} />
                <PathRow label="Outputs" value={settings.data?.output_dir ?? `${appSupport}/outputs`} />
                <PathRow label="Logs" value="~/Library/Logs/Vox" />
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(appSupport)}
                className="mt-4 inline-flex items-center gap-2 text-sm font-black text-[var(--brand)] hover:underline"
              >
                Copy Application Support path <Copy className="h-4 w-4" />
              </button>
            </Panel>

            <Panel title="Troubleshooting" icon={<Wrench className="h-6 w-6" />}>
              <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                <TroubleRow icon={<RefreshCcw className="h-5 w-5" />} title="Restart from menu bar" detail="Use the Vox Studio menu to restart the server." />
                <TroubleRow icon={<KeyRound className="h-5 w-5" />} title="Add HF_TOKEN" detail="Set your Hugging Face token for voice access." neutral />
                <TroubleRow icon={<FileText className="h-5 w-5" />} title="Check package install log" detail="Review the installation log for any issues." cool />
              </div>
            </Panel>
          </aside>
        </div>
      </section>

      <footer className="sticky bottom-0 z-20 border-t border-border/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[58px] max-w-[1600px] flex-wrap items-center justify-between gap-3 px-7 text-sm font-bold text-muted-foreground xl:px-10">
          <div className="flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${serverOk ? "bg-[oklch(0.56_0.18_150)]" : "bg-[oklch(0.68_0.16_35)]"}`} />
              Server: <code className="font-mono text-foreground">{serverUrl}</code>
            </span>
            <CopyButton value={serverUrl} label="Copy" compact />
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[oklch(0.56_0.18_150)]" /> Helper: Installed
            </span>
            <span className="inline-flex items-center gap-2">
              {modelReady ? <CheckCircle2 className="h-4 w-4 text-[oklch(0.56_0.18_150)]" /> : <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.62_0.14_80)]" />}
              Model: {modelReady ? "Ready" : "Warming"}
            </span>
            <span className="inline-flex items-center gap-2">
              <Volume2 className="h-4 w-4" /> Voices: 6
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono tabular-nums">
              {settings.data ? `${settings.data.macos_version} (${settings.data.chip})` : "macOS"}
            </span>
            <Link
              to="/app/settings"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-black text-foreground transition-colors hover:bg-muted"
            >
              <MonitorCog className="h-4 w-4" /> System Info
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatusBadge({ tone, label }: { tone: "ok" | "bad" | "wait"; label: string }) {
  const color = {
    ok: "border-[oklch(0.86_0.08_150)] bg-[oklch(0.97_0.05_150)] text-[oklch(0.42_0.16_150)]",
    bad: "border-[oklch(0.86_0.08_25)] bg-[oklch(0.98_0.035_25)] text-[oklch(0.5_0.18_25)]",
    wait: "border-[oklch(0.88_0.07_80)] bg-[oklch(0.98_0.045_80)] text-[oklch(0.5_0.13_80)]",
  }[tone];

  return (
    <span className={`hidden h-10 items-center gap-2 rounded-xl border px-4 text-sm font-black shadow-sm sm:inline-flex ${color}`}>
      <span className="h-3 w-3 rounded-full bg-current" />
      {label}
    </span>
  );
}

function LaunchCard({
  title,
  description,
  href,
  route,
  tone,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  route: string;
  tone: "blue" | "teal" | "purple";
  icon: React.ReactNode;
}) {
  const styles = {
    blue: {
      bubble: "bg-[oklch(0.95_0.055_250)] text-[var(--brand)]",
      button: "bg-[linear-gradient(135deg,var(--brand),oklch(0.55_0.22_260))] shadow-[0_16px_32px_rgba(17,111,255,.2)]",
    },
    teal: {
      bubble: "bg-[oklch(0.95_0.06_165)] text-[oklch(0.5_0.15_165)]",
      button: "bg-[linear-gradient(135deg,oklch(0.58_0.15_175),oklch(0.47_0.14_185))] shadow-[0_16px_32px_rgba(0,150,136,.18)]",
    },
    purple: {
      bubble: "bg-[oklch(0.94_0.055_290)] text-[oklch(0.52_0.22_285)]",
      button: "bg-[linear-gradient(135deg,oklch(0.56_0.21_285),oklch(0.53_0.18_255))] shadow-[0_16px_32px_rgba(95,83,220,.18)]",
    },
  }[tone];

  return (
    <a href={href} className="group min-w-0 rounded-3xl border border-border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-center gap-5">
        <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${styles.bubble}`}>{icon}</span>
        <div className="min-w-0">
          <h2 className="text-[24px] font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-[15px] font-semibold text-muted-foreground">{description}</p>
        </div>
      </div>
      <span className={`mt-5 flex h-[58px] min-w-0 items-center gap-4 overflow-hidden rounded-lg pl-7 pr-4 text-[18px] font-black text-white ${styles.button}`}>
        <ExternalLink className="h-5 w-5 shrink-0" />
        <span className="min-w-0 truncate">{title === "API Docs" ? "View API Docs" : title === "View Logs" ? "Open Logs" : "Open Vox Studio"}</span>
        <span className="ml-auto mr-3 shrink-0 rounded-md bg-white/16 px-2.5 py-1 font-mono text-sm text-white/90">{route}</span>
      </span>
    </a>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode | null; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-3 text-[25px] font-black tracking-tight">
        {icon ? <span className="text-foreground">{icon}</span> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function SetupItem({ ok, wait, title, detail }: { ok: boolean; wait?: boolean; title: string; detail: string }) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
      <span className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-white ${ok ? "bg-[oklch(0.56_0.18_150)]" : wait ? "bg-[oklch(0.68_0.15_75)]" : "bg-muted-foreground/35"}`}>
        {ok ? <Check className="h-5 w-5" /> : wait ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertCircle className="h-5 w-5" />}
      </span>
      <div>
        <h3 className="text-[16px] font-black">{title}</h3>
        <p className="mt-1 text-[14px] font-semibold leading-snug text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function Step({ number, label, active }: { number: string; label: string; active?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-black ${active ? "text-[var(--brand)]" : "text-muted-foreground"}`}>
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 ${active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-border bg-white text-muted-foreground"}`}>
        {number}
      </span>
      {label}
    </span>
  );
}

function StepLine() {
  return <span className="hidden h-px w-24 bg-border md:inline-block" />;
}

function ApiStep({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-black">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

function CodeBlock({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-[oklch(0.88_0.035_245)] bg-[oklch(0.985_0.012_245)]">
      <CopyButton value={code} label="Copy" className="absolute right-4 top-4" />
      <pre className="overflow-x-auto p-6 pr-28 text-[14px] leading-7 text-[oklch(0.22_0.03_245)]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-white px-4 py-3 last:border-b-0">
      <Folder className="h-6 w-6 text-foreground/80" />
      <div className="min-w-0">
        <div className="text-[14px] font-black">{label}</div>
        <div className="truncate font-mono text-[12px] font-semibold text-muted-foreground">{value}</div>
      </div>
      <CopyButton value={value} label="Copy" />
    </div>
  );
}

function TroubleRow({ icon, title, detail, neutral, cool }: { icon: React.ReactNode; title: string; detail: string; neutral?: boolean; cool?: boolean }) {
  const tone = neutral
    ? "bg-muted text-foreground/70"
    : cool
      ? "bg-[oklch(0.96_0.035_220)] text-[oklch(0.5_0.13_220)]"
      : "bg-[oklch(0.95_0.06_155)] text-[oklch(0.48_0.15_155)]";

  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-3 border-b border-border bg-white px-4 py-3 last:border-b-0">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[15px] font-black">{title}</div>
        <div className="mt-0.5 text-[13px] font-semibold text-muted-foreground">{detail}</div>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function CopyButton({ value, label, className, compact }: { value: string; label: string; className?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        copyToClipboard(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1300);
      }}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-[13px] font-black text-foreground/70 shadow-sm transition-colors hover:bg-muted ${compact ? "h-8 px-2.5 text-[12px]" : ""} ${className ?? ""}`}
    >
      {copied ? <Check className="h-4 w-4 text-[oklch(0.56_0.18_150)]" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function copyToClipboard(value: string) {
  void navigator.clipboard?.writeText(value);
}
