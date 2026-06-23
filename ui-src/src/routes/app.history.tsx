import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Play,
  Pause,
  Download,
  Trash2,
  Copy,
  Check,
  Quote,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  AlertTriangle,
  Filter,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";

export const Route = createFileRoute("/app/history")({
  head: () => ({ meta: [{ title: "History — Vox Studio" }] }),
  component: HistoryPage,
});

type Clip = {
  id: string;
  script: string;
  voice: string;
  tone: string;
  format: "MP3" | "WAV";
  createdAt: string; // human label
  bucket: "Today" | "Earlier";
  duration: string;
  durationSec: number;
  rtf: number;
  audioExpired?: boolean;
  status: "complete" | "failed";
  failureReason?: string;
  voiceMissing?: boolean;
};

const CLIPS: Clip[] = [
  {
    id: "5f3a2b1c",
    script:
      "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.",
    voice: "Noelmo Normal",
    tone: "Neutral",
    format: "MP3",
    createdAt: "2:34 PM",
    bucket: "Today",
    duration: "0:22",
    durationSec: 22.4,
    rtf: 0.82,
    status: "complete",
  },
  {
    id: "d1e4f7a9",
    script:
      "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.",
    voice: "Moby Dick",
    tone: "Neutral",
    format: "WAV",
    createdAt: "1:15 PM",
    bucket: "Today",
    duration: "0:18",
    durationSec: 18.7,
    rtf: 0.76,
    status: "failed",
    failureReason: "Model timed out after 30s",
  },
  {
    id: "a9c7d0e2",
    script:
      "To be, or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles.",
    voice: "Generic",
    tone: "Dramatic",
    format: "MP3",
    createdAt: "10:32 AM",
    bucket: "Today",
    duration: "0:15",
    durationSec: 15.2,
    rtf: 0.81,
    status: "complete",
  },
  {
    id: "1b8e9d3f",
    script:
      "All happy families are alike; each unhappy family is unhappy in its own way. Everything was in confusion in the Oblonskys' house.",
    voice: "Pride and Prejudice",
    tone: "Warm",
    format: "MP3",
    createdAt: "Yesterday, 4:18 PM",
    bucket: "Earlier",
    duration: "0:24",
    durationSec: 24.6,
    rtf: 0.83,
    status: "complete",
    audioExpired: true,
    voiceMissing: true,
  },
  {
    id: "e2d6c7b4",
    script:
      "Mr. Sherlock Holmes, who was usually very late in the mornings, save upon those not infrequent occasions when he was up all night, was seated at the breakfast table.",
    voice: "Sherlock Holmes",
    tone: "Neutral",
    format: "WAV",
    createdAt: "Yesterday, 11:07 AM",
    bucket: "Earlier",
    duration: "0:20",
    durationSec: 20.1,
    rtf: 0.79,
    status: "complete",
    audioExpired: true,
  },
];

const FILTERS = [
  { label: "All Voices", options: ["All Voices", "Noelmo Normal", "Moby Dick", "Generic", "Sherlock Holmes", "Pride and Prejudice"] },
  { label: "All Tones", options: ["All Tones", "Neutral", "Dramatic", "Warm"] },
  { label: "All Formats", options: ["All Formats", "MP3", "WAV"] },
  { label: "All Dates", options: ["All Dates", "Today", "Yesterday", "This week"] },
];

