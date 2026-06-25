import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { BRAND, BRAND_SECONDARY, BRAND_WARM } from "@/lib/theme";
import { clampTrimRange, fullTrimRange, isFullTrimRange, trimmedDuration, type TrimRange } from "@/lib/audio-trim";

type Props = {
  peaks: number[];
  duration: number;
  selection: TrimRange;
  onChange: (next: TrimRange) => void;
  maxDurationSeconds: number;
  playheadSeconds?: number;
  className?: string;
};

const HANDLE_W = 12;
const MIN_SELECTION_PX = 18;

function fmt(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export default function TrimWaveform({
  peaks,
  duration,
  selection,
  onChange,
  maxDurationSeconds,
  playheadSeconds,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: "start" | "end" | null; pointerId: number | null }>({ kind: null, pointerId: null });

  const safeSelection = clampTrimRange(selection, duration);
  const selectedDuration = trimmedDuration(safeSelection);
  const overLimit = duration > maxDurationSeconds && isFullTrimRange(safeSelection, duration);
  const selectionRef = useRef(safeSelection);

  useEffect(() => {
    selectionRef.current = safeSelection;
  }, [safeSelection.end, safeSelection.start]);

  useEffect(() => {
    if (!duration) return;
    if (selection.start === 0 && selection.end === 0) {
      onChange(fullTrimRange(duration));
    }
  }, [duration, onChange, selection.end, selection.start]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const kind = dragRef.current.kind;
      const wrap = wrapRef.current;
      if (!kind || !wrap) return;
      if (dragRef.current.pointerId != null && e.pointerId !== dragRef.current.pointerId) return;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || duration <= 0) return;
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const nextTime = ratio * duration;
      const curr = selectionRef.current;
      if (kind === "start") {
        onChange(clampTrimRange({ start: Math.min(nextTime, curr.end - 0.05), end: curr.end }, duration));
      } else {
        onChange(clampTrimRange({ start: curr.start, end: Math.max(nextTime, curr.start + 0.05) }, duration));
      }
      e.preventDefault();
    };
    const onUp = () => {
      dragRef.current = { kind: null, pointerId: null };
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [duration, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !duration) return;

    let raf = 0;
    const draw = () => {
      const el = wrapRef.current;
      if (!el) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const barW = 2;
      const gap = 2;
      const slot = barW + gap;
      const count = Math.max(1, Math.floor(w / slot));
      const startX = (safeSelection.start / duration) * w;
      const endX = (safeSelection.end / duration) * w;
      const playX = playheadSeconds != null && duration > 0 ? Math.min(w, Math.max(0, (playheadSeconds / duration) * w)) : null;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, BRAND);
      grad.addColorStop(0.55, BRAND_SECONDARY);
      grad.addColorStop(1, BRAND_WARM);

      ctx.fillStyle = "oklch(0.98 0.01 260)";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "oklch(0.56 0.04 240 / 0.12)";
      ctx.fillRect(0, 0, Math.max(0, startX), h);
      ctx.fillRect(Math.min(w, endX), 0, Math.max(0, w - endX), h);

      for (let i = 0; i < count; i++) {
        const p = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
        const bh = Math.max(2, p * (h * 0.84));
        const x = i * slot;
        const y = (h - bh) / 2;
        const within = x >= startX && x <= endX;
        ctx.fillStyle = within ? grad : "oklch(0.55 0.04 240 / 0.3)";
        ctx.beginPath();
        ctx.moveTo(x + 1, y);
        ctx.arcTo(x + barW, y, x + barW, y + bh, 1);
        ctx.arcTo(x + barW, y + bh, x, y + bh, 1);
        ctx.arcTo(x, y + bh, x, y, 1);
        ctx.arcTo(x, y, x + barW, y, 1);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = BRAND_WARM;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, 2);
      ctx.lineTo(startX, h - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(endX, 2);
      ctx.lineTo(endX, h - 2);
      ctx.stroke();

      if (playX != null) {
        ctx.strokeStyle = BRAND_WARM;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playX, 3);
        ctx.lineTo(playX, h - 3);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [duration, peaks, playheadSeconds, safeSelection.end, safeSelection.start]);

  const xFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const updateSelectionFromRatio = (ratio: number, kind: "start" | "end") => {
    const nextTime = ratio * duration;
    const curr = selectionRef.current;
    if (kind === "start") {
      onChange(clampTrimRange({ start: Math.min(nextTime, curr.end - 0.05), end: curr.end }, duration));
    } else {
      onChange(clampTrimRange({ start: curr.start, end: Math.max(nextTime, curr.start + 0.05) }, duration));
    }
  };

  const pickNearestHandle = (ratio: number) => {
    const pos = ratio * duration;
    const distStart = Math.abs(pos - safeSelection.start);
    const distEnd = Math.abs(pos - safeSelection.end);
    return distStart <= distEnd ? "start" : "end";
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-white px-2 py-1 font-mono text-[11px] text-foreground/70">
            Trim {fmt(safeSelection.start)} - {fmt(safeSelection.end)}
          </span>
          <span className="text-muted-foreground">
            Selected {fmt(selectedDuration)} / Raw {fmt(duration)}
          </span>
        </div>
        <span className={overLimit ? "font-semibold text-[var(--brand-warm)]" : "text-muted-foreground"}>
          {overLimit ? `Clip must be trimmed to ${fmt(maxDurationSeconds)} or less` : `Limit ${fmt(maxDurationSeconds)}`}
        </span>
      </div>
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-border bg-[oklch(0.99_0.005_280)]"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (!duration) return;
          const ratio = xFromPointer(e);
          const kind = pickNearestHandle(ratio);
          dragRef.current = { kind, pointerId: e.pointerId };
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          updateSelectionFromRatio(ratio, kind);
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.55), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.5), transparent 60%)" }}
        />
        <canvas ref={canvasRef} className="block h-24 w-full" />

        <button
          type="button"
          className="absolute top-1/2 z-10 flex h-8 w-4 -translate-y-1/2 -translate-x-1/2 items-center justify-center rounded-full border border-white/60 bg-white shadow-sm"
          style={{ left: `${(safeSelection.start / Math.max(duration, 1)) * 100}%` }}
          aria-label="Trim start"
          onPointerDown={(e) => {
            if (!duration) return;
            e.preventDefault();
            e.stopPropagation();
            dragRef.current = { kind: "start", pointerId: e.pointerId };
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          }}
        >
          <span className="h-4 w-1 rounded-full bg-[var(--brand)]" />
        </button>
        <button
          type="button"
          className="absolute top-1/2 z-10 flex h-8 w-4 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-white/60 bg-white shadow-sm"
          style={{ left: `${(safeSelection.end / Math.max(duration, 1)) * 100}%` }}
          aria-label="Trim end"
          onPointerDown={(e) => {
            if (!duration) return;
            e.preventDefault();
            e.stopPropagation();
            dragRef.current = { kind: "end", pointerId: e.pointerId };
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          }}
        >
          <span className="h-4 w-1 rounded-full bg-[var(--brand-warm)]" />
        </button>

        <div
          className="pointer-events-none absolute inset-y-0 bg-white/10"
          style={{ left: `${(safeSelection.start / Math.max(duration, 1)) * 100}%`, width: `${Math.max(0, ((safeSelection.end - safeSelection.start) / Math.max(duration, 1)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
