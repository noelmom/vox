import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Cpu,
  Sparkles,
  HardDrive,
  Shield,
  ChevronDown,
  Folder,
  RefreshCw,
  Check,
  Info,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Settings — Vox Studio" }] }),
  component: SettingsPage,
});


function SettingsPage() {
  const [device, setDevice] = useState<"mps" | "cpu">("mps");
  const [model, setModel] = useState("Chatterbox Turbo");
  const [precision, setPrecision] = useState("Float16 (Default)");
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [sampleRate, setSampleRate] = useState("48 kHz");
  const [temperature, setTemperature] = useState(0.75);
  const [cfg, setCfg] = useState(2.5);
  const [exaggeration, setExaggeration] = useState(0.3);
  const [seed, setSeed] = useState("0");
  const [inputFolder, setInputFolder] = useState("/Users/yourname/Vox/Input");
  const [outFolder, setOutFolder] = useState("/Users/yourname/Vox/Output");
  const [voiceFolder, setVoiceFolder] = useState("/Users/yourname/Vox/Voices");
  const [cacheSize, setCacheSize] = useState("2 GB");
  const [outputTTL, setOutputTTL] = useState("24 hours");
  const [offline, setOffline] = useState(true);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const onSave = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-black tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Everything runs locally. Changes are saved to this device only.
        </p>
      </div>

      <div className="flex flex-col gap-5">
          {/* MODEL */}
          <Section id="model" title="Model" Icon={Cpu} subtitle="Pick how and where Vox runs inference.">
            <Row label="Compute Device" hint="Choose where inference runs.">
              <SegmentToggle
                value={device}
                onChange={(v) => setDevice(v as "mps" | "cpu")}
                options={[
                  { value: "mps", label: "Apple MPS" },
                  { value: "cpu", label: "CPU" },
                ]}
              />
            </Row>
            <Row label="Model" hint="Select the TTS model.">
              <Select value={model} onChange={setModel} options={["Chatterbox Turbo", "Chatterbox Studio", "Chatterbox Lite"]} badge="Recommended" />
            </Row>
            <Row label="Precision" hint="Lower precision uses less memory.">
              <Select value={precision} onChange={setPrecision} options={["Float16 (Default)", "Float32", "Int8"]} />
            </Row>
          </Section>

          {/* GENERATION */}
          <Section id="generation" title="Generation Defaults" Icon={Sparkles} subtitle="The starting point for every new generation.">
            <Row label="Output Format" hint="Choose audio output format.">
              <SegmentToggle
                value={format}
                onChange={(v) => setFormat(v as "mp3" | "wav")}
                options={[
                  { value: "mp3", label: "MP3" },
                  { value: "wav", label: "WAV" },
                ]}
              />
            </Row>
            <Row label="Sample Rate" hint="Audio sample rate.">
              <Select value={sampleRate} onChange={setSampleRate} options={["22.05 kHz", "44.1 kHz", "48 kHz", "96 kHz"]} />
            </Row>
            <Row label="Temperature" hint="Controls randomness.">
              <SliderRow value={temperature} onChange={setTemperature} min={0} max={2} step={0.01} decimals={2} />
            </Row>
            <Row label="CFG Weight" hint="Guidance strength.">
              <SliderRow value={cfg} onChange={setCfg} min={0} max={5} step={0.1} decimals={1} />
            </Row>
            <Row label="Exaggeration" hint="Expressiveness boost.">
              <SliderRow value={exaggeration} onChange={setExaggeration} min={0} max={1} step={0.01} decimals={2} />
            </Row>
            <Row label="Seed" hint="Set to 0 for random.">
              <div className="flex items-center gap-2">
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="0 for random"
                  className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] tabular-nums outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]"
                />
                <button
                  onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000) + 1))}
                  aria-label="Randomize seed"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-foreground/65 hover:bg-muted hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </Row>
          </Section>

          {/* STORAGE */}
          <Section id="storage" title="Storage" Icon={HardDrive} subtitle="Where Vox keeps your audio and voices.">
            <Row label="Input Folder" hint="Drop audio files here to be picked up and processed by Vox.">
              <PathInput value={inputFolder} onChange={setInputFolder} />
            </Row>
            <Row label="Output Folder" hint="Where generated audio is saved.">
              <PathInput value={outFolder} onChange={setOutFolder} />
            </Row>
            <Row label="Voice Folder" hint="Where voice profiles are stored.">
              <PathInput value={voiceFolder} onChange={setVoiceFolder} />
            </Row>
            <Row label="Output TTL" hint="How long generated audio is retained before auto-deletion.">
              <Select
                value={outputTTL}
                onChange={setOutputTTL}
                options={["1 hour", "6 hours", "24 hours", "7 days", "30 days", "Keep forever"]}
              />
            </Row>
            <Row label="Max Cache Size" hint="Cache for faster generations.">
              <Select value={cacheSize} onChange={setCacheSize} options={["512 MB", "1 GB", "2 GB", "5 GB", "10 GB"]} />
            </Row>
            {(() => {
              const usedGB = 1.4;
              const totalGB = 2;
              const pct = Math.min(100, (usedGB / totalGB) * 100);
              const tone =
                pct >= 80
                  ? { from: "oklch(0.7 0.2 25)", to: "oklch(0.55 0.22 25)", text: "oklch(0.55 0.22 25)" }
                  : pct >= 50
                    ? { from: "oklch(0.78 0.17 65)", to: "oklch(0.65 0.18 55)", text: "oklch(0.55 0.18 55)" }
                    : { from: "oklch(0.6 0.2 260)", to: "oklch(0.5 0.22 270)", text: "oklch(0.55 0.22 260)" };
              return (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12.5px] text-muted-foreground">
                      Currently using{" "}
                      <span className="font-semibold tabular-nums" style={{ color: tone.text }}>
                        {usedGB} GB
                      </span>
                      <span className="text-foreground/50"> / {totalGB} GB</span>
                    </div>
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="text-[12px] font-semibold text-[oklch(0.55_0.22_25)] hover:underline"
                    >
                      Clear cache
                    </button>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundImage: `linear-gradient(to right, ${tone.from}, ${tone.to})`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </Section>

          {/* PRIVACY */}
          <Section id="privacy" title="Privacy" Icon={Shield} subtitle="You control what — if anything — leaves this device.">
            <Row label="Offline Mode" hint="Disable all network access.">
              <Toggle checked={offline} onChange={setOffline} />
            </Row>
            <Row label="Crash Reports" hint="Send anonymous crash reports." comingSoon>
              <Toggle checked={false} onChange={() => {}} disabled />
            </Row>
          </Section>

          {/* Bottom action bar */}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-[0_8px_24px_-12px_oklch(0.16_0.02_260/0.18)] backdrop-blur">
            <span className="mr-auto text-[12px] text-muted-foreground">
              Changes apply on save and are stored locally on this device.
            </span>
            <button className="rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium text-foreground/80 hover:bg-muted">
              Reset to defaults
            </button>
            <button
              onClick={onSave}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-all hover:brightness-110"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
                boxShadow:
                  "0 10px 24px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
              }}
            >
              {saved ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Saved
                </>
              ) : (
                <>Save changes</>
              )}
            </button>
          </div>

      </div>


      {confirmClear && (
        <ConfirmDialog
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[oklch(0.96_0.05_25)] text-[oklch(0.55_0.22_25)]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground">Clear cached audio?</h3>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              This permanently deletes all cached generations on this device. The action is
              irreversible — clips will need to be regenerated to play again.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-[oklch(0.985_0.005_260)] px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-foreground/80 hover:bg-muted"
          >
            No, keep cache
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-gradient-to-br from-[oklch(0.7_0.2_25)] to-[oklch(0.55_0.22_25)] px-3.5 py-2 text-[12.5px] font-bold text-white shadow-sm hover:brightness-110"
          >
            Yes, clear cache
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  Icon,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  Icon: typeof Cpu;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="overflow-hidden rounded-2xl border border-border bg-white">
      <header className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-white to-[oklch(0.985_0.005_260)] px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  comingSoon,
  children,
}: {
  label: string;
  hint?: string;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] " +
        (comingSoon ? "opacity-70" : "")
      }
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[13.5px] font-semibold text-foreground">{label}</div>
          {comingSoon && (
            <span className="rounded-md bg-[oklch(0.95_0.04_260)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[oklch(0.55_0.22_260)]">
              Coming soon
            </span>
          )}
        </div>
        {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      <div className={"min-w-0 " + (comingSoon ? "pointer-events-none" : "")}>{children}</div>
    </div>
  );
}


function SegmentToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-[oklch(0.98_0.003_260)] p-1 shadow-sm">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              "min-w-[88px] rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-all " +
              (active
                ? "bg-gradient-to-br from-[oklch(0.6_0.2_260)] to-[oklch(0.5_0.22_270)] text-white shadow-[0_2px_6px_oklch(0.55_0.22_260/0.35)]"
                : "text-foreground/65 hover:text-foreground")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  badge,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  badge?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-border bg-white px-3 py-2 pr-9 text-[13.5px] font-medium text-foreground outline-none focus:border-[oklch(0.55_0.22_260)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1.5">
        {badge && (
          <span className="rounded-md bg-[oklch(0.94_0.08_145)] px-1.5 py-0.5 text-[10px] font-bold text-[oklch(0.4_0.16_145)]">
            {badge}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-foreground/50" />
      </div>
    </div>
  );
}

function SliderRow({
  value,
  onChange,
  min,
  max,
  step,
  decimals,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  decimals: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[oklch(0.6_0.2_260)] to-[oklch(0.5_0.22_270)]"
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
          className="absolute inset-0 h-6 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[oklch(0.55_0.22_260)] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
          style={{ top: "50%" }}
        />
      </div>
      <div className="min-w-[56px] rounded-md border border-border bg-white px-2 py-1 text-center text-[12.5px] font-bold tabular-nums text-foreground">
        {value.toFixed(decimals)}
      </div>
    </div>
  );
}

function PathInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 truncate rounded-lg border border-border bg-white px-3 py-2 font-mono text-[12.5px] text-foreground/85 outline-none focus:border-[oklch(0.55_0.22_260)]"
      />
      <InfoTip>
        <div className="text-[12px] leading-snug text-foreground/80">
          <span className="font-semibold text-foreground">How to open this folder:</span>{" "}
          click the <Folder className="inline h-3 w-3 align-text-bottom" /> button to copy the path.
          In Finder press <Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>G</Kbd> (or{" "}
          <em>Go → Go to Folder…</em>), paste, and press Return.
        </div>
      </InfoTip>
      <button
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy path"}
        title={copied ? "Copied!" : "Copy path to clipboard"}
        className={
          "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors " +
          (copied
            ? "border-[oklch(0.85_0.1_145)] bg-[oklch(0.96_0.07_145)] text-[oklch(0.4_0.16_145)]"
            : "border-border bg-white text-foreground/65 hover:bg-muted hover:text-foreground")
        }
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function InfoTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="More info"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-foreground/55 hover:bg-muted hover:text-[oklch(0.55_0.22_260)]"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-[calc(100%+6px)] z-20 w-[280px] rounded-xl border border-border bg-white p-3 shadow-[0_12px_30px_-12px_oklch(0.16_0.02_260/0.25)]"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-white px-1 font-mono text-[10.5px] font-semibold text-foreground/80 shadow-[0_1px_0_oklch(0.16_0.02_260/0.08)]">
      {children}
    </kbd>
  );
}


function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end">
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={
          "relative h-6 w-11 rounded-full transition-colors " +
          (disabled
            ? "cursor-not-allowed bg-muted opacity-60"
            : checked
              ? "bg-gradient-to-br from-[oklch(0.6_0.2_260)] to-[oklch(0.5_0.22_270)] shadow-[inset_0_0_0_1px_oklch(0.5_0.22_270/0.3)]"
              : "bg-muted")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " +
            (checked ? "left-[22px]" : "left-0.5")
          }
        />
      </button>
    </div>
  );
}