function HistoryPage() {
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      CLIPS.filter(
        (c) =>
          c.script.toLowerCase().includes(query.toLowerCase()) ||
          c.voice.toLowerCase().includes(query.toLowerCase()) ||
          c.id.includes(query.toLowerCase()),
      ),
    [query],
  );

  const groups: { label: Clip["bucket"]; items: Clip[] }[] = [
    { label: "Today", items: filtered.filter((c) => c.bucket === "Today") },
    { label: "Earlier", items: filtered.filter((c) => c.bucket === "Earlier") },
  ];

  const expiredCount = CLIPS.filter((c) => c.audioExpired).length;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-black tracking-tight text-foreground">History</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {CLIPS.length} generations · scripts saved forever, audio cleaned up after 7 days.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium text-foreground/80 hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Retention banner */}
      {expiredCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-[oklch(0.9_0.05_85)] bg-[oklch(0.985_0.03_85)] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.07_85)] text-[oklch(0.55_0.15_70)]">
            <Clock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 text-[13px] leading-snug">
            <div className="font-semibold text-foreground">
              {expiredCount} {expiredCount === 1 ? "clip's" : "clips'"} audio was cleaned up
            </div>
            <div className="text-muted-foreground">
              We trim audio after 7 days to save space. The scripts are still here — regenerate any time with one click.
            </div>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col gap-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by script, voice, or request ID…"
            className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-4 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter
          </span>
          {FILTERS.map((f) => (
            <FilterChip key={f.label} label={f.label} />
          ))}
          <button className="ml-auto text-[12px] font-medium text-[oklch(0.55_0.22_260)] hover:underline">
            Clear filters
          </button>
        </div>
      </div>

      {/* Grouped list */}
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.label} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[14px] font-bold uppercase tracking-wider text-foreground/70">
                  {g.label}
                </h2>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11.5px] text-muted-foreground">
                  {g.items.length} {g.items.length === 1 ? "clip" : "clips"}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {g.items.map((c) => (
                  <ClipCard
                    key={c.id}
                    clip={c}
                    playing={playing === c.id}
                    onToggle={() =>
                      setPlaying((p) => (p === c.id ? null : c.audioExpired ? null : c.id))
                    }
                  />
                ))}
              </div>
            </section>
          ),
      )}

      <div className="flex flex-col items-center gap-2 pt-2">
        <button className="rounded-xl border border-border bg-white px-5 py-2 text-[13px] font-semibold text-foreground/80 hover:bg-muted">
          Load more
        </button>
        <span className="text-[11.5px] text-muted-foreground">
          Showing {filtered.length} of {CLIPS.length}
        </span>
      </div>
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[12.5px] font-medium text-foreground/75 hover:bg-muted">
      {label}
      <ChevronDown className="h-3 w-3 text-foreground/50" />
    </button>
  );
}

function ClipCard({
  clip,
  playing,
  onToggle,
}: {
  clip: Clip;
  playing: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const longScript = clip.script.length > 120;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clip.script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };

  const failed = clip.status === "failed";
  const noAudio = clip.audioExpired || failed;

  return (
    <article
      className={
        "group relative overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-[0_2px_12px_oklch(0.16_0.02_260/0.06)] " +
        (failed
          ? "border-[oklch(0.9_0.05_25)]"
          : clip.audioExpired
            ? "border-dashed border-[oklch(0.88_0.02_260)]"
            : "border-border")
      }
    >
      {/* Accent stripe */}
      <span
        aria-hidden
        className={
          "absolute left-0 top-0 h-full w-[3px] " +
          (failed
            ? "bg-[oklch(0.65_0.22_25)]"
            : clip.audioExpired
              ? "bg-[oklch(0.85_0.05_85)]"
              : "bg-gradient-to-b from-[oklch(0.65_0.2_260)] to-[oklch(0.5_0.22_270)]")
        }
      />

      <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6">
        {/* Top row: play + meta + badges */}
        <div className="flex items-start gap-3">
          <button
            onClick={onToggle}
            disabled={noAudio}
            aria-label={failed ? "Generation failed" : clip.audioExpired ? "Audio expired" : playing ? "Pause" : "Play"}
            className={
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all " +
              (failed
                ? "cursor-not-allowed bg-[oklch(0.96_0.04_25)] text-[oklch(0.6_0.22_25)]"
                : clip.audioExpired
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)] hover:bg-[oklch(0.92_0.05_260)] hover:scale-105")
            }
          >
            {failed ? (
              <XCircle className="h-4 w-4" />
            ) : clip.audioExpired ? (
              <AlertTriangle className="h-4 w-4" />
            ) : playing ? (
              <Pause className="h-4 w-4" fill="currentColor" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span className="font-semibold text-foreground/85">{clip.voice}</span>
              <Dot />
              <span>{clip.tone}</span>
              <Dot />
              <span>{clip.format}</span>
              <Dot />
              <span>{clip.createdAt}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {failed ? (
                <Badge tone="error">
                  <XCircle className="h-3 w-3" /> Failed
                </Badge>
              ) : (
                <Badge tone="ok">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </Badge>
              )}
              <Badge tone="neutral">{clip.format}</Badge>
              <Badge tone="neutral">{clip.durationSec}s</Badge>
              {clip.audioExpired && (
                <Badge tone="warn">
                  <Clock className="h-3 w-3" /> Audio expired
                </Badge>
              )}
              {clip.voiceMissing && (
                <Badge tone="error">
                  <Ban className="h-3 w-3" /> Voice missing
                </Badge>
              )}
              {!failed && !clip.audioExpired && (
                <Badge tone="neutral">RTF {clip.rtf}x</Badge>
              )}
            </div>
            {failed && clip.failureReason && (
              <div className="mt-1.5 text-[11.5px] text-[oklch(0.5_0.22_25)]">
                {clip.failureReason}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {noAudio ? (
              <RegenerateButton voiceMissing={clip.voiceMissing} />
            ) : (
              <IconAction label="Download">
                <Download className="h-3.5 w-3.5" />
              </IconAction>
            )}
            {!noAudio && (
              <IconAction label="Regenerate">
                <RefreshCw className="h-3.5 w-3.5" />
              </IconAction>
            )}
            <IconAction label="Delete" destructive>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </div>
        </div>


        {/* Script card — the clever bit */}
        <div className="relative rounded-xl border border-[oklch(0.94_0.02_260)] bg-gradient-to-br from-[oklch(0.985_0.01_260)] to-[oklch(0.97_0.02_260)] p-3.5 pl-10">
          <Quote className="absolute left-3 top-3 h-4 w-4 text-[oklch(0.7_0.12_260)]" />
          <p
            className={
              "text-[13.5px] leading-relaxed text-foreground/85 " +
              (expanded || !longScript ? "" : "line-clamp-2")
            }
          >
            {clip.script}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {longScript && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[oklch(0.55_0.22_260)] hover:underline"
                >
                  {expanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" /> Show full script
                    </>
                  )}
                </button>
              )}
              <span className="text-[11px] text-muted-foreground">
                {clip.script.split(/\s+/).length} words · {clip.script.length} chars
              </span>
            </div>
            <button
              onClick={copy}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors " +
                (copied
                  ? "bg-[oklch(0.94_0.08_145)] text-[oklch(0.45_0.16_145)]"
                  : "bg-white text-foreground/70 hover:bg-muted")
              }
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy script
                </>
              )}
            </button>
          </div>
        </div>

        {/* Waveform / footer row */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">0:00</span>
          <Waveform muted={clip.audioExpired} />
          <span className="text-[11px] tabular-nums text-muted-foreground">{clip.duration}</span>
        </div>

        <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            Request ID
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/75">
              {clip.id}
            </code>
            <button
              aria-label="Copy request ID"
              className="text-foreground/40 hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
          {!clip.audioExpired && <span>RTF {clip.rtf}x · realtime factor</span>}
        </div>
      </div>
    </article>
  );
}

