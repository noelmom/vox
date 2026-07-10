import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  Sparkles,
  HardDrive,
  Shield,
  ChevronDown,
  Folder,
  Check,
  AlertTriangle,
  Zap,
  Server,
  CheckCircle2,
  XCircle,
  RotateCcw,
  X,
  Info,
  LayoutGrid,
  Download,
  Upload,
  Monitor,
  Sun,
  FileText,
} from "lucide-react";
import {
  type ServerSettings,
  createApiToken,
  exportBackup,
  getServerSettings,
  getLogFile,
  listPresets,
  listRemoteCredentials,
  listVoices,
  patchServerSettings,
  restoreBackup,
  revokeAllRemoteCredentials,
  revokeRemoteCredential,
} from "@/lib/api";
import { hydrateCachedPreferences, readCachedPreference, savePreferences, writeCachedPreference } from "@/lib/preferences";
import { BRAND, BRAND_GRADIENT, BRAND_SECONDARY, BRAND_WARM } from "@/lib/theme";

// ─── helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lsGet<T>(key: string, fallback: T): T {
  return readCachedPreference(key, fallback);
}

function loadPrefs() {
  return {
    format: lsGet<"mp3" | "wav">("vox:format", "mp3"),
    mp3Quality: lsGet("vox:mp3Quality", "128"),
    wavQuality: lsGet("vox:wavQuality", "16"),
    advanced: lsGet("vox:advanced", ADVANCED_DEFAULTS),
    voiceId: lsGet("vox:voiceId", ""),
    tone: lsGet("vox:tone", "Default"),
    theme: "light" as const,
    widgetRequests: lsGet("vox:widget.requests", true),
    widgetMinutes: lsGet("vox:widget.minutes", true),
  };
}

function savePrefs(p: ReturnType<typeof loadPrefs>) {
  writeCachedPreference("vox:format", p.format);
  writeCachedPreference("vox:mp3Quality", p.mp3Quality);
  writeCachedPreference("vox:wavQuality", p.wavQuality);
  writeCachedPreference("vox:advanced", p.advanced);
  writeCachedPreference("vox:voiceId", p.voiceId);
  writeCachedPreference("vox:tone", p.tone);
  writeCachedPreference("vox:theme", "light");
  writeCachedPreference("vox:widget.requests", p.widgetRequests);
  writeCachedPreference("vox:widget.minutes", p.widgetMinutes);
  window.dispatchEvent(new CustomEvent("vox:prefschanged"));
}

// ─── defaults (must match Generate page) ────────────────────────────────────

const ADVANCED_DEFAULTS = {
  exaggeration: 0.5,
  cfg: 0.5,
  temperature: 0.8,
  repetition: 1.2,
  topP: 1,
  minP: 0.05,
};

const MP3_OPTIONS = ["96", "128", "192", "256", "320"] as const;
const WAV_OPTIONS = ["16", "24", "32f"] as const;

const TTL_LABELS: Record<number, string> = {
  1: "1 hour",
  6: "6 hours",
  12: "12 hours",
  24: "24 hours",
  168: "7 days",
  720: "30 days",
  0: "Keep forever",
};

const SERVER_LIMITS = {
  outputTtlHours: { min: 0, max: 8760 },
  maxVoiceClipDurationS: { min: 5, max: 600 },
  defaultMaxChars: { min: 100, max: 3000 },
  chunkHeadroomChars: { min: 0, max: 1000 },
};

