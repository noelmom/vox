import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Filter,
  FileText,
  Home,
  Info,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
} from "lucide-react";

import voxLogoV2 from "@/assets/vox-logo-v2.png";
import { getLogFile, type LogFileName } from "@/lib/api";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "Logs — Vox Studio" },
      { name: "description", content: "Human-readable local Vox log viewer." },
    ],
  }),
  component: LogsPage,
});

type Level = "info" | "warning" | "error" | "debug" | "other";

type ParsedLogLine = {
  id: string;
  raw: string;
  timestamp: string;
  level: Level;
  source: string;
  requestId: string;
  message: string;
  lineNumber: number;
};

const FILE_OPTIONS: { value: LogFileName; label: string; path: string }[] = [
  { value: "server", label: "Server", path: "~/Library/Logs/Vox/vox.log" },
  { value: "server-error", label: "Server Errors", path: "~/Library/Logs/Vox/vox-error.log" },
  { value: "helper", label: "Helper", path: "~/Library/Logs/Vox/vox-helper.log" },
  { value: "helper-error", label: "Helper Errors", path: "~/Library/Logs/Vox/vox-helper-error.log" },
  { value: "install", label: "Install", path: "~/Library/Logs/Vox/install.log" },
];

const LINE_OPTIONS = [100, 200, 500, 1000];