function Dot() {
  return <span className="text-muted-foreground/50">·</span>;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "ok" | "warn" | "error";
}) {
  const cls =
    tone === "warn"
      ? "bg-[oklch(0.96_0.07_85)] text-[oklch(0.45_0.15_70)]"
      : tone === "ok"
        ? "bg-[oklch(0.96_0.05_145)] text-[oklch(0.4_0.13_145)]"
        : tone === "error"
          ? "bg-[oklch(0.96_0.05_25)] text-[oklch(0.5_0.22_25)]"
          : "bg-muted text-foreground/70";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold " +
        cls
      }
    >
      {children}
    </span>
  );
}

function RegenerateButton({ voiceMissing }: { voiceMissing?: boolean }) {
  if (voiceMissing) {
    return (
      <span className="group/btn relative inline-flex">
        <button
          disabled
          aria-disabled
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-gradient-to-br from-[oklch(0.7_0.2_25)] to-[oklch(0.55_0.22_25)] px-3 py-1.5 text-[12.5px] font-semibold text-white opacity-90 shadow-sm"
        >
          <Ban className="h-3.5 w-3.5" />
          Regenerate
        </button>
        <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-44 rounded-lg border border-border bg-white px-2.5 py-1.5 text-center text-[11.5px] font-medium text-foreground/80 opacity-0 shadow-lg transition-opacity group-hover/btn:opacity-100">
          Voice profile missing
        </span>
      </span>
    );
  }
  return (
    <button className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[oklch(0.6_0.2_260)] to-[oklch(0.5_0.22_270)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-95">
      <Sparkles className="h-3.5 w-3.5" />
      Regenerate
    </button>
  );
}


function IconAction({
  children,
  label,
  destructive,
}: {
  children: React.ReactNode;
  label: string;
  destructive?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={
        "flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-foreground/55 transition-colors hover:border-border hover:bg-muted " +
        (destructive ? "hover:text-[oklch(0.55_0.22_25)]" : "hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function Waveform({ muted }: { muted?: boolean }) {
  const bars = 64;
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const h = 20 + Math.abs(Math.sin(i * 0.7)) * 70 + (i % 5) * 4;
        return (
          <span
            key={i}
            className={
              "block min-w-[2px] flex-1 rounded-full " +
              (muted
                ? "bg-[oklch(0.88_0.01_260)]"
                : "bg-[oklch(0.55_0.22_260)]/55")
            }
            style={{ height: `${Math.min(100, h)}%` }}
          />
        );
      })}
    </div>
  );
}