// ─── page ────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: server, isLoading: serverLoading } = useQuery<ServerSettings>({
    queryKey: ["settings"],
    queryFn: getServerSettings,
  });

  const networkMutation = useMutation({
    mutationFn: (host: "127.0.0.1" | "0.0.0.0") => patchServerSettings({ host }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const serverSettingsMutation = useMutation({
    mutationFn: patchServerSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const { data: voices = [] } = useQuery({ queryKey: ["voices"], queryFn: listVoices });
  const { data: presetsData } = useQuery({ queryKey: ["presets"], queryFn: listPresets });

  const voiceOptions = [
    { value: "", label: "Generic (no voice cloning)" },
    ...voices.map((v) => ({ value: v.name, label: v.name })),
  ];

  const toneOptions = presetsData
    ? [...Object.keys(presetsData).map((k) => ({ value: capitalize(k), label: capitalize(k) })), { value: "Custom", label: "Custom" }]
    : [{ value: "Default", label: "Default" }, { value: "Custom", label: "Custom" }];

  // Draft state — not persisted until Save is clicked
  const [prefs, setPrefs] = useState(loadPrefs);

  // Snapshot of what's actually in localStorage (to compute dirty)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(loadPrefs()));

  // Once dismissed, stays gone for the rest of this page visit.
  const [dismissed, setDismissed] = useState(false);

  const [saveFeedback, setSaveFeedback] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [pendingCredentialRevoke, setPendingCredentialRevoke] = useState<{
    id: string;
    name: string;
    kind: "session" | "token";
  } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<File | null>(null);
  const [backupFeedback, setBackupFeedback] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenScope, setTokenScope] = useState<"read" | "generate" | "admin">("read");
  const [issuedToken, setIssuedToken] = useState("");
  const [serverDrafts, setServerDrafts] = useState({
    outputTtlHours: "",
    maxVoiceClipDurationS: "",
    defaultMaxChars: "",
    chunkHeadroomChars: "",
  });
  const [serverDraftErrors, setServerDraftErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    hydrateCachedPreferences()
      .then(() => {
        if (cancelled) return;
        const next = loadPrefs();
        setPrefs(next);
        setSavedSnapshot(JSON.stringify(next));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const exportMutation = useMutation({
    mutationFn: exportBackup,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      link.href = url;
      link.download = `Vox-Backup-${stamp}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupFeedback("Backup downloaded.");
      setTimeout(() => setBackupFeedback(""), 1800);
    },
    onError: (err) => {
      setBackupFeedback(err instanceof Error ? err.message : "Backup export failed.");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: (result) => {
      setBackupFeedback(result.message);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["voices"] });
      queryClient.invalidateQueries({ queryKey: ["presets"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err) => {
      setBackupFeedback(err instanceof Error ? err.message : "Backup restore failed.");
    },
  });

  const { data: remoteCredentials = [], isError: remoteCredentialsError } = useQuery({
    queryKey: ["remote-credentials"],
    queryFn: listRemoteCredentials,
  });

  const createTokenMutation = useMutation({
    mutationFn: () => createApiToken({ name: tokenName.trim(), scopes: [tokenScope] }),
    onSuccess: (result) => {
      setIssuedToken(result.token);
      setTokenName("");
      queryClient.invalidateQueries({ queryKey: ["remote-credentials"] });
    },
  });

  const revokeCredentialMutation = useMutation({
    mutationFn: revokeRemoteCredential,
    onSuccess: () => {
      setPendingCredentialRevoke(null);
      queryClient.invalidateQueries({ queryKey: ["remote-credentials"] });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: revokeAllRemoteCredentials,
    onSuccess: () => {
      setConfirmRevokeAll(false);
      queryClient.invalidateQueries({ queryKey: ["remote-credentials"] });
    },
  });

  const currentSnapshot = JSON.stringify(prefs);
  const isDirty = currentSnapshot !== savedSnapshot;
  const isFloating = isDirty && !dismissed;

  const set = <K extends keyof typeof prefs>(key: K, val: (typeof prefs)[K]) => {
    setPrefs((p) => ({ ...p, [key]: val }));
  };

  const setAdvField = (key: keyof typeof ADVANCED_DEFAULTS, val: number) =>
    set("advanced", { ...prefs.advanced, [key]: val });

  const handleSave = async () => {
    savePrefs(prefs);
    await savePreferences({
      "vox:format": prefs.format,
      "vox:mp3Quality": prefs.mp3Quality,
      "vox:wavQuality": prefs.wavQuality,
      "vox:advanced": prefs.advanced,
      "vox:voiceId": prefs.voiceId,
      "vox:tone": prefs.tone,
      "vox:theme": "light",
      "vox:widget.requests": prefs.widgetRequests,
      "vox:widget.minutes": prefs.widgetMinutes,
    }).catch(() => {});
    setSavedSnapshot(JSON.stringify(prefs));
    setDismissed(false);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 1600);
  };

  const handleReset = () => {
    const defaults = { format: "mp3" as const, mp3Quality: "128", wavQuality: "16", advanced: ADVANCED_DEFAULTS, voiceId: "", tone: "Default", theme: "light" as const, widgetRequests: true, widgetMinutes: true };
    setPrefs(defaults);
  };

  const handleDismiss = () => setDismissed(true);

  useEffect(() => {
    if (!server) return;
    setServerDrafts({
      outputTtlHours: String(server.configured_output_ttl_hours ?? server.output_ttl_hours),
      maxVoiceClipDurationS: String(server.configured_max_voice_clip_duration_s ?? server.max_voice_clip_duration_s),
      defaultMaxChars: String(server.configured_default_max_chars ?? server.default_max_chars),
      chunkHeadroomChars: String(server.configured_chunk_headroom_chars ?? server.chunk_headroom_chars),
    });
    setServerDraftErrors({});
  }, [
    server?.configured_output_ttl_hours,
    server?.output_ttl_hours,
    server?.configured_max_voice_clip_duration_s,
    server?.max_voice_clip_duration_s,
    server?.configured_default_max_chars,
    server?.default_max_chars,
    server?.configured_chunk_headroom_chars,
    server?.chunk_headroom_chars,
  ]);

  const saveServerNumber = (
    draftKey: keyof typeof serverDrafts,
    patchKey: "output_ttl_hours" | "max_voice_clip_duration_s" | "default_max_chars" | "chunk_headroom_chars",
    limits: { min: number; max: number },
  ) => {
    const raw = serverDrafts[draftKey].trim();
    const value = Number(raw);
    if (!raw || !Number.isInteger(value) || value < limits.min || value > limits.max) {
      setServerDraftErrors((prev) => ({
        ...prev,
        [draftKey]: `Enter a whole number from ${limits.min.toLocaleString()} to ${limits.max.toLocaleString()}.`,
      }));
      return;
    }
    setServerDraftErrors((prev) => ({ ...prev, [draftKey]: "" }));
    serverSettingsMutation.mutate({ [patchKey]: value });
  };

  const ttlLabel = server
    ? TTL_LABELS[server.output_ttl_hours] ?? `${server.output_ttl_hours}h`
    : "—";
  const configuredHost = server?.configured_host || server?.host || "127.0.0.1";
  const hostRestartRequired = Boolean(server?.host_restart_required);
  const anyServerRestartRequired = Boolean(
    server?.host_restart_required ||
    server?.output_ttl_restart_required ||
    server?.max_voice_clip_duration_restart_required ||
    server?.default_max_chars_restart_required ||
    server?.chunk_headroom_restart_required,
  );

  return (
    <div className={`mx-auto flex max-w-[1280px] flex-col gap-5 ${isFloating ? "pb-24" : ""}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-black tracking-tight text-foreground">Settings</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Everything runs locally. Changes are saved to this device only.
          </p>
        </div>
        <Link
          to="/app/settings/$tab"
          params={{ tab: "diagnostics" }}
          className="vox-control inline-flex h-10 items-center gap-2 px-3 text-[12.5px] font-bold"
        >
          <FileText className="h-4 w-4" />
          View logs
        </Link>
      </div>

      {/* RUNTIME (server read-only) */}
      <Section id="runtime" title="Runtime" Icon={Server} subtitle="Live server configuration and network access.">
        {serverLoading ? (
          <div className="px-5 py-6 text-[13px] text-muted-foreground">Loading server info…</div>
        ) : server ? (
          <>
            <InfoRow label="Compute Device" hint="Where inference runs (MPS = Apple GPU).">
              <div className="flex items-center gap-2">
                <DeviceBadge device={server.device_resolved} />
                {server.device_config === "auto" && (
                  <span className="text-[11.5px] text-muted-foreground">(auto-detected)</span>
                )}
              </div>
            </InfoRow>
            <InfoRow label="Model" hint="Active TTS model.">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-[var(--brand)]" />
                <span className="text-[13.5px] font-semibold text-foreground">{server.model_name}</span>
              </div>
            </InfoRow>
            <InfoRow label="Network access" hint="Local only listens on this Mac. Network accessible allows devices on your LAN to reach Vox.">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentToggle
                    value={configuredHost === "0.0.0.0" ? "network" : "local"}
                    onChange={(v) => networkMutation.mutate(v === "network" ? "0.0.0.0" : "127.0.0.1")}
                    options={[
                      { value: "local", label: "Local only" },
                      { value: "network", label: "Network accessible" },
                    ]}
                  />
                  {hostRestartRequired && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--brand-warm)_30%,white)] bg-[color-mix(in_oklch,var(--brand-warm)_10%,white)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--brand-warm)]">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Requires restarting local server
                    </span>
                  )}
                  {networkMutation.isPending && (
                    <span className="text-[11.5px] font-medium text-muted-foreground">Saving…</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <span>Active:</span>
                  <code className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-[12px] text-foreground/80">
                    {server.host}:{server.port}
                  </code>
                  {configuredHost !== server.host && (
                    <>
                      <span>After restart:</span>
                      <code className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-[12px] text-foreground/80">
                        {configuredHost}:{server.port}
                      </code>
                    </>
                  )}
                </div>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Local only is the safest default. Choose network access only when you want another device on the same network to use Vox.
                </p>
                {configuredHost === "0.0.0.0" && (
                  <p className="rounded-xl border border-[color-mix(in_oklch,var(--brand-warm)_25%,white)] bg-[color-mix(in_oklch,var(--brand-warm)_8%,white)] px-3 py-2 text-[12px] leading-relaxed text-[var(--brand-warm)]">
                    Vox LAN traffic uses HTTP unless you provide trusted TLS. Pair only on a trusted network and never reuse Vox credentials elsewhere.
                  </p>
                )}
                {networkMutation.isError && (
                  <p className="text-[12px] font-medium text-[var(--brand-warm)]">Could not save network access setting.</p>
                )}
              </div>
            </InfoRow>
            <InfoRow label="Paired devices & API tokens" hint="Pair browsers from Vox Helper. Create scoped tokens for trusted local automation.">
              <div className="flex w-full max-w-2xl flex-col gap-3">
                <div className="divide-y divide-border border-y border-border">
                  {remoteCredentials.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-muted-foreground">No paired devices or active API tokens.</p>
                  ) : remoteCredentials.map((credential) => (
                    <div key={credential.id} className="flex flex-wrap items-center gap-2 px-1 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">{credential.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {credential.kind === "session" ? "Paired browser" : "API token"} · {credential.scopes.join(", ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingCredentialRevoke({
                          id: credential.id,
                          name: credential.name,
                          kind: credential.kind,
                        })}
                        disabled={revokeCredentialMutation.isPending}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold text-[var(--brand-warm)] hover:bg-muted disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    value={tokenName}
                    onChange={(event) => setTokenName(event.target.value)}
                    placeholder="Token name"
                    aria-label="API token name"
                    maxLength={80}
                    className="h-9 min-w-44 flex-1 rounded-lg border border-border bg-white px-3 text-[12.5px]"
                  />
                  <select
                    value={tokenScope}
                    onChange={(event) => setTokenScope(event.target.value as typeof tokenScope)}
                    aria-label="API token scope"
                    className="h-9 rounded-lg border border-border bg-white px-3 text-[12.5px]"
                  >
                    <option value="read">Read metadata</option>
                    <option value="generate">Read + generate</option>
                    <option value="admin">Administrator</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => createTokenMutation.mutate()}
                    disabled={!tokenName.trim() || createTokenMutation.isPending}
                    className="rounded-lg bg-foreground px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                  >
                    Create token
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeAll(true)}
                    disabled={remoteCredentials.length === 0}
                    className="rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-[var(--brand-warm)] disabled:opacity-40"
                  >
                    Revoke all devices &amp; tokens
                  </button>
                </div>
                {issuedToken && (
                  <div className="border-l-2 border-[var(--brand-secondary)] py-1 pl-3">
                    <p className="text-[12px] font-semibold">Copy this token now. Vox stores only its hash.</p>
                    <div className="mt-2 flex gap-2">
                      <code className="min-w-0 flex-1 overflow-x-auto border-b border-border px-1 py-2 text-[11px]">{issuedToken}</code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(issuedToken)}
                        className="rounded-lg border border-border bg-white px-3 text-[11.5px] font-semibold"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                {(createTokenMutation.isError || revokeCredentialMutation.isError || revokeAllMutation.isError) && (
                  <p className="text-[12px] font-medium text-[var(--brand-warm)]">Could not update remote access. Try again or restart Vox.</p>
                )}
                {remoteCredentialsError && (
                  <p className="text-[12px] font-medium text-[var(--brand-warm)]">Could not load paired devices and API tokens.</p>
                )}
              </div>
            </InfoRow>
            <InfoRow label="ffmpeg" hint="Required for audio conversion (MP3 export, WebM recording).">
              {server.ffmpeg_available ? (
                <div className="flex items-center gap-1.5 text-[13px]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--brand-secondary)]" />
                  <span className="font-medium text-[var(--brand-secondary)]">Available</span>
                  <code className="ml-1 text-[11px] text-muted-foreground">{server.ffmpeg_path}</code>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[13px]">
                  <XCircle className="h-4 w-4 text-[var(--brand-warm)]" />
                  <span className="font-medium text-[var(--brand-warm)]">Not found</span>
                  <span className="text-[11.5px] text-muted-foreground">— MP3 export will fail</span>
                </div>
              )}
            </InfoRow>
            <InfoRow label="Voice clip limit" hint="Maximum uploaded or recorded voice sample length. Invalid or empty env values fall back to 120 seconds.">
              <EditableServerNumber
                value={serverDrafts.maxVoiceClipDurationS}
                unit="sec"
                min={SERVER_LIMITS.maxVoiceClipDurationS.min}
                max={SERVER_LIMITS.maxVoiceClipDurationS.max}
                activeValue={`${server.max_voice_clip_duration_s}s active`}
                restartRequired={server.max_voice_clip_duration_restart_required}
                error={serverDraftErrors.maxVoiceClipDurationS}
                saving={serverSettingsMutation.isPending}
                onChange={(value) => {
                  setServerDraftErrors((prev) => ({ ...prev, maxVoiceClipDurationS: "" }));
                  setServerDrafts((prev) => ({ ...prev, maxVoiceClipDurationS: value }));
                }}
                onSave={() => saveServerNumber("maxVoiceClipDurationS", "max_voice_clip_duration_s", SERVER_LIMITS.maxVoiceClipDurationS)}
              />
            </InfoRow>
            <InfoRow label="Default per-chunk max" hint="Default value for the API max_chars field. This is the hard maximum characters Vox will place in one generation chunk unless a request overrides it.">
              <EditableServerNumber
                value={serverDrafts.defaultMaxChars}
                unit="chars"
                min={SERVER_LIMITS.defaultMaxChars.min}
                max={SERVER_LIMITS.defaultMaxChars.max}
                activeValue={`${server.default_max_chars} chars active`}
                restartRequired={server.default_max_chars_restart_required}
                expert
                error={serverDraftErrors.defaultMaxChars}
                saving={serverSettingsMutation.isPending}
                onChange={(value) => {
                  setServerDraftErrors((prev) => ({ ...prev, defaultMaxChars: "" }));
                  setServerDrafts((prev) => ({ ...prev, defaultMaxChars: value }));
                }}
                onSave={() => saveServerNumber("defaultMaxChars", "default_max_chars", SERVER_LIMITS.defaultMaxChars)}
              />
            </InfoRow>
            <InfoRow label="Chunk headroom" hint="Buffer subtracted from the per-chunk max when Vox packs sentences. Example: 450 max - 40 headroom = about 410 chars as the soft packing target.">
              <EditableServerNumber
                value={serverDrafts.chunkHeadroomChars}
                unit="chars"
                min={SERVER_LIMITS.chunkHeadroomChars.min}
                max={SERVER_LIMITS.chunkHeadroomChars.max}
                activeValue={`${server.chunk_headroom_chars} chars active`}
                restartRequired={server.chunk_headroom_restart_required}
                expert
                error={serverDraftErrors.chunkHeadroomChars}
                saving={serverSettingsMutation.isPending}
                onChange={(value) => {
                  setServerDraftErrors((prev) => ({ ...prev, chunkHeadroomChars: "" }));
                  setServerDrafts((prev) => ({ ...prev, chunkHeadroomChars: value }));
                }}
                onSave={() => saveServerNumber("chunkHeadroomChars", "chunk_headroom_chars", SERVER_LIMITS.chunkHeadroomChars)}
              />
            </InfoRow>
            {anyServerRestartRequired && (
              <div className="border-t border-border px-5 py-3">
                <RestartNotice />
              </div>
            )}
          </>
        ) : (
          <div className="px-5 py-5 text-[13px] text-[var(--brand-warm)]">
            Could not reach the server — make sure Vox is running.
          </div>
        )}
      </Section>

      {/* GENERATION DEFAULTS */}
      <Section
        id="generation"
        title="Generation Defaults"
        Icon={Sparkles}
        subtitle="Starting values for every new generation. Synced with the Generate page."
      >
        <Row label="Output Format" hint="Default audio format for new generations.">
          <SegmentToggle
            value={prefs.format}
            onChange={(v) => set("format", v as "mp3" | "wav")}
            options={[
              { value: "mp3", label: "MP3" },
              { value: "wav", label: "WAV" },
            ]}
          />
        </Row>
        {prefs.format === "mp3" ? (
          <Row label="MP3 Quality" hint="Higher bitrate = better sound but larger file.">
            <Select
              value={prefs.mp3Quality}
              onChange={(v) => set("mp3Quality", v)}
              options={MP3_OPTIONS.map((v) => ({
                value: v,
                label: `${v} kbps${v === "128" ? " · Default" : v === "192" ? " · Podcast" : v === "320" ? " · Max" : ""}`,
              }))}
            />
          </Row>
        ) : (
          <Row label="WAV Bit Depth" hint="24-bit recommended for editing.">
            <Select
              value={prefs.wavQuality}
              onChange={(v) => set("wavQuality", v)}
              options={[
                { value: "16", label: "16-bit · 24 kHz · Default" },
                { value: "24", label: "24-bit · 24 kHz · Studio" },
                { value: "32f", label: "32-bit float · 24 kHz · Archival" },
              ]}
            />
          </Row>
        )}
        <Row label="Default Voice Profile" hint="Voice used when opening a new Generate session.">
          <Select
            value={prefs.voiceId}
            onChange={(v) => set("voiceId", v)}
            options={voiceOptions}
          />
        </Row>
        <Row label="Default Tone" hint="Tone preset used when opening a new Generate session.">
          <Select
            value={prefs.tone}
            onChange={(v) => set("tone", v)}
            options={toneOptions}
          />
        </Row>

        {prefs.tone === "Custom" && (
          <>
            <Row label="Exaggeration" hint="Delivery drama and pace. Higher = more expressive.">
              <SliderRow value={prefs.advanced.exaggeration} onChange={(v) => setAdvField("exaggeration", v)} min={0} max={1} step={0.05} decimals={2} />
            </Row>
            <Row label="CFG Weight" hint="How closely the model follows the voice prompt.">
              <SliderRow value={prefs.advanced.cfg} onChange={(v) => setAdvField("cfg", v)} min={0} max={1} step={0.05} decimals={2} />
            </Row>
            <Row label="Temperature" hint="Randomness. Higher = more varied delivery.">
              <SliderRow value={prefs.advanced.temperature} onChange={(v) => setAdvField("temperature", v)} min={0} max={1.5} step={0.05} decimals={2} />
            </Row>
            <Row label="Repetition Penalty" hint="Discourages repeated sounds. Keep near 1.2.">
              <SliderRow value={prefs.advanced.repetition} onChange={(v) => setAdvField("repetition", v)} min={1} max={2} step={0.05} decimals={2} />
            </Row>
            <Row label="Top P" hint="Nucleus sampling threshold.">
              <SliderRow value={prefs.advanced.topP} onChange={(v) => setAdvField("topP", v)} min={0} max={1} step={0.05} decimals={2} />
            </Row>
            <Row label="Min P" hint="Minimum token probability floor.">
              <SliderRow value={prefs.advanced.minP} onChange={(v) => setAdvField("minP", v)} min={0} max={1} step={0.01} decimals={2} />
            </Row>
          </>
        )}
      </Section>

      {/* APPEARANCE */}
      <Section id="appearance" title="Appearance" Icon={Monitor} subtitle="Display preferences for Vox Studio.">
        <Row label="Theme" hint="Dark mode is wired internally and deferred until after v1.0 polish.">
          <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-[13px] font-semibold text-foreground/80">
            <Sun className="h-3.5 w-3.5 text-[var(--brand)]" />
            Light
          </span>
        </Row>
      </Section>

      {/* STORAGE */}
      <Section id="storage" title="Storage" Icon={HardDrive} subtitle="File paths and retention — edit .env to change.">
        {server ? (
          <>
            <InfoRow label="Output folder" hint="Where generated audio files are saved.">
              <StoragePath path={server.output_dir} />
            </InfoRow>
            <InfoRow label="Voice folder" hint="Where voice profiles (WAV files) are stored.">
              <StoragePath path={server.voice_dir} />
            </InfoRow>
            <InfoRow label="Input folder" hint="Drop audio here for automatic voice profile import.">
              <StoragePath path={server.input_dir} />
            </InfoRow>
            <InfoRow label="Output TTL" hint="How long generated audio is kept before auto-deletion. Use 0 to keep generated audio forever.">
              <EditableServerNumber
                value={serverDrafts.outputTtlHours}
                unit="hours"
                min={SERVER_LIMITS.outputTtlHours.min}
                max={SERVER_LIMITS.outputTtlHours.max}
                activeValue={`${ttlLabel} active`}
                restartRequired={server.output_ttl_restart_required}
                error={serverDraftErrors.outputTtlHours}
                saving={serverSettingsMutation.isPending}
                onChange={(value) => {
                  setServerDraftErrors((prev) => ({ ...prev, outputTtlHours: "" }));
                  setServerDrafts((prev) => ({ ...prev, outputTtlHours: value }));
                }}
                onSave={() => saveServerNumber("outputTtlHours", "output_ttl_hours", SERVER_LIMITS.outputTtlHours)}
              />
            </InfoRow>
            <InfoRow label="Backup & restore" hint="Backups include the database and voice assets. Generated output audio is excluded.">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-semibold text-foreground/80 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {exportMutation.isPending ? "Exporting..." : "Export backup"}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={restoreMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {restoreMutation.isPending ? "Restoring..." : "Restore backup"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) setPendingRestore(file);
                    }}
                  />
                </div>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Restore replaces current voice profiles and history with the selected backup.
                </p>
                {backupFeedback && (
                  <p className="text-[12px] font-medium text-[var(--brand-secondary)]">{backupFeedback}</p>
                )}
              </div>
            </InfoRow>
          </>
        ) : (
          <div className="px-5 py-5 text-[13px] text-muted-foreground">Waiting for server…</div>
        )}
        <div className="border-t border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12.5px] text-muted-foreground">
              Expired outputs are cleaned up automatically by the server based on the TTL above.
            </div>
            <button
              onClick={() => setConfirmClear(true)}
              className="shrink-0 text-[12px] font-semibold text-[oklch(0.55_0.22_25)] hover:underline"
            >
              Clear all outputs now
            </button>
          </div>
        </div>
      </Section>

      {/* DASHBOARD WIDGETS */}
      <Section
        id="widgets"
        title="Dashboard Widgets"
        Icon={LayoutGrid}
        subtitle="Choose which stats panels appear in the sidebar. Changes take effect after saving."
      >
        <Row label="Requests widget" hint="Shows total requests (lifetime) and today's count with a 7-day sparkline.">
          <Toggle checked={prefs.widgetRequests} onChange={(v) => set("widgetRequests", v)} />
        </Row>
        <Row label="Audio Generated widget" hint="Shows total minutes generated (all time) and today's minutes with a 7-day sparkline.">
          <Toggle checked={prefs.widgetMinutes} onChange={(v) => set("widgetMinutes", v)} />
        </Row>
      </Section>

      {/* PRIVACY */}
      <Section id="privacy" title="Privacy" Icon={Shield} subtitle="You control what — if anything — leaves this device.">
        <Row label="Crash Reports" hint="Send anonymous crash reports." comingSoon>
          <Toggle checked={false} onChange={() => {}} disabled />
        </Row>
      </Section>

      {/* Save bar — in page flow when clean, fixed+floating when dirty */}
      {!isFloating && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 shadow-[0_2px_8px_-4px_oklch(0.16_0.02_260/0.08)]">
          <span className="mr-auto text-[12px] text-muted-foreground">
            {saveFeedback
              ? "Preferences saved — Generate page will use these values next session."
              : "Generation defaults are saved locally on this device."}
          </span>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium text-foreground/80 hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
          >
            {saveFeedback ? <><Check className="h-3.5 w-3.5" /> Saved</> : "Save changes"}
          </button>
        </div>
      )}

      {isFloating && (
        <div className="fixed bottom-6 left-64 right-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-[color-mix(in oklch, var(--brand-warm) 22%, white)] bg-[color-mix(in oklch, var(--brand-warm) 8%, white)] px-4 py-3 shadow-[0_12px_32px_-8px_oklch(0.16_0.02_260/0.22)]">
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--brand-warm)]" />
            <span className="text-[12.5px] font-medium text-[var(--brand-warm)]">
              Generation defaults have unsaved changes — they'll be lost if you leave this page.
            </span>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss warning"
              className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-[var(--brand-warm)] hover:bg-[color-mix(in oklch, var(--brand-warm) 10%, white)] hover:text-[var(--brand-warm)]"
            >
              <X className="h-3 w-3" /> ignore
            </button>
          </div>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[color-mix(in oklch, var(--brand-warm) 18%, white)] bg-white/80 px-3 py-2 text-[13px] font-medium text-foreground/80 hover:bg-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
          >
            Save changes
          </button>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear all output files?"
          description="This permanently deletes all generated audio files on this device. Scripts are kept — you can regenerate any clip from History."
          confirmLabel="Yes, clear outputs"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => setConfirmClear(false)}
        />
      )}
      {confirmRevokeAll && (
        <ConfirmDialog
          title="Revoke every remote device and token?"
          description="All paired browsers and API tokens will lose access immediately. Local Vox data is not deleted."
          confirmLabel="Revoke all access"
          onCancel={() => setConfirmRevokeAll(false)}
          onConfirm={() => revokeAllMutation.mutate()}
        />
      )}
      {pendingCredentialRevoke && (
        <ConfirmDialog
          title={`Revoke ${pendingCredentialRevoke.name}?`}
          description={pendingCredentialRevoke.kind === "session"
            ? "This browser will lose access immediately and must be paired again to reconnect."
            : "This API token will stop working immediately and must be recreated to restore automation access."}
          confirmLabel="Revoke access"
          onCancel={() => setPendingCredentialRevoke(null)}
          onConfirm={() => revokeCredentialMutation.mutate(pendingCredentialRevoke.id)}
        />
      )}
      {pendingRestore && (
        <ConfirmDialog
          title="Restore this Vox backup?"
          description={`This replaces current voice profiles and history with ${pendingRestore.name}. Existing generated output audio and local settings are kept.`}
          confirmLabel="Restore backup"
          onCancel={() => setPendingRestore(null)}
          onConfirm={() => {
            const file = pendingRestore;
            setPendingRestore(null);
            restoreMutation.mutate(file);
          }}
        />
      )}
    </div>
  );
}

