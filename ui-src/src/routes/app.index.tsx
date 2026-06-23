import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Search,
  ChevronDown,
  ChevronRight,
  Pause,
  Info,
  Filter,
  Download,
  RefreshCw,
  MoreVertical,
  Play,
  Volume2,
  VolumeX,
  AudioLines,
  Sparkles,
  Keyboard,
  Disc3,
  Star,
  Check,
  Plus,
  Upload,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Generate — Vox Studio" },
      { name: "description", content: "Turn scripts into private, local speech." },
    ],
  }),
  component: GeneratePage,
});

const TONES = ["Default", "Warm", "Calm", "Bright", "Dramatic", "Energetic", "Custom"];

type VoiceCategory = "Narration" | "Character" | "Conversational" | "Custom";
type Voice = {
  id: string;
  name: string;
  category: VoiceCategory;
  tags: string[];
  accent: "indigo" | "teal" | "amber" | "rose" | "violet" | "slate";
};

const VOICES: Voice[] = [
  { id: "noelmo-normal", name: "Noelmo Normal", category: "Narration", tags: ["Clear", "Neutral", "Narration"], accent: "slate" },
  { id: "noelmo-warm", name: "Noelmo Warm", category: "Narration", tags: ["Warm", "Mellow"], accent: "amber" },
  { id: "ava-bright", name: "Ava Bright", category: "Conversational", tags: ["Bright", "Friendly"], accent: "teal" },
  { id: "kai-deep", name: "Kai Deep", category: "Narration", tags: ["Deep", "Cinematic"], accent: "indigo" },
  { id: "luna-soft", name: "Luna Soft", category: "Conversational", tags: ["Soft", "Calm"], accent: "violet" },
  { id: "rex-hero", name: "Rex Hero", category: "Character", tags: ["Bold", "Dramatic"], accent: "rose" },
  { id: "pip-quirky", name: "Pip Quirky", category: "Character", tags: ["Playful", "Quirky"], accent: "amber" },
  { id: "my-custom-01", name: "My Custom 01", category: "Custom", tags: ["Cloned"], accent: "teal" },
];

const ACCENT_BG: Record<Voice["accent"], string> = {
  indigo: "oklch(0.55 0.22 260)",
  teal: "oklch(0.62 0.13 175)",
  amber: "oklch(0.72 0.16 70)",
  rose: "oklch(0.62 0.20 15)",
  violet: "oklch(0.55 0.20 300)",
  slate: "oklch(0.16 0.02 260)",
};

const VOICE_FILTERS: ("All" | VoiceCategory)[] = ["All", "Narration", "Conversational", "Character", "Custom"];

const ADVANCED_DEFAULTS = {
  exaggeration: 0.5,
  cfg: 0.5,
  temperature: 0.8,
  repetition: 1.2,
  topP: 1,
  minP: 0.05,
};

const ADVANCED_FIELDS: {
  key: keyof typeof ADVANCED_DEFAULTS;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "exaggeration", label: "Exaggeration", hint: "Delivery drama & pace. Higher = more expressive.", min: 0, max: 1, step: 0.05 },
  { key: "cfg", label: "CFG Weight", hint: "How closely the model follows the voice prompt.", min: 0, max: 1, step: 0.05 },
  { key: "temperature", label: "Temperature", hint: "Randomness. Higher = more varied, natural delivery.", min: 0, max: 1.5, step: 0.05 },
  { key: "repetition", label: "Repetition Penalty", hint: "Discourages repeated sounds. Keep near 1.2.", min: 1, max: 2, step: 0.05 },
  { key: "topP", label: "Top P", hint: "Nucleus sampling threshold.", min: 0, max: 1, step: 0.05 },
  { key: "minP", label: "Min P", hint: "Minimum token probability floor.", min: 0, max: 1, step: 0.01 },
];

const MP3_PRESETS = [
  { id: "96", label: "96 kbps", desc: "Smallest · voice memos" },
  { id: "128", label: "128 kbps", desc: "Default · web sharing" },
  { id: "192", label: "192 kbps", desc: "High · podcast" },
  { id: "256", label: "256 kbps", desc: "Very high" },
  { id: "320", label: "320 kbps", desc: "Max MP3 bitrate" },
] as const;