function LogsPage() {
  const [fileName, setFileName] = useState<LogFileName>("server");
  const [lineCount, setLineCount] = useState(200);
  const [level, setLevel] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const logs = useQuery({
    queryKey: ["log-file", fileName, lineCount],
    queryFn: () => getLogFile(fileName, lineCount),
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
  });

  const rows = useMemo(() => {
    const lines = logs.data?.lines ?? [];
    return lines.map((line, index) => parseLogLine(line, index));
  }, [logs.data?.lines]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const levelOk = level === "all" || row.level === level;
      const queryOk = !needle || [row.timestamp, row.level, row.source, row.requestId, row.message, row.raw]
        .some((value) => value.toLowerCase().includes(needle));
      return levelOk && queryOk;
    });
  }, [rows, level, query]);

  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const selectedFile = FILE_OPTIONS.find((file) => file.value === fileName) ?? FILE_OPTIONS[0];

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map((row) => row.raw).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1400);
    } catch {
      /* noop */
    }
  };

  const downloadVisible = () => {
    const blob = new Blob([filtered.map((row) => row.raw).join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fcff_0%,#eef8ff_48%,#ffffff_100%)] text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/86 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] max-w-[1500px] flex-wrap items-center justify-between gap-4 px-6 lg:px-10">
          <div className="flex items-center gap-4">
            <img src={voxLogoV2} alt="VOX studio" className="h-12 w-auto" />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div>
              <h1 className="text-[24px] font-black tracking-tight">Logs</h1>
              <p className="text-[12px] font-semibold text-muted-foreground">Readable local server, helper, and install logs</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-[oklch(0.86_0.08_150)] bg-[oklch(0.97_0.05_150)] px-3 text-[12px] font-bold text-[oklch(0.42_0.16_150)]">
              <Server className="h-3.5 w-3.5" />
              Local server
            </span>
            <button onClick={() => logs.refetch()} className="vox-control inline-flex h-9 items-center gap-2 px-3 text-[12px] font-bold">
              <RefreshCw className={`h-3.5 w-3.5 ${logs.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={copyVisible} className="vox-control inline-flex h-9 items-center gap-2 px-3 text-[12px] font-bold">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={downloadVisible} className="vox-control inline-flex h-9 items-center gap-2 px-3 text-[12px] font-bold">
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <Link to="/" className="vox-control inline-flex h-9 items-center gap-2 px-3 text-[12px] font-bold">
              <Home className="h-3.5 w-3.5" />
              Welcome
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-6 py-7 lg:px-10">
        <div className="mb-5 rounded-3xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[18px] font-black tracking-tight">
                <Filter className="h-5 w-5 text-[var(--brand)]" />
                Filter logs
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Viewing <span className="text-foreground">{selectedFile.label}</span> from <code className="font-mono">{logs.data?.path ?? selectedFile.path}</code>
              </p>
            </div>
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-[12px] font-black text-muted-foreground">
              {filtered.length} visible · {rows.length} loaded
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(240px,320px)_auto] lg:items-center">
            <div className="flex flex-wrap gap-2">
              {FILE_OPTIONS.map((file) => (
                <button
                  key={file.value}
                  onClick={() => { setFileName(file.value); setSelectedId(null); }}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[12.5px] font-black transition-colors ${
                    fileName === file.value
                      ? "bg-[var(--brand)] text-white shadow-md"
                      : "border border-border bg-white text-foreground/70 hover:border-[var(--brand)]/35 hover:bg-[var(--brand-soft)]/40"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {file.label}
                </button>
              ))}
            </div>

            <div className="flex overflow-hidden rounded-lg border border-border bg-white p-1 shadow-sm">
              {(["all", "info", "warning", "error"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setLevel(value)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-black capitalize transition-colors ${
                    level === value ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-foreground/55 hover:text-foreground"
                  }`}
                >
                  {value === "all" ? <Filter className="h-3.5 w-3.5" /> : <LevelDot level={value} />}
                  {value}
                </button>
              ))}
            </div>

            <label className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search logs"
                className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm font-semibold outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border bg-white p-1 shadow-sm">
                {LINE_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setLineCount(count)}
                    className={`h-8 rounded-md px-2.5 text-[11.5px] font-black tabular-nums transition-colors ${
                      lineCount === count ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-foreground/55 hover:text-foreground"
                    }`}
                    aria-label={`Show last ${count} lines`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-[12.5px] font-bold text-foreground/75 shadow-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Auto refresh
              </label>
            </div>
          </div>
        </div>

        {logs.isError ? (
          <div className="rounded-3xl border border-[oklch(0.82_0.1_25)] bg-[oklch(0.99_0.02_25)] p-6 text-[oklch(0.48_0.18_25)]">
            <div className="flex items-center gap-2 font-black">
              <ShieldAlert className="h-5 w-5" />
              Could not load {selectedFile.label}
            </div>
            <p className="mt-2 text-sm">The log file may not exist yet. Try another log source or generate activity first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
              <div className="grid grid-cols-[150px_96px_minmax(150px,200px)_minmax(150px,190px)_minmax(300px,1fr)] border-b border-border bg-[linear-gradient(180deg,#f8fcff,#eef7ff)] px-4 py-3 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                <div>Time</div>
                <div>Level</div>
                <div>Source</div>
                <div>Request ID</div>
                <div>Message</div>
              </div>
              <div className="max-h-[620px] overflow-auto">
                {filtered.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
                      <Search className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-[17px] font-black text-foreground">No matching log lines</h3>
                    <p className="mt-1 max-w-[360px] text-sm font-semibold leading-relaxed text-muted-foreground">
                      Try another source, clear the search text, or increase the line count.
                    </p>
                  </div>
                ) : filtered.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`grid w-full grid-cols-[150px_96px_minmax(150px,200px)_minmax(150px,190px)_minmax(300px,1fr)] items-start gap-0 border-b border-border/70 px-4 py-3 text-left text-[12.5px] transition-colors hover:bg-[var(--brand-soft)]/50 ${
                      selected?.id === row.id ? "bg-[var(--brand-soft)]" : "bg-white"
                    }`}
                  >
                    <div className="font-mono text-[11.5px] text-foreground/55">{formatTimestamp(row.timestamp)}</div>
                    <div><LevelBadge level={row.level} /></div>
                    <div className="break-words pr-3 font-semibold text-foreground/70">{row.source}</div>
                    <div className="break-all pr-3 font-mono text-[11.5px] text-foreground/55">{row.requestId}</div>
                    <div className="min-w-0 whitespace-normal break-words pr-3 font-medium leading-relaxed text-foreground/82">{row.message}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-3 text-[12px] font-semibold text-muted-foreground">
                <span>Showing {filtered.length} of latest {rows.length} log lines</span>
                <button
                  type="button"
                  onClick={() => copyValue("path", logs.data?.path ?? selectedFile.path)}
                  className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 font-mono text-[11.5px] text-foreground/60 hover:bg-muted"
                >
                  <span className="truncate">{logs.data?.path ?? selectedFile.path}</span>
                  {copiedKey === "path" ? <Check className="h-3.5 w-3.5 text-[oklch(0.56_0.18_150)]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </section>

            <aside className="rounded-3xl border border-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-foreground/70">
                <FileText className="h-4 w-4 text-[var(--brand)]" />
                Selected Entry
              </div>
              {selected ? (
                <div className="space-y-4">
                  <DetailRow label="Level"><LevelBadge level={selected.level} /></DetailRow>
                  <CopyDetailRow label="Timestamp" value={selected.timestamp || "—"} copied={copiedKey === "timestamp"} onCopy={() => copyValue("timestamp", selected.timestamp || "")} />
                  <CopyDetailRow label="Source" value={selected.source || "—"} copied={copiedKey === "source"} onCopy={() => copyValue("source", selected.source || "")} />
                  <CopyDetailRow label="Request ID" value={selected.requestId || "—"} copied={copiedKey === "request"} onCopy={() => copyValue("request", selected.requestId || "")} />
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      Message
                      <CopyIconButton copied={copiedKey === "message"} onClick={() => copyValue("message", selected.message || selected.raw)} />
                    </div>
                    <div className="whitespace-pre-wrap break-words rounded-xl border border-border bg-muted p-3 text-[13px] leading-relaxed text-foreground/80">{selected.message || selected.raw}</div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                      Raw Line
                      <CopyIconButton copied={copiedKey === "raw"} onClick={() => copyValue("raw", selected.raw)} />
                    </div>
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-[oklch(0.14_0.025_250)] p-3 text-[11.5px] leading-relaxed text-[oklch(0.9_0.04_235)]"><code>{selected.raw}</code></pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a log line to inspect details.</p>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function parseLogLine(raw: string, index: number): ParsedLogLine {
  const match = raw.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+\[(\w+)\]\s+request_id=([^\s]+)\s+([^:]+):\s*(.*)$/);
  if (match) {
    return {
      id: `${index}-${raw}`,
      raw,
      timestamp: match[1],
      level: normalizeLevel(match[2]),
      requestId: match[3] === "-" ? "—" : match[3],
      source: match[4],
      message: match[5],
      lineNumber: index + 1,
    };
  }

  const uvicornMatch = raw.match(/^(INFO|WARNING|ERROR|DEBUG):\s+(.*)$/i);
  if (uvicornMatch) {
    return {
      id: `${index}-${raw}`,
      raw,
      timestamp: "",
      level: normalizeLevel(uvicornMatch[1]),
      requestId: "—",
      source: "uvicorn",
      message: uvicornMatch[2],
      lineNumber: index + 1,
    };
  }

  return {
    id: `${index}-${raw}`,
    raw,
    timestamp: "",
    level: normalizeLevel(raw),
    requestId: "—",
    source: "log",
    message: raw || "(blank line)",
    lineNumber: index + 1,
  };
}

function normalizeLevel(value: string): Level {
  const lower = value.toLowerCase();
  if (lower.includes("error") || lower.includes("traceback") || lower.includes("failed")) return "error";
  if (lower.includes("warn")) return "warning";
  if (lower.includes("debug")) return "debug";
  if (lower.includes("info")) return "info";
  return "other";
}

function formatTimestamp(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function LevelBadge({ level }: { level: Level }) {
  const map = {
    info: { label: "Info", icon: Info, className: "bg-[oklch(0.97_0.04_235)] text-[oklch(0.5_0.18_235)] border-[oklch(0.88_0.06_235)]" },
    warning: { label: "Warning", icon: AlertTriangle, className: "bg-[oklch(0.98_0.045_80)] text-[oklch(0.5_0.13_80)] border-[oklch(0.86_0.06_80)]" },
    error: { label: "Error", icon: ShieldAlert, className: "bg-[oklch(0.98_0.035_25)] text-[oklch(0.5_0.18_25)] border-[oklch(0.86_0.08_25)]" },
    debug: { label: "Debug", icon: FileText, className: "bg-muted text-foreground/65 border-border" },
    other: { label: "Other", icon: FileText, className: "bg-muted text-foreground/65 border-border" },
  }[level];
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black ${map.className}`}>
      <Icon className="h-3 w-3" />
      {map.label}
    </span>
  );
}

function LevelDot({ level }: { level: Exclude<Level, "debug" | "other"> }) {
  const color = {
    info: "bg-[oklch(0.58_0.18_235)]",
    warning: "bg-[oklch(0.66_0.15_80)]",
    error: "bg-[oklch(0.58_0.2_25)]",
  }[level];
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="break-all text-[13px] font-semibold text-foreground/80">{children}</div>
    </div>
  );
}

function CopyDetailRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-muted-foreground">
        {label}
        {value !== "—" ? <CopyIconButton copied={copied} onClick={onCopy} /> : null}
      </div>
      <div className="break-all rounded-lg border border-border bg-muted/55 px-2.5 py-2 font-mono text-[12px] font-semibold leading-relaxed text-foreground/75">
        {value}
      </div>
    </div>
  );
}

function CopyIconButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white text-foreground/55 shadow-sm transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Copy value"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[oklch(0.56_0.18_150)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