export function DiagnosticsSettings() {
  const { data: server } = useQuery({ queryKey: ["settings"], queryFn: getServerSettings });
  const logs = useQuery({ queryKey: ["logs", "server"], queryFn: () => getLogFile("server", 120) });
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand)]">Settings</p><h1 className="mt-1 text-3xl font-black tracking-tight">Diagnostics</h1><p className="mt-2 text-sm text-foreground/55">Runtime identity, managed paths, and recent server activity.</p></div>
        <Link to="/app/settings" className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold">All settings</Link>
      </div>
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-bold">Runtime</h2>
        <div className="mt-4 divide-y divide-border text-sm">
          <InfoRow label="Version">{server?.vox_version ?? "—"}</InfoRow>
          <InfoRow label="Build">{server?.build_commit ?? "—"}</InfoRow>
          <InfoRow label="Device">{server?.device_resolved ?? "—"}</InfoRow>
          <InfoRow label="Model">{server?.model_name ?? "—"}</InfoRow>
          <InfoRow label="Output path">{server?.output_dir ?? "—"}</InfoRow>
          <InfoRow label="Voice path">{server?.voice_dir ?? "—"}</InfoRow>
        </div>
      </section>
      <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-bold">Recent server log</h2><p className="text-xs text-foreground/50">Last 120 bounded lines</p></div><button type="button" onClick={() => void logs.refetch()} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold">Refresh</button></div>
        <pre className="max-h-[440px] overflow-auto bg-slate-950 p-5 text-xs leading-5 text-slate-200">{logs.isLoading ? "Loading diagnostics…" : logs.isError ? "Logs are unavailable." : logs.data?.lines?.join("\n") || "No server log entries yet."}</pre>
      </section>
    </div>
  );
}

