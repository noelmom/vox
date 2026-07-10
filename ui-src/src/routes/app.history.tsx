import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Loader2,
  X,
  Disc3,
  Gauge,
  Volume2,
  VolumeX,
} from "lucide-react";
import { type Job, type ApiVoice, listJobs, listVoices, getJobAudio, deleteJob, parseServerDate } from "@/lib/api";
import { BRAND, BRAND_GRADIENT, BRAND_SECONDARY, BRAND_WARM } from "@/lib/theme";
import { notifyJobDeleted, notifyJobDeleteFailed, notifyJobDeleting, requestPlayback, usePlayback } from "@/features/playback/PlaybackProvider";

export const Route = createFileRoute("/app/history")({
  head: () => ({ meta: [{ title: "History — Vox Studio" }] }),
  component: HistoryPage,
});

// ─── helpers ────────────────────────────────────────────────────────────────

type DateBucket = "Today" | "Yesterday" | "This Week" | "Earlier";

function dateBucket(isoStr: string): DateBucket {
  const now = new Date();
  const d = parseServerDate(isoStr);
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((nowDay.getTime() - dDay.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "This Week";
  return "Earlier";
}

function fmtDuration(s: number | null | undefined): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtTime(s: number): string {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function fmtJobDate(isoStr: string): string {
  const d = parseServerDate(isoStr);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const bucket = dateBucket(isoStr);
  if (bucket === "Today") return time;
  if (bucket === "Yesterday") return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` at ${time}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const BUCKET_ORDER: DateBucket[] = ["Today", "Yesterday", "This Week", "Earlier"];

function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clipSpeechPeaks(n: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
  const out: number[] = [];
  let i = 0;
  while (i < n) {
    const silence = rand() < 0.18;
    const len = silence ? 3 + Math.floor(rand() * 8) : 10 + Math.floor(rand() * 30);
    const peak = silence ? 0.05 : 0.4 + rand() * 0.6;
    for (let j = 0; j < len && i < n; j++, i++) {
      const env = Math.sin(Math.PI * (j / len));
      const jitter = 0.7 + rand() * 0.6;
      out.push(Math.max(0.03, peak * env * jitter));
    }
  }
  return out;
}

// ─── page ───────────────────────────────────────────────────────────────────

function HistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: jobs = [], isFetching } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => listJobs({ limit: 200 }),
  });

  const { data: voices = [] } = useQuery<ApiVoice[]>({
    queryKey: ["voices"],
    queryFn: listVoices,
  });

  const voiceNames = useMemo(() => new Set(voices.map((v) => v.name)), [voices]);

  const [query, setQuery] = useState("");
  const [filterVoice, setFilterVoice] = useState("All Voices");
  const [filterTone, setFilterTone] = useState("All Tones");
  const [filterFormat, setFilterFormat] = useState("All Formats");
  const [filterDate, setFilterDate] = useState("All Dates");
  const [visibleCount, setVisibleCount] = useState(25);

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === "completed" || j.status === "failed"),
    [jobs],
  );

  const voiceOptions = useMemo(() => {
    const names = new Set(completedJobs.map((j) => j.voice_name ?? "Generic"));
    return ["All Voices", ...Array.from(names).sort()];
  }, [completedJobs]);

  const toneOptions = useMemo(() => {
    const presets = new Set(completedJobs.map((j) => capitalize(j.preset)));
    return ["All Tones", ...Array.from(presets).sort()];
  }, [completedJobs]);

  const formatOptions = ["All Formats", "MP3", "WAV"];
  const dateOptions = ["All Dates", "Today", "Yesterday", "This Week", "Earlier"];

  const filtered = useMemo(() => {
    return completedJobs.filter((j) => {
      if (filterVoice !== "All Voices") {
        const jVoice = j.voice_name ?? "Generic";
        if (jVoice !== filterVoice) return false;
      }
      if (filterTone !== "All Tones" && capitalize(j.preset) !== filterTone) return false;
      if (filterFormat !== "All Formats" && j.output_format.toUpperCase() !== filterFormat) return false;
      if (filterDate !== "All Dates" && dateBucket(j.created_at) !== filterDate) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !j.text.toLowerCase().includes(q) &&
          !(j.voice_name ?? "Generic").toLowerCase().includes(q) &&
          !j.request_id.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [completedJobs, filterVoice, filterTone, filterFormat, filterDate, query]);

  const expiredCount = useMemo(
    () => completedJobs.filter((j) => j.status === "completed" && j.file_available === false).length,
    [completedJobs],
  );

  const { groups, total, showing } = useMemo(() => {
    const bucketMap = new Map<DateBucket, Job[]>();
    for (const j of filtered) {
      const b = dateBucket(j.created_at);
      if (!bucketMap.has(b)) bucketMap.set(b, []);
      bucketMap.get(b)!.push(j);
    }
    let remaining = visibleCount;
    const groups: { label: DateBucket; items: Job[] }[] = [];
    let showing = 0;
    for (const label of BUCKET_ORDER) {
      const all = bucketMap.get(label) ?? [];
      if (!all.length) continue;
      const slice = all.slice(0, remaining);
      remaining -= slice.length;
      showing += slice.length;
      groups.push({ label, items: slice });
      if (remaining <= 0) break;
    }
    return { groups, total: filtered.length, showing };
  }, [filtered, visibleCount]);

  const clearFilters = () => {
    setFilterVoice("All Voices");
    setFilterTone("All Tones");
    setFilterFormat("All Formats");
    setFilterDate("All Dates");
    setQuery("");
  };

  const hasActiveFilters =
    filterVoice !== "All Voices" ||
    filterTone !== "All Tones" ||
    filterFormat !== "All Formats" ||
    filterDate !== "All Dates" ||
    query !== "";

  const handleRegenerate = (job: Job) => {
    localStorage.setItem("vox:regenText", job.text);
    if (job.voice_name) {
      localStorage.setItem("vox:voiceId", JSON.stringify(job.voice_name));
    }
    navigate({ to: "/app/" });
  };

  const handleDelete = async (requestId: string) => {
    notifyJobDeleting(requestId);
    try {
      await deleteJob(requestId);
    } catch (error) {
      notifyJobDeleteFailed(requestId);
      throw error;
    }
    notifyJobDeleted(requestId);
    queryClient.setQueryData<Job[]>(["jobs"], (old) =>
      old ? old.filter((j) => j.request_id !== requestId) : [],
    );
  };

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-black tracking-tight text-foreground">History</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {completedJobs.length} generations · scripts saved forever, audio cleaned up after 7 days.
          </p>
        </div>
      </div>

      {/* Retention banner */}
      {expiredCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-[oklch(0.9_0.05_85)] bg-[oklch(0.985_0.03_85)] px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.07_85)] text-[oklch(0.55_0.15_70)]">
            <Clock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 text-[13px] leading-snug">
            <div className="font-semibold text-foreground">
              Audio from {expiredCount} {expiredCount === 1 ? "clip" : "clips"} has been cleaned up
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
            onChange={(e) => { setQuery(e.target.value); setVisibleCount(25); }}
            placeholder="Search by script, voice, or request ID…"
            className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-4 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[var(--brand)]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter
          </span>
          <FilterChip label="All Voices" value={filterVoice} options={voiceOptions} onChange={(v) => { setFilterVoice(v); setVisibleCount(25); }} />
          <FilterChip label="All Tones" value={filterTone} options={toneOptions} onChange={(v) => { setFilterTone(v); setVisibleCount(25); }} />
          <FilterChip label="All Formats" value={filterFormat} options={formatOptions} onChange={(v) => { setFilterFormat(v); setVisibleCount(25); }} />
          <FilterChip label="All Dates" value={filterDate} options={dateOptions} onChange={(v) => { setFilterDate(v); setVisibleCount(25); }} />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand)] hover:underline"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!isFetching && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="text-4xl">🎙️</span>
          <p className="text-[15px] font-semibold text-foreground/70">
            {hasActiveFilters ? "No results match your filters" : "No generations yet"}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {hasActiveFilters ? "Try clearing the filters above." : "Go to Generate and make your first clip."}
          </p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-2 text-[13px] font-medium text-[var(--brand)] hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Grouped list */}
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[14px] font-bold uppercase tracking-wider text-foreground/70">{g.label}</h2>
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11.5px] text-muted-foreground">
              {g.items.length} {g.items.length === 1 ? "clip" : "clips"}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {g.items.map((job) => (
              <ClipCard
                key={job.request_id}
                job={job}
                voiceMissing={!!job.voice_name && !voiceNames.has(job.voice_name)}
                onRegenerate={() => handleRegenerate(job)}
                onDelete={() => handleDelete(job.request_id)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Load more */}
      {showing < total && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            onClick={() => setVisibleCount((c) => c + 25)}
            className="rounded-xl border border-border bg-white px-5 py-2 text-[13px] font-semibold text-foreground/80 hover:bg-muted"
          >
            Load more
          </button>
          <span className="text-[11.5px] text-muted-foreground">
            Showing {showing} of {total}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== options[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
          active
            ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
            : "border-border bg-white text-foreground/75 hover:bg-muted"
        }`}
      >
        {active ? value : label}
        <ChevronDown className="h-3 w-3 text-current opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[150px] rounded-xl border border-border bg-white py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-muted ${
                value === o ? "font-semibold text-[oklch(0.45_0.22_260)]" : "text-foreground/80"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── clip card ───────────────────────────────────────────────────────────────

function ClipCard({
  job,
  voiceMissing,
  onRegenerate,
  onDelete,
}: {
  job: Job;
  voiceMissing: boolean;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playback = usePlayback();
  const globalActive = playback.current?.request_id === job.request_id;

  const failed = job.status === "failed";
  const initialFetchStatus = failed || job.file_available === false ? "expired" : "ready";

  const [storedFetchStatus, setFetchStatus] = useState<"idle" | "loading" | "ready" | "expired">(initialFetchStatus);
  const fetchStatus = playback.pendingRequestId === job.request_id
    ? "loading"
    : globalActive && playback.current?.file_available === false
      ? "expired"
      : storedFetchStatus;
  const progress = globalActive ? playback.position : 0;
  const [hover, setHover] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const jobPeaks = useMemo(() => clipSpeechPeaks(300, job.request_id), [job.request_id]);
  const peaks = jobPeaks;
  const displayDuration = job.audio_duration_s ?? 0;

  // Canvas draw loop
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = "oklch(0.92 0.01 240)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        const barW = 2;
        const gap = 2;
        const slot = barW + gap;
        const count = Math.floor(w / slot);
        const progressPct = displayDuration > 0 ? progress / displayDuration : 0;
        const playedX = progressPct * w;
        const hoverX = hover != null ? hover * w : null;

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, BRAND);
        grad.addColorStop(0.55, BRAND_SECONDARY);
        grad.addColorStop(1, BRAND_WARM);

        for (let i = 0; i < count; i++) {
          const p = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
          const bh = Math.max(2, p * (h * 0.9));
          const x = i * slot;
          const y = (h - bh) / 2;
          const isPlayed = fetchStatus === "ready" && x < playedX;
          const inHoverPreview = fetchStatus === "ready" && hoverX != null && x >= playedX && x < hoverX;
          if (isPlayed) {
            ctx.fillStyle = grad;
          } else if (inHoverPreview) {
            ctx.fillStyle = BRAND;
          } else {
            ctx.globalAlpha = fetchStatus === "loading" ? 0.22 : 1;
            ctx.fillStyle = "oklch(0.55 0.04 240 / 0.32)";
            ctx.globalAlpha = 1;
          }
          clipRoundedRect(ctx, x, y, barW, bh, 1);
          ctx.fill();
        }

        if (fetchStatus === "ready" && displayDuration > 0) {
          ctx.strokeStyle = BRAND_WARM;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(playedX, 4);
          ctx.lineTo(playedX, h - 4);
          ctx.stroke();
          ctx.fillStyle = BRAND_WARM;
          ctx.beginPath();
          ctx.arc(playedX, h / 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    draw();
    return undefined;
  }, [peaks, progress, displayDuration, hover, fetchStatus]);

  const noAudio = fetchStatus === "expired";
  const longScript = job.text.length > 120;
  const voiceLabel = job.voice_name ?? "Generic";
  const toneLabel = capitalize(job.preset);
  const formatLabel = job.output_format.toUpperCase();
  const badges = [
    fmtDuration(displayDuration || job.audio_duration_s),
    formatLabel,
    ...(job.rtf != null ? [`RTF ${job.rtf.toFixed(2)}x`] : []),
  ];

  const handlePlayClick = async () => {
    if (fetchStatus === "expired" || failed) return;
    if (globalActive && playback.playing) { playback.pause(); return; }
    if (globalActive) { void playback.resume(); return; }
    requestPlayback(job);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (globalActive && displayDuration > 0) {
      playback.seek(pct * displayDuration);
    } else {
      requestPlayback(job);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await getJobAudio(job.request_id);
      const url = URL.createObjectURL(blob);
      const ext = job.output_format === "wav" ? "wav" : "mp3";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${voiceLabel}-${job.request_id.slice(0, 8)}.${ext}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFetchStatus("expired");
    }
  };

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(job.text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(job.request_id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1400);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <article
      className={
        "group relative overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-[0_2px_12px_oklch(0.16_0.02_260/0.06)] " +
        (failed
          ? "border-[oklch(0.9_0.05_25)]"
          : noAudio
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
            : noAudio
              ? "bg-[oklch(0.85_0.05_85)]"
              : "bg-gradient-to-b from-[var(--brand)] to-[var(--brand-secondary)]")
        }
      />

      <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 sm:pl-6">
        {/* Top row: status badges + actions */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {failed ? (
                <Badge tone="error"><XCircle className="h-3 w-3" /> Failed</Badge>
              ) : (
                <Badge tone="ok"><CheckCircle2 className="h-3 w-3" /> Complete</Badge>
              )}
              {noAudio && !failed && (
                <Badge tone="warn"><Clock className="h-3 w-3" /> Audio expired</Badge>
              )}
              {voiceMissing && (
                <Badge tone="error"><Ban className="h-3 w-3" /> Voice missing</Badge>
              )}
            </div>
            {failed && job.error && (
              <div className="mt-1.5 text-[11.5px] text-[oklch(0.5_0.22_25)]">{job.error}</div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {confirmDelete ? (
              <>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-foreground/70 hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg bg-[oklch(0.6_0.22_25)] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </>
            ) : (
              <>
                {noAudio && <RegenerateButton voiceMissing={voiceMissing} onRegenerate={onRegenerate} />}
                <IconAction label="Delete" destructive onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconAction>
              </>
            )}
          </div>
        </div>

        {/* Player or no-audio placeholder */}
        {noAudio ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-[oklch(0.9_0.02_260)] bg-[oklch(0.985_0.005_260)] p-4">
            <span
              className={
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
                (failed
                  ? "bg-[oklch(0.96_0.04_25)] text-[oklch(0.6_0.22_25)]"
                  : "bg-muted text-muted-foreground")
              }
            >
              {failed ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-foreground/85">{voiceLabel}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {toneLabel} · {formatLabel} · {fmtJobDate(job.created_at)}
              </div>
            </div>
            <span className="text-[11.5px] font-medium text-muted-foreground">
              {failed ? "No audio generated" : "Audio cleaned up"}
            </span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[var(--card)] to-[var(--background)]">
            {/* Player header */}
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 pb-3 pt-4 sm:gap-4">
              <button
                onClick={handlePlayClick}
                aria-label={globalActive && playback.playing ? "Pause" : "Play"}
                disabled={fetchStatus === "loading"}
                className="group/btn relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-wait disabled:opacity-80"
                style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
              >
                {globalActive && playback.playing && (
                  <span className="absolute inset-0 -m-1 animate-ping rounded-full border-2 border-[var(--brand)]/30" />
                )}
                {fetchStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : globalActive && playback.playing ? (
                  <Pause className="h-4 w-4" fill="currentColor" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
                )}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Disc3 className="h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
                  <div className="truncate text-[14px] font-bold text-foreground">{voiceLabel}</div>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-foreground/55">
                  {toneLabel} · {formatLabel} · {fmtJobDate(job.created_at)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
                  {badges.map((b) => (
                    <span key={b} className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/65">{b}</span>
                  ))}
                </div>
              </div>

              <div className="hidden shrink-0 items-center gap-2 text-[11.5px] text-foreground/65 sm:flex">
                {badges.map((b) => (
                  <span key={b} className="rounded-md bg-muted px-2 py-1 font-semibold">{b}</span>
                ))}
              </div>
            </div>

            {/* Waveform canvas */}
            <div className="relative mx-4 overflow-hidden rounded-lg border border-border bg-[var(--background)]">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background:
                    "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.5), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.45), transparent 60%)",
                }}
              />
              <canvas
                ref={canvasRef}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
                }}
                onMouseLeave={() => setHover(null)}
                onClick={handleCanvasClick}
                className="relative block h-[88px] w-full cursor-pointer"
              />
              {hover != null && (
                <div
                  className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-background shadow"
                  style={{ left: `${hover * 100}%` }}
                >
                  {fmtTime(hover * displayDuration)}
                </div>
              )}
            </div>

            {/* Transport bar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <ClipVolumeControl value={playback.volume} onChange={playback.setVolume} />
              <ClipSpeedControl value={playback.rate} onChange={playback.setRate} />
              <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground/60">
                {fmtTime(globalActive ? playback.position : progress)}{" "}
                <span className="text-foreground/35">/ {fmtTime(displayDuration)}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-foreground/75 hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-foreground/75 hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Script */}
        <div className="relative rounded-xl border border-[oklch(0.94_0.02_260)] bg-gradient-to-br from-[oklch(0.985_0.01_260)] to-[oklch(0.97_0.02_260)] p-3.5 pl-10">
          <Quote className="absolute left-3 top-3 h-4 w-4 text-[oklch(0.7_0.12_260)]" />
          <p
            className={
              "text-[13.5px] leading-relaxed text-foreground/85 " +
              (expanded || !longScript ? "" : "line-clamp-2")
            }
          >
            {job.text}
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {longScript && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--brand)] hover:underline"
                  >
                    {expanded ? (
                      <><ChevronUp className="h-3 w-3" /> Show less</>
                    ) : (
                      <><ChevronDown className="h-3 w-3" /> Show full script</>
                    )}
                  </button>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {job.text.split(/\s+/).filter(Boolean).length} words · {job.text.length} chars
                </span>
              </div>
              <button
                onClick={handleCopyScript}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-semibold transition-colors " +
                  (copied
                    ? "bg-[oklch(0.94_0.08_145)] text-[oklch(0.45_0.16_145)]"
                    : "bg-white text-foreground/70 hover:bg-muted")
                }
              >
                {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy script</>}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            Request ID
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/75">
              {job.request_id.slice(0, 8)}…
            </code>
            <button
              aria-label="Copy request ID"
              onClick={handleCopyId}
              className={copiedId ? "text-[oklch(0.45_0.16_145)]" : "text-foreground/40 hover:text-foreground"}
            >
              {copiedId ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </span>
          {!noAudio && job.rtf != null && (
            <span>RTF {job.rtf.toFixed(2)}x · realtime factor</span>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

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
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function IconAction({
  children,
  label,
  destructive,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  destructive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        "flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-foreground/55 transition-colors hover:border-border hover:bg-muted " +
        (destructive ? "hover:text-[oklch(0.55_0.22_25)]" : "hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function RegenerateButton({
  voiceMissing,
  onRegenerate,
}: {
  voiceMissing?: boolean;
  onRegenerate: () => void;
}) {
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
          Voice profile missing — re-upload to regenerate
        </span>
      </span>
    );
  }
  return (
    <button
      onClick={onRegenerate}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--brand-secondary)] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-95"
    >
      <Sparkles className="h-3.5 w-3.5" />
      Regenerate
    </button>
  );
}

function ClipVolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const muted = value === 0;
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-white px-2 py-1">
      <button
        onClick={() => onChange(muted ? 0.8 : 0)}
        className="text-foreground/60 hover:text-foreground"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
      <div className="relative h-1 w-20 rounded-full bg-muted">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${value * 100}%`,
            background: `linear-gradient(90deg, ${BRAND}, ${BRAND_WARM})`,
          }}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
          aria-label="Volume"
        />
        <span
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[var(--brand)] shadow"
          style={{ left: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

function ClipSpeedControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[12px] font-semibold text-foreground/70 hover:bg-muted"
      >
        <Gauge className="h-3.5 w-3.5" />
        {value}x
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1.5 flex gap-1 rounded-lg border border-border bg-white p-1 shadow-lg">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={
                "rounded-md px-2 py-1 text-[11.5px] font-semibold " +
                (s === value
                  ? "bg-[var(--brand)] text-white"
                  : "text-foreground/70 hover:bg-muted")
              }
            >
              {s}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