const WAV_PRESETS = [
  { id: "16-44", label: "16-bit · 44.1 kHz", short: "16-bit · 44.1k", desc: "CD quality" },
  { id: "16-48", label: "16-bit · 48 kHz", short: "16-bit · 48k", desc: "Default · video" },
  { id: "24-48", label: "24-bit · 48 kHz", short: "24-bit · 48k", desc: "Studio · editing" },
  { id: "24-96", label: "24-bit · 96 kHz", short: "24-bit · 96k", desc: "Hi-res · mastering" },
  { id: "32-96", label: "32-bit float · 96 kHz", short: "32f · 96k", desc: "Archival · max" },
] as const;



function GeneratePage() {
  const [script, setScript] = useState(
    "Welcome to Vox Studio — a private, on-device voice lab.\n\nEverything you type here is synthesized locally on your Mac. No cloud uploads, no accounts, no telemetry. Just paste a script, pick a voice, and hit Generate.\n\nTry it: change the voice on the right, drag the Expressiveness slider, and listen to how the same words come alive.",
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tone, setTone] = useState("Default");
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [mp3Quality, setMp3Quality] = useState<string>("128");
  const [wavQuality, setWavQuality] = useState<string>("16-44");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState(ADVANCED_DEFAULTS);
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [favorites, setFavorites] = useState<string[]>(["noelmo-normal"]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const max = 3000;
  const isDirty = ADVANCED_FIELDS.some((f) => advanced[f.key] !== ADVANCED_DEFAULTS[f.key]);
  const selectedVoice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0];
  const toggleFavorite = (id: string) =>
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* LEFT: Script + Output */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* Script card */}
        <section className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-foreground">Script</h2>
            <div className="flex items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".txt,.md,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setScript(text.slice(0, max));
                  e.currentTarget.value = "";
                }}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-all hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
                  boxShadow:
                    "0 6px 14px -6px oklch(0.55 0.22 260 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.25)",
                }}
              >
                <Upload className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
                Import
              </button>
              <button
                onClick={() => setScript("")}
                disabled={!script.length}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground/70 transition-all hover:border-[oklch(0.62_0.2_25/0.4)] hover:bg-[oklch(0.98_0.02_25)] hover:text-[oklch(0.55_0.22_25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-white disabled:hover:text-foreground/70"
              >
                <Trash2 className="h-3.5 w-3.5 transition-transform group-hover:rotate-6 group-disabled:group-hover:rotate-0" />
                Clear
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground/60 transition-colors hover:bg-muted"
                aria-label="Recent scripts"
              >
                <Clock className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value.slice(0, max))}
              placeholder="Type or paste your script..."
              className="h-[360px] w-full resize-none rounded-xl border border-border bg-[oklch(0.99_0.003_260)] px-5 py-4 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/35 focus:border-[oklch(0.55_0.22_260)] focus:outline-none focus:ring-4 focus:ring-[oklch(0.55_0.22_260)/0.08]"
            />
            <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
              <span>
                {script.length.toLocaleString()} / {max.toLocaleString()} characters
              </span>
              <span className="inline-flex items-center gap-1">
                Est. {Math.max(0, Math.round(script.length / 14))} sec
                <InfoTip text="Rough estimate of audio length based on ~14 characters per second of speech. Actual duration varies with tone, pace, and pauses in the final render." />
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-nowrap items-center gap-2">
            <button
              disabled
              title="Coming soon"
              className="inline-flex min-w-0 shrink cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2 text-[13px] font-medium text-muted-foreground sm:gap-2 sm:px-3"
            >
              <Pause className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Insert Pause</span>
              <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 md:inline">
                Soon
              </span>
            </button>
            <button
              disabled
              title="Coming soon"
              className="inline-flex min-w-0 shrink cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2 text-[13px] font-medium text-muted-foreground sm:gap-2 sm:px-3"
            >
              <span className="truncate">
                <span className="sm:hidden">Pronunciation</span>
                <span className="hidden sm:inline">Add Pronunciation</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 md:inline">
                Soon
              </span>
            </button>
            <button
              disabled
              title="Keyboard shortcuts — coming soon"
              aria-label="Keyboard shortcuts (coming soon)"
              className="ml-auto flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>

          <button
            className="group mt-5 flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 text-[15px] font-bold text-white transition-all hover:brightness-110"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
              boxShadow:
                "0 18px 36px -14px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
            }}
          >
            <AudioLines className="h-5 w-5" />
            Generate Voice
            <Sparkles className="h-4 w-4 opacity-80" />
          </button>
        </section>

        {/* Output card */}
        <section className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-foreground">Output</h2>
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-muted">
                Newest First
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-muted">
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          </div>

          <div className="mt-4">
            <OutputRow />
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[12px] text-foreground/65">
            <span>Storage: 2.1 GB used</span>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[42%] rounded-full bg-[oklch(0.62_0.13_175)]" />
              </div>
            </div>
            <a className="inline-flex items-center gap-1 font-semibold text-[oklch(0.55_0.22_260)] hover:underline" href="#">
              View All History <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>
      </div>

      {/* RIGHT: Voice Studio + side cards */}
      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-[18px] font-bold text-foreground">Voice Studio</h2>

          <div className="mt-5">
            <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
              Voice Profile <InfoTip text="Choose the voice persona used for generation. Each profile has a unique timbre, accent, and delivery style — e.g. 'Aurora' for warm narration, 'Vox' for crisp announcements." />
            </label>
            <div className="relative mt-2">
              <button
                data-voice-picker-trigger
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-left transition-all hover:border-[oklch(0.55_0.22_260/0.4)] hover:bg-[oklch(0.99_0.01_260)]"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: ACCENT_BG[selectedVoice.accent] }}
                >
                  <Disc3 className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-bold text-foreground">{selectedVoice.name}</span>
                    {favorites.includes(selectedVoice.id) && (
                      <Star className="h-3 w-3 shrink-0 fill-[oklch(0.78_0.16_75)] text-[oklch(0.78_0.16_75)]" />
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {selectedVoice.tags.map((t) => (
                      <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
                <ChevronDown
                  className={
                    "h-4 w-4 shrink-0 text-foreground/50 transition-transform " +
                    (pickerOpen ? "rotate-180" : "")
                  }
                />
              </button>

              {pickerOpen && (
                <VoicePicker
                  voices={VOICES}
                  selectedId={voiceId}
                  favorites={favorites}
                  onSelect={(id) => {
                    setVoiceId(id);
                    setPickerOpen(false);
                  }}
                  onToggleFavorite={toggleFavorite}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            <VoicePreviewPlayer voiceId={voiceId} />
          </div>

          <div className="mt-5">
            <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
              Tone / Style <InfoTip text="Sets the emotional delivery and pacing. 'Neutral' reads flat and even; 'Cheerful' adds lift and energy; 'Serious' slows the pace for weight and authority." />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TONES.map((t) => {
                const active = t === tone;
                return (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={
                      active
                        ? "rounded-md bg-[oklch(0.55_0.22_260)] px-2.5 py-1.5 text-[12px] font-bold text-white"
                        : "rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-foreground/75 transition-colors hover:bg-muted"
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
              Output Format <InfoTip text="Choose the audio file type. MP3 is compressed and small — great for sharing and web playback. WAV is uncompressed 16-bit PCM — best for editing or archival quality." />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <FormatTile active={format === "mp3"} onClick={() => setFormat("mp3")} title="MP3" subtitle={`${mp3Quality} kbps`} />
              <FormatTile active={format === "wav"} onClick={() => setFormat("wav")} title="WAV" subtitle={WAV_PRESETS.find((p) => p.id === wavQuality)?.short ?? "16-bit"} />
            </div>
          </div>



          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-muted"
          >
            <span className="inline-flex items-center gap-2">
              Advanced Settings
              {isDirty && (
                <span className="rounded-full bg-[oklch(0.55_0.22_260)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  Modified
                </span>
              )}
            </span>
            <ChevronDown
              className={
                "h-4 w-4 text-foreground/50 transition-transform " +
                (advancedOpen ? "rotate-180" : "")
              }
            />
          </button>

          {advancedOpen && (
            <div
              className="mt-3 rounded-xl border border-border bg-[oklch(0.99_0.003_260)] p-4"
              style={{
                boxShadow:
                  "inset 0 1px 0 oklch(1 0 0 / 0.6), 0 1px 2px oklch(0.16 0.02 260 / 0.04)",
              }}
            >
              <div className="mb-4 border-b border-border pb-4">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
                    {format === "mp3" ? "MP3 Bitrate" : "WAV Quality"}
                    <InfoTip text={format === "mp3"
                      ? "Higher bitrate = better fidelity and larger file. 128 kbps is fine for spoken word; 192–256 kbps for music-like content."
                      : "Higher bit depth and sample rate preserve more detail at the cost of file size. 16-bit / 48 kHz is a safe default."} />
                  </label>
                  <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    {format}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {(format === "mp3" ? MP3_PRESETS : WAV_PRESETS).map((p) => {
                    const active = format === "mp3" ? mp3Quality === p.id : wavQuality === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          format === "mp3" ? setMp3Quality(p.id) : setWavQuality(p.id)
                        }
                        className={
                          "flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-all " +
                          (active
                            ? "border-[oklch(0.55_0.22_260)] bg-[oklch(0.96_0.04_260)] text-[oklch(0.45_0.22_260)] shadow-[inset_0_0_0_1px_oklch(0.55_0.22_260/0.25)]"
                            : "border-border bg-white text-foreground/75 hover:bg-muted")
                        }
                      >
                        <span className="text-[12px] font-bold tabular-nums">{p.label}</span>
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          {p.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {ADVANCED_FIELDS.map((f) => (
                  <AdvancedSlider
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={advanced[f.key]}
                    onChange={(v) => setAdvanced((s) => ({ ...s, [f.key]: v }))}
                  />
                ))}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                <button
                  onClick={() => setAdvanced(ADVANCED_DEFAULTS)}
                  disabled={!isDirty}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/75 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset to Default
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110"
                  style={{
                    boxShadow:
                      "0 10px 20px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Save Preset
                </button>
              </div>
            </div>
          )}
        </section>

      </aside>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex">
      <Info className="h-3 w-3 cursor-help opacity-60 transition-opacity group-hover/tip:opacity-100" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-60 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-[11px] font-medium leading-snug text-foreground/80 opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100"
        style={{ boxShadow: "0 6px 24px oklch(0.16 0.02 260 / 0.12)" }}
      >
        {text}
      </span>
    </span>
  );
}

function VoicePicker({
  voices,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
  onClose,
}: {
  voices: Voice[];
  selectedId: string;
  favorites: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof VOICE_FILTERS)[number]>("All");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        if ((e.target as HTMLElement).closest?.("[data-voice-picker-trigger]")) return;
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      clearTimeout(t);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = voices.filter((v) => {
      if (filter !== "All" && v.category !== filter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q)) ||
        v.category.toLowerCase().includes(q)
      );
    });
    return matches.sort((a, b) => {
      const af = favorites.includes(a.id) ? 0 : 1;
      const bf = favorites.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  }, [voices, filter, query, favorites]);

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-border bg-white"
      style={{
        boxShadow:
          "0 24px 48px -16px oklch(0.16 0.02 260 / 0.18), 0 4px 12px -4px oklch(0.16 0.02 260 / 0.08)",
      }}
    >
      <div className="border-b border-border p-3">
        <div className="flex items-center rounded-lg border border-border bg-[oklch(0.99_0.003_260)] px-3 py-2 focus-within:border-[oklch(0.55_0.22_260)] focus-within:ring-4 focus-within:ring-[oklch(0.55_0.22_260/0.08)]">
          <Search className="h-3.5 w-3.5 text-foreground/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices by name or tag..."
            className="ml-2 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-foreground/40 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {VOICE_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  active
                    ? "rounded-md bg-[oklch(0.55_0.22_260)] px-2 py-1 text-[11px] font-bold text-white"
                    : "rounded-md border border-border bg-white px-2 py-1 text-[11px] font-semibold text-foreground/70 transition-colors hover:bg-muted"
                }
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[340px] overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-foreground/50">
            No voices match "{query}"
          </div>
        ) : (
          filtered.map((v) => {
            const isSelected = v.id === selectedId;
            const isFav = favorites.includes(v.id);
            return (
              <div
                key={v.id}
                className={
                  "group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors " +
                  (isSelected ? "bg-[oklch(0.97_0.025_260)]" : "hover:bg-muted")
                }
              >
                <button
                  onClick={() => onSelect(v.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: ACCENT_BG[v.accent] }}
                  >
                    <Disc3 className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          "truncate text-[13px] " +
                          (isSelected
                            ? "font-bold text-[oklch(0.55_0.22_260)]"
                            : "font-semibold text-foreground")
                        }
                      >
                        {v.name}
                      </span>
                      <span className="rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wide text-foreground/55">
                        {v.category}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      {v.tags.map((t) => (
                        <span key={t} className="text-[10.5px] text-foreground/55">
                          {t}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(v.id);
                  }}
                  aria-label={isFav ? "Unfavorite" : "Favorite"}
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors " +
                    (isFav
                      ? "text-[oklch(0.78_0.16_75)]"
                      : "text-foreground/30 opacity-0 hover:text-foreground/70 group-hover:opacity-100")
                  }
                >
                  <Star className={"h-4 w-4 " + (isFav ? "fill-current" : "")} />
                </button>
                {isSelected && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[oklch(0.55_0.22_260)] text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <a
        href="/app/voices"
        className="flex items-center justify-between border-t border-border bg-[oklch(0.99_0.003_260)] px-4 py-3 text-[12px] font-semibold text-[oklch(0.55_0.22_260)] transition-colors hover:bg-[oklch(0.97_0.025_260)]"
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Record or import a new voice
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function FormatTile({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  const isMp3 = title === "MP3";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={
        "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-all " +
        (active
          ? "text-white"
          : "border border-border bg-white text-foreground hover:-translate-y-0.5 hover:border-[oklch(0.55_0.22_260/0.35)] hover:shadow-[0_8px_18px_-12px_oklch(0.55_0.22_260/0.35)]")
      }
      style={
        active
          ? {
              background:
                "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
              boxShadow:
                "0 10px 22px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
            }
          : undefined
      }
    >
      <span
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors " +
          (active
            ? "bg-white/15 text-white ring-1 ring-inset ring-white/25"
            : "bg-[oklch(0.96_0.02_260)] text-[oklch(0.55_0.22_260)] group-hover:bg-[oklch(0.94_0.04_260)]")
        }
      >
        {isMp3 ? <AudioLines className="h-4 w-4" /> : <Disc3 className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            "flex items-center gap-1.5 text-[13px] font-bold " +
            (active ? "text-white" : "text-foreground")
          }
        >
          {title}
          {active && (
            <Check
              className="h-3.5 w-3.5 text-white/90"
              strokeWidth={3}
            />
          )}
        </span>
        <span
          className={
            "mt-0.5 block text-[11px] tabular-nums " +
            (active ? "text-white/80" : "text-muted-foreground")
          }
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function AdvancedSlider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const decimals = step < 0.1 ? 2 : step < 1 ? 2 : 0;
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)_56px] items-center gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-foreground">{label}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-foreground/55">{hint}</div>
      </div>
      <div className="relative flex h-6 items-center">
        <div className="relative h-1 w-full rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-[oklch(0.55_0.22_260)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[oklch(0.55_0.22_260)] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[oklch(0.55_0.22_260)] [&::-moz-range-thumb]:bg-white"
        />
      </div>
      <div className="rounded-md border border-border bg-white px-2 py-1 text-center text-[12px] font-semibold tabular-nums text-foreground">
        {value.toFixed(decimals)}
      </div>
    </div>
  );
}


const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

function OutputRow() {
  const [speed, setSpeed] = useState<number>(1);
  return (
    <div className="rounded-xl border border-border bg-[oklch(0.99_0.003_260)] p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)] transition-transform hover:scale-105"
          aria-label="Play"
        >
          <Play className="h-4 w-4" fill="currentColor" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-foreground">A Tale of Two Cities – Opening</div>
          <div className="mt-0.5 truncate text-[11.5px] text-foreground/55">
            Noelmo Normal · Default · MP3 · Today, 2:34 PM
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-foreground/65 sm:hidden">
            <span className="rounded-md bg-muted px-2 py-0.5 font-semibold">22.4 sec</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-semibold">RTF 0.82x</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11.5px] text-foreground/65">
          <span className="hidden rounded-md bg-muted px-2 py-1 font-semibold sm:inline">22.4 sec</span>
          <span className="hidden rounded-md bg-muted px-2 py-1 font-semibold sm:inline">RTF 0.82x</span>
          <button className="rounded p-1 hover:bg-muted" aria-label="More">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <BigWaveform />
        <div className="flex shrink-0 flex-col items-end gap-1 text-[12px] text-foreground/65">
          <button className="inline-flex items-center gap-1.5 hover:text-foreground">
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button className="inline-flex items-center gap-1.5 hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
          <button className="inline-flex items-center gap-1.5 hover:text-foreground">
            <MoreVertical className="h-3.5 w-3.5" />
            More
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5 text-foreground/55" />
          <div className="relative h-1 w-24 rounded-full bg-muted">
            <div className="absolute left-0 top-0 h-full w-[70%] rounded-full bg-[oklch(0.55_0.22_260)]" />
            <div className="absolute left-[70%] top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[oklch(0.55_0.22_260)] shadow" />
          </div>
        </div>
        <SpeedControl value={speed} onChange={setSpeed} />
        <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground/55">
          0:08 <span className="text-foreground/35">/ 0:22</span>
        </span>
      </div>
    </div>
  );
}

function BigWaveform() {
  const bars = Array.from({ length: 48 }, (_, i) =>
    Math.abs(Math.sin(i * 0.35) * 0.6 + Math.cos(i * 0.13) * 0.4) * 0.9 + 0.08,
  );
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center gap-[2px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="h-full min-w-[2px] flex-1 rounded-full bg-[oklch(0.55_0.22_260)]"
          style={{
            transform: `scaleY(${h})`,
            opacity: i < Math.floor(bars.length * 0.18) ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

function VoicePreviewPlayer({ voiceId }: { voiceId: string }) {
  const DURATION = 8;
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [volOpen, setVolOpen] = useState(false);
  const volWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
  }, [voiceId]);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - progress * 1000;
    let raf = 0;
    const tick = (t: number) => {
      const next = (t - start) / 1000;
      if (next >= DURATION) {
        setProgress(0);
        setPlaying(false);
        return;
      }
      setProgress(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const pct = (progress / DURATION) * 100;
  const muted = volume === 0;

  return (
    <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-border bg-[oklch(0.99_0.003_260)] px-2.5 py-2">
      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
        style={{ background: "oklch(0.55 0.22 260)" }}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>

      <span className="w-8 text-center text-[10px] font-mono tabular-nums text-foreground/60">
        {fmt(progress)}
      </span>

      <input
        type="range"
        min={0}
        max={DURATION}
        step={0.01}
        value={progress}
        onChange={(e) => setProgress(Number(e.target.value))}
        aria-label="Seek"
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[oklch(0.55_0.22_260)]"
        style={{
          background: `linear-gradient(to right, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${pct}%, oklch(0.92 0.01 260) ${pct}%, oklch(0.92 0.01 260) 100%)`,
        }}
      />

      <span className="w-8 text-center text-[10px] font-mono tabular-nums text-foreground/60">
        {fmt(DURATION)}
      </span>

      <div ref={volWrapRef} className="relative">
        <button
          onClick={() => setVolOpen((v) => !v)}
          aria-label={muted ? "Unmute" : "Volume"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-muted hover:text-foreground"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        {volOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setVolOpen(false)} />
            <div
              className="absolute bottom-full right-0 z-50 mb-2 flex h-28 w-8 flex-col items-center justify-center rounded-lg border border-border bg-white py-3 shadow-lg"
              style={{ boxShadow: "0 6px 24px oklch(0.16 0.02 260 / 0.12)" }}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="h-1 w-20 cursor-pointer appearance-none rounded-full accent-[oklch(0.55_0.22_260)]"
                style={{
                  writingMode: "vertical-lr" as never,
                  WebkitAppearance: "slider-vertical" as never,
                  direction: "rtl",
                  background: `linear-gradient(to top, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${volume * 100}%, oklch(0.92 0.01 260) ${volume * 100}%, oklch(0.92 0.01 260) 100%)`,
                  width: "6px",
                  height: "80px",
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SpeedControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label = `${value}x`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Playback speed ${label}`}
        className={
          "inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md border px-1.5 text-[11px] font-bold tabular-nums transition-colors " +
          (value === 1
            ? "border-border bg-white text-foreground/70 hover:bg-muted"
            : "border-[oklch(0.85_0.08_260)] bg-[oklch(0.96_0.04_260)] text-[oklch(0.45_0.22_260)] hover:bg-[oklch(0.93_0.05_260)]")
        }
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 flex w-16 flex-col overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
          style={{ boxShadow: "0 6px 24px oklch(0.16 0.02 260 / 0.12)" }}
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={
                "px-2 py-1 text-center text-[11.5px] font-semibold tabular-nums transition-colors " +
                (s === value
                  ? "bg-[oklch(0.96_0.04_260)] text-[oklch(0.45_0.22_260)]"
                  : "text-foreground/75 hover:bg-muted")
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