// ─── StoragePath ─────────────────────────────────────────────────────────────

function EditableServerNumber({
  value,
  unit,
  min,
  max,
  activeValue,
  restartRequired,
  expert,
  error,
  saving,
  onChange,
  onSave,
}: {
  value: string;
  unit: string;
  min: number;
  max: number;
  activeValue: string;
  restartRequired: boolean;
  expert?: boolean;
  error?: string;
  saving?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-32 rounded-lg border border-border bg-white px-3 pr-12 text-[13.5px] font-bold text-foreground outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold text-muted-foreground">
            {unit}
          </span>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-3 text-[12.5px] font-bold text-foreground/80 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <span className="rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
          {activeValue}
        </span>
        {expert && <ExpertBadge />}
        {restartRequired && <RestartBadge />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        <span>Allowed range: {min.toLocaleString()}–{max.toLocaleString()}.</span>
        {error && <span className="font-semibold text-[var(--brand-warm)]">{error}</span>}
      </div>
    </div>
  );
}

function RestartBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--brand-warm)_30%,white)] bg-[color-mix(in_oklch,var(--brand-warm)_10%,white)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--brand-warm)]">
      <AlertTriangle className="h-3.5 w-3.5" />
      Requires restarting local server
    </span>
  );
}

function RestartNotice() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_oklch,var(--brand-warm)_25%,white)] bg-[color-mix(in_oklch,var(--brand-warm)_7%,white)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--brand-warm)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        One or more server settings are saved for the next launch. Restart the local Vox server from the helper menu for them to take effect.
      </span>
    </div>
  );
}

function ExpertBadge() {
  return (
    <span className="rounded-full border border-[oklch(0.82_0.08_265)] bg-[oklch(0.96_0.035_265)] px-2 py-1 text-[10.5px] font-black uppercase tracking-wide text-[var(--brand)]">
      Expert
    </span>
  );
}

function StoragePath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(path).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  // Close tooltip on outside click
  useEffect(() => {
    if (!tipOpen) return;
    const handler = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) setTipOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tipOpen]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-[oklch(0.985_0.005_260)] px-3 py-2 font-mono text-[12px] text-foreground/75">
        {path}
      </code>

      {/* Info tooltip */}
      <div ref={tipRef} className="relative shrink-0">
        <button
          onClick={() => setTipOpen((v) => !v)}
          aria-label="How to open this folder"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-foreground/50 hover:bg-muted hover:text-[var(--brand)]"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        {tipOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[300px] rounded-xl border border-border bg-white p-3.5 shadow-[0_12px_30px_-12px_oklch(0.16_0.02_260/0.25)]">
            <p className="text-[12.5px] leading-relaxed text-foreground/80">
              <span className="font-semibold text-foreground">How to open this folder:</span> click
              the <Folder className="inline h-3 w-3 align-text-bottom" /> button to copy the path.
              In Finder press{" "}
              <Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>G</Kbd>{" "}
              (or <em>Go → Go to Folder…</em>), paste, and press Return.
            </p>
          </div>
        )}
      </div>

      {/* Copy button */}
      <button
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy path"}
        title={copied ? "Copied!" : "Copy path to clipboard"}
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors " +
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
      <kbd className="mx-0.5 inline-flex h-5 min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10.5px] font-semibold text-foreground/80 shadow-[0_1px_0_oklch(0.16_0.02_260/0.08)]">
      {children}
    </kbd>
  );
}

// ─── DeviceBadge ─────────────────────────────────────────────────────────────

function DeviceBadge({ device }: { device: string }) {
  const isMps = device === "mps";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold " +
        (isMps
          ? "bg-gradient-to-br from-[var(--brand)] to-[var(--brand-secondary)] text-white shadow-sm"
          : "bg-muted text-foreground/70")
      }
    >
      <Cpu className="h-3.5 w-3.5" />
      {isMps ? "Apple MPS" : device.toUpperCase()}
    </span>
  );
}

// ─── confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-[var(--brand-soft)] px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-foreground/80 hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-gradient-to-br from-[var(--brand)] to-[var(--brand-secondary)] px-3.5 py-2 text-[12.5px] font-bold text-white shadow-sm hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── layout primitives ────────────────────────────────────────────────────────

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
    <section id={id} className="vox-panel overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-[var(--card)] to-[var(--background)] px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
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
            <span className="rounded-md bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--brand)]">
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

// Read-only variant — label on left, value on right, no grid — value is compact
function InfoRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-foreground">{label}</div>
        {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ─── form controls ────────────────────────────────────────────────────────────

function SegmentToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: typeof Monitor }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-[oklch(0.98_0.003_260)] p-1 shadow-sm">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              "inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-all " +
              (active
                ? "bg-gradient-to-br from-[var(--brand)] to-[var(--brand-secondary)] text-white shadow-[0_2px_6px_oklch(0.55_0.22_260/0.35)]"
                : "text-foreground/65 hover:text-foreground")
            }
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[] | readonly string[];
}) {
  const normalised = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-border bg-white px-3 py-2 pr-9 text-[13.5px] font-medium text-foreground outline-none focus:border-[var(--brand)]"
      >
        {normalised.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute inset-y-0 right-2.5 my-auto h-3.5 w-3.5 text-foreground/50" />
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
            className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-secondary)]"
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

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
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
