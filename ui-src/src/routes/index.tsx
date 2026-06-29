import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import voxLogoV2 from "@/assets/vox-logo-v2.png";
import voxLogoDark from "@/assets/vox-logo-dark-trim.png";
import voxInstallerIcon from "@/assets/vox-installer-icon.png";
import studioScreenshot from "@/assets/studio-screenshot.png";

import {
  AudioLines,
  Zap,
  User,
  Clock,
  Settings,
  ChevronRight,
  FileText,
  Sparkles,
  Lock,
  Apple,
  ShieldCheck,
  Search,
  ChevronDown,
  Play,
  Download,
  RefreshCw,
  MoreHorizontal,
  Github,
  Star,
  Mic,
  PenLine,
  Music2,
  Copy,
  Check,
  Terminal,
  BookOpen,
  ExternalLink,
  Volume2,

  Menu,
  X,
  Heart,
  Package,
} from "lucide-react";
import { BRAND, BRAND_GRADIENT, BRAND_SECONDARY, BRAND_WARM } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vox — Private voice generation on your machine" },
      {
        name: "description",
        content:
          "Run Chatterbox-powered text-to-speech locally. Create voice profiles, generate MP3/WAV, and keep every script offline.",
      },
      { property: "og:title", content: "Vox — Private voice generation on your machine" },
      {
        property: "og:description",
        content:
          "Run Chatterbox-powered text-to-speech locally. Create voice profiles, generate MP3/WAV, and keep every script offline.",
      },
    ],
  }),
  component: Index,
});

function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img src={voxLogoV2} alt="VOX" className="h-12 w-auto" />
    </div>
  );
}

function StatusDot({ color = BRAND }: { color?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

const PRIMARY_CTA_STYLE = {
  background: "var(--brand-gradient)",
  boxShadow: "var(--shadow-btn)",
};

function GithubBadge() {
  return (
    <a
      href="https://noelmom.github.io"
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Open support page"
      className="group inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-3 py-1.5 text-xs font-semibold text-foreground/80 shadow-sm backdrop-blur transition-all hover:border-[var(--brand)] hover:text-foreground hover:shadow-md"
    >
      <Github className="h-3.5 w-3.5" strokeWidth={2.25} />
      <span className="hidden sm:inline">Support</span>
      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground/70 transition-colors group-hover:bg-[var(--brand-soft)] group-hover:text-[var(--brand)]">
        <Star className="h-3 w-3" fill="currentColor" />
        2.4k
      </span>
    </a>
  );
}

function Index() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("#top");
  const navLinks: { label: string; href: string }[] = [
    { label: "How it works", href: "#how-it-works" },
    { label: "Get Started", href: "#get-started" },
    { label: "API Docs", href: "#api-docs" },
  ];

  useEffect(() => {
    const sections = ["top", ...navLinks.map((link) => link.href.slice(1))]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(`#${visible.target.id}`);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.25, 0.5] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      id="top"
      className="relative min-h-screen w-full overflow-hidden"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-[1180px] px-6 lg:px-10">
          <div className="relative py-4">
            <div className="flex items-center justify-between gap-3">
              <a href="#top" aria-label="Vox — back to top">
                <Logo className="[&_img]:h-12" />
              </a>
              <nav className="hidden items-center gap-8 lg:flex">
                {navLinks.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    aria-current={activeSection === l.href ? "page" : undefined}
                    className={[
                      "text-sm font-medium transition-colors hover:text-foreground",
                      activeSection === l.href ? "text-[var(--brand)]" : "text-foreground/80",
                    ].join(" ")}
                  >
                    {l.label}
                  </a>
                ))}
              </nav>
              <div className="hidden items-center gap-3 lg:flex">
                <GithubBadge />
                <Link
                  to="/app"
                  className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:brightness-110"
                  style={PRIMARY_CTA_STYLE}
                >
                  Open App
                </Link>

              </div>
              {/* Mobile toggle */}
              <button
                type="button"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-white lg:hidden"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>

            {/* Mobile dropdown */}
            {menuOpen && (
              <div
                className="absolute left-0 right-0 top-full z-40 mt-2 origin-top rounded-2xl border border-border bg-white/95 p-4 shadow-xl backdrop-blur-md lg:hidden"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <nav className="flex flex-col">
                  {navLinks.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={activeSection === l.href ? "page" : undefined}
                      className={[
                        "rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted hover:text-foreground",
                        activeSection === l.href ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-foreground/80",
                      ].join(" ")}
                    >
                      {l.label}
                    </a>
                  ))}
                </nav>
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                  <a
                    href="https://noelmom.github.io"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <Github className="h-4 w-4" strokeWidth={2.25} />
                    Support
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground/70">
                      <Star className="h-3 w-3" fill="currentColor" />
                      2.4k
                    </span>
                  </a>
                  <Link
                    to="/app"
                    onClick={() => setMenuOpen(false)}
                    className="w-full rounded-lg px-5 py-2.5 text-center text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:brightness-110"
                    style={PRIMARY_CTA_STYLE}
                  >
                    Open App
                  </Link>

                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-6 lg:px-10">





        {/* Hero */}
        <section className="relative pt-8 lg:pt-12">
          {/* Waveform background */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[55%] lg:block">
            <Waveform />
          </div>

          <div className="relative max-w-[560px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-wider text-foreground/70 backdrop-blur">
              <StatusDot color="var(--brand)" />
              LOCAL · PRIVATE · FREE
            </div>
            <h1 className="mt-6 max-w-[540px] text-[56px] font-black leading-[1.02] tracking-tight text-foreground sm:text-[64px]">
              <span className="text-[var(--brand-secondary)]">Private</span>{" "}
              voice generation on your machine.
            </h1>
            <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-muted-foreground">
              Run Chatterbox-powered text-to-speech locally.<br />
              Create voice profiles, generate MP3/WAV,<br />
              and keep every script offline.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/app"
                className="group inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:brightness-110"
                style={PRIMARY_CTA_STYLE}
              >
                <AudioLines className="h-4 w-4" />
                Open Studio
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>

              <a href="#api-docs" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
                <FileText className="h-4 w-4" />
                View API Docs
              </a>
            </div>
          </div>
        </section>

        {/* App preview — real screenshot with feature callouts */}
        <section className="mt-10">
          <StudioScreenshot />
        </section>

        {/* Feature row */}
        <section className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              Icon: Lock,
              title: "100% Local",
              desc: "Everything runs on your machine. No cloud. No uploads.",
            },
            {
              Icon: AudioLines,
              title: "Chatterbox Turbo",
              desc: "High quality, expressive speech synthesis.",
            },
            {
              Icon: Apple,
              title: "Apple Optimized",
              desc: "Accelerated by Apple MPS for blazing fast generation.",
            },
            {
              Icon: ShieldCheck,
              title: "Your Data Stays Yours",
              desc: "No accounts, no telemetry, no tracking.",
            },
          ].map(({ Icon, title, desc }) => (
            <div key={title}>
              <Icon className="h-7 w-7 text-[var(--brand)]" strokeWidth={1.75} />
              <h3 className="mt-3 text-[15px] font-bold text-foreground">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mt-24 scroll-mt-24">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-wider text-foreground/70 backdrop-blur">
              <StatusDot color="var(--brand)" />
              HOW IT WORKS
            </div>
            <h2 className="mt-4 text-[40px] font-black leading-[1.05] tracking-tight text-foreground">
              Three steps from text to audio
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
              Record or upload a short voice clip, then generate studio-quality audio from any text in seconds.
            </p>
          </div>

          <div className="relative mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {/* Connector line */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-[28px] hidden h-px md:block"
              style={{
                background:
                  "linear-gradient(to right, transparent, color-mix(in oklch, var(--brand) 25%, transparent), color-mix(in oklch, var(--brand-secondary) 25%, transparent), transparent)",
              }}
            />
            {[
              {
                n: "01",
                Icon: Mic,
                title: "Add a voice profile",
                desc: "Record directly in the browser or drop in an audio file. iPhone Voice Memos work great. Vox converts and stores it locally.",
              },
              {
                n: "02",
                Icon: PenLine,
                title: "Write your script",
                desc: "Paste any text into the UI or send via API. Choose a built-in tone or open the Custom panel to dial in every parameter exactly how you want it.",
              },
              {
                n: "03",
                Icon: Music2,
                title: "Download your audio",
                desc: "Vox generates MP3 or WAV using Apple Silicon acceleration. Play it in the browser, download it, or pipe it into your workflow.",
              },
            ].map(({ n, Icon, title, desc }) => (
              <div
                key={n}
                className="relative rounded-2xl border border-border bg-white/80 p-6 backdrop-blur transition-all hover:-translate-y-0.5"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white"
                    style={{
                      background:
                        "var(--brand-gradient)",
                      boxShadow: "var(--shadow-btn)",
                    }}
                  >
                    {n}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <Icon
                    className="h-5 w-5 text-[var(--brand)]"
                    strokeWidth={2}
                  />
                </div>
                <h3 className="mt-5 text-[17px] font-bold text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Get Started — full-bleed dark */}
      <GetStarted />

      <div className="mx-auto max-w-[1180px] px-6 lg:px-10">
        {/* Builders / API */}
        <ApiSection />

      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}




function Waveform() {
  // Decorative SVG dotted waveform
  const lines = [0, 1, 2, 3];
  return (
    <svg
      viewBox="0 0 600 380"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="wgrad" x1="0" x2="1">
          <stop offset="0" stopColor="var(--brand)" stopOpacity="0" />
          <stop offset="0.4" stopColor="var(--brand)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--brand-secondary)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {lines.map((i) => {
        const yBase = 180 + i * 8;
        const amp = 70 - i * 12;
        const points = Array.from({ length: 80 }, (_, k) => {
          const x = (k / 79) * 600;
          const y =
            yBase +
            Math.sin((k / 79) * Math.PI * 3 + i * 0.6) * amp * Math.sin((k / 79) * Math.PI);
          return [x, y] as const;
        });
        return (
          <g key={i} opacity={0.85 - i * 0.15}>
            {points.map(([x, y], k) => (
              <circle
                key={k}
                cx={x}
                cy={y}
                r={1.6}
                fill="url(#wgrad)"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function StudioScreenshot() {
  return (
    <div className="relative">
      {/* Soft chromatic glow behind the screenshot */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[28px] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 30%, color-mix(in oklch, var(--brand) 35%, transparent), transparent 70%), radial-gradient(50% 50% at 80% 70%, color-mix(in oklch, var(--brand-secondary) 30%, transparent), transparent 70%)",
        }}
      />

      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-white/90"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {/* macOS-style title bar */}
        <div className="flex items-center gap-2 border-b border-border bg-[oklch(0.985_0.005_260)] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] font-medium text-foreground/55">
            vox.studio — Generate
          </span>
        </div>

        <img
          src={studioScreenshot}
          alt="Vox Studio — Generate tab"
          className="block w-full"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function StudioPreview() {
  return (
      <div
      className="overflow-hidden rounded-2xl border border-border bg-white/90"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Logo />
        <div className="flex items-center gap-5 text-xs font-medium text-foreground/70">
          <span className="inline-flex items-center gap-1.5"><StatusDot />Ready</span>
          <span className="inline-flex items-center gap-1.5"><StatusDot color="var(--brand)" />Apple MPS</span>
          <span className="inline-flex items-center gap-1.5"><StatusDot color="var(--brand)" />Chatterbox Turbo</span>
        </div>
      </div>

      <div className="grid grid-cols-[160px_1fr_280px]">
        {/* Sidebar */}
        <aside className="border-r border-border py-4">
          {[
            { Icon: Zap, label: "Generate", active: true },
            { Icon: User, label: "Voices" },
            { Icon: Clock, label: "History" },
            { Icon: Settings, label: "Settings" },
          ].map(({ Icon, label, active }) => (
            <button
              key={label}
              className={`flex w-full items-center gap-2.5 px-5 py-2.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                  : "text-foreground/70 hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </aside>

        {/* Script panel */}
        <section className="border-r border-border p-5">
          <h3 className="text-[13px] font-semibold text-foreground">Script</h3>
          <div className="mt-2 rounded-lg border border-border bg-white p-3.5">
            <p className="text-[13px] leading-relaxed text-foreground/80">
              It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness…
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>123 / 3,000 characters</span>
            <span>Est. 22 sec</span>
          </div>
          <button
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:brightness-110"
            style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
          >
            <AudioLines className="h-4 w-4" />
            Generate Voice
            <Sparkles className="h-4 w-4" />
          </button>

          {/* Recent output */}
          <div className="mt-6">
            <h4 className="text-[13px] font-semibold text-foreground">Recent Output</h4>
              <div className="mt-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2.5">
                <button className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-foreground">
                    A Tale of Two Cities – Opening
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Today · 2:54 PM · Noelmo Normal · Default
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 shrink-0 text-foreground/60" />
                <MiniWaveform />
                <div className="flex shrink-0 items-center gap-1.5 text-foreground/60">
                  <button className="rounded p-1 hover:bg-muted"><Download className="h-3.5 w-3.5" /></button>
                  <button className="rounded p-1 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /></button>
                  <button className="rounded p-1 hover:bg-muted"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>0:00</span>
                <span>0:22</span>
              </div>
            </div>
          </div>
        </section>

        {/* Voice Studio */}
        <aside className="p-5">
          <h3 className="text-[13px] font-semibold text-foreground">Voice Studio</h3>

          <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Voice Profile</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1 text-[12px] text-foreground">Noelmo Normal</span>
              <AudioLines className="h-3.5 w-3.5 text-[var(--brand)]" />
          </div>

          <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Tone</label>
          <div className="mt-1.5 flex items-center justify-between rounded-lg border border-border px-2.5 py-2">
            <span className="text-[12px] text-foreground">Default</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Warm", "Calm", "Bright", "…"].map((t) => (
              <button
                key={t}
                className="rounded border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:bg-muted"
              >
                {t}
              </button>
            ))}
          </div>

          <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Output Format</label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              className="rounded-md py-1.5 text-[12px] font-semibold text-white"
              style={{ background: BRAND_GRADIENT }}
            >
              MP3
            </button>
            <button className="rounded-md border border-border py-1.5 text-[12px] font-semibold text-foreground/80 hover:bg-muted">
              WAV
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[11px] text-foreground/70">
            <StatusDot color={BRAND} />
            Chatterbox Turbo
            <span className="ml-auto inline-flex items-center gap-1">
              Apple MPS <StatusDot />
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MiniWaveform() {
  const bars = Array.from({ length: 90 }, (_, i) =>
    Math.abs(Math.sin(i * 0.6) + Math.cos(i * 0.3)) * 0.6 + 0.15,
  );
  return (
    <div className="flex h-6 flex-1 items-center justify-between gap-px pr-[5px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full"
          style={{
            height: `${h * 100}%`,
            backgroundColor:
              i < 18 ? "var(--brand)" : "color-mix(in oklch, var(--brand) 35%, transparent)",
          }}
        />
      ))}
    </div>
  );

}

function GetStarted() {
  const [copied, setCopied] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);
  const [tab, setTab] = useState<"oneclick" | "manual">("oneclick");
  const command = `git clone git@github.com:MeloLabDev/codename-vox\ncd codename-vox\nbash vox.sh install`;
  const pkgName = "Vox-1.0.0-rc3.pkg";
  const pkgSize = "8.8 MB";
  const pkgUrl = "https://github.com/MeloLabDev/codename-vox/releases/download/v1.0.0-rc3/Vox-1.0.0-rc3.pkg";
  const sha256 = "d120bcfbae366810c8c7d763fddab72d792f4ac72c19a6192eabe11667c65c79";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(sha256);
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 1800);
    } catch {
      /* noop */
    }
  };


  return (
    <section
      id="get-started"
      className="relative mt-24 scroll-mt-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% 0%, oklch(0.22 0.04 260) 0%, oklch(0.16 0.02 260) 45%, oklch(0.12 0.01 260) 100%)",
      }}
    >
      {/* Decorative glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--brand) 55%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-[320px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--brand-secondary) 40%, transparent), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6 py-24 lg:px-10 lg:py-32">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-white/60 backdrop-blur">
            <StatusDot />
            GET STARTED
          </div>
          <h2 className="mt-5 text-[56px] font-black leading-[1.02] tracking-tight text-white sm:text-[64px]">
            Ready to run it?
          </h2>
          <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-relaxed text-white/60">
            One click or one command. Either way, you're running locally in minutes.
          </p>
        </div>

        {/* Tab toggle */}
        <div className="mx-auto mt-10 flex max-w-fit items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
          {([
            { id: "oneclick", label: "One-click", Icon: Package },
            { id: "manual", label: "Manual", Icon: Terminal },
          ] as const).map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all ${
                  active
                    ? "text-white"
                    : "text-white/65 hover:text-white"
                }`}
                style={
                  active
                    ? {
                        background: BRAND_GRADIENT,
                        boxShadow: "var(--shadow-btn)",
                      }
                    : undefined
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div className="mx-auto mt-8 max-w-[760px]">
          <div
            className="relative rounded-2xl border border-white/20 bg-white"
            style={{
              boxShadow:
                "0 0 0 1px oklch(1 0 0 / 0.12), 0 30px 80px -30px oklch(0.1 0.04 260 / 0.9), 0 8px 32px -8px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.9)",
            }}
          >
            {/* Window chrome */}
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-secondary)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-warm)]" />
            </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-black/55">
                {tab === "manual" ? (
                  <>
                    <Terminal className="h-3.5 w-3.5" />
                    vox · install
                  </>
                ) : (
                  <>
                    <Package className="h-3.5 w-3.5" />
                    {pkgName}
                  </>
                )}
              </div>
              {tab === "manual" ? (
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-black/70 transition-colors hover:bg-black/10 hover:text-black"
                  aria-label="Copy install commands"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              ) : (
                <span className="w-[58px]" aria-hidden="true" />
              )}

            </div>

            {/* Body */}
            {tab === "manual" ? (
              <div className="px-5 py-5 font-mono text-[14px] leading-7 text-black/85 sm:px-7">
                {[
                  "git clone git@github.com:MeloLabDev/codename-vox",
                  "cd codename-vox",
                  "bash vox.sh install",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3">
                    <span className="select-none text-[var(--brand-secondary)]">$</span>
                    <span className="break-all">{line}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-7 sm:px-7">
                <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                  <img
                    src={voxInstallerIcon}
                    alt="Vox installer package"
                    loading="lazy"
                    width={1024}
                    height={1024}
                    className="h-20 w-20 shrink-0"
                    style={{
                      filter:
                        "drop-shadow(0 14px 26px oklch(0.1 0.04 260 / 0.25))",
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-bold text-black">
                      {pkgName}
                    </div>
                    <div className="mt-1 text-[12.5px] text-black/60">
                      macOS · Apple Silicon · {pkgSize}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-black/55">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Notarized
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-[var(--brand-secondary)]">SHA256 d120…5c79</span>

                        <button
                          type="button"
                          onClick={handleCopyHash}
                          aria-label="Copy SHA256 hash"
                          className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-black/65 transition-colors hover:bg-black/10 hover:text-black"
                        >
                          {hashCopied ? (
                            <>
                              <Check className="h-2.5 w-2.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-2.5 w-2.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </span>
                    </div>
                  </div>

                </div>

                <a
                  href={pkgUrl}
                  download
                  className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-white transition-all hover:brightness-110"
                  style={{
                    background:
                      "var(--brand-gradient)",
                    boxShadow:
                      "var(--shadow-btn)",
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download .pkg installer
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <p className="mt-3 text-center text-[11px] text-black/45">
                  Double-click to install ·{" "}
                  <a
                    href="https://brew.sh/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-semibold text-[var(--brand)] underline decoration-[color-mix(in_oklch,var(--brand)_35%,transparent)] underline-offset-2 hover:text-[var(--brand-secondary)]"
                  >
                    Homebrew
                  </a>{" "}
                  required
                </p>
              </div>
            )}
          </div>
        </div>


        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://noelmom.github.io"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
          >
            <Github className="h-4 w-4" />
            Support
          </a>
          <a
            href="https://buymeacoffee.com/noelmo"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
          >
            <CoffeeCup />
            Buy me a Coffee
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="relative overflow-hidden border-t border-white/5"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.16 0.02 260) 0%, oklch(0.11 0.01 260) 100%)",
      }}
    >
      {/* Glow accents */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[260px] w-[680px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--brand) 55%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 right-0 h-[220px] w-[420px] rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--brand-secondary) 40%, transparent), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6 py-14 lg:px-10">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex items-center gap-3">
            <img src={voxLogoDark} alt="VOX" className="h-14 w-auto" />
          </div>

          <p className="max-w-[460px] text-[13px] leading-relaxed text-white/55">
            Private voice generation on your machine. No cloud, no accounts, no telemetry and no fees.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[13px] font-medium text-white/60">
            {[
              { label: "Home", href: "#top" },
              { label: "How it works", href: "#how-it-works" },
              { label: "Get Started", href: "#get-started" },
              { label: "API Docs", href: "#api-docs" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <a
              href="https://noelmom.github.io"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
            >
              <Github className="h-3.5 w-3.5" />
              Support
            </a>
          </div>

          <div className="h-px w-full max-w-[280px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          <div className="flex flex-col items-center gap-1.5 text-[12px] text-white/50">
            <div className="inline-flex items-center gap-1.5">
              <span>Made with</span>
              <Heart
                className="h-3.5 w-3.5 text-[var(--brand-warm)]"
                fill="currentColor"
                strokeWidth={0}
              />
              <span>in South Florida</span>
              <span aria-hidden className="mx-1">·</span>
              <span aria-label="Sun">🌴</span>
            </div>
            <div className="text-white/35">© {year} Vox · MIT License</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function CoffeeCup() {
  return (
    <span
      className="relative inline-flex h-6 w-6 items-center justify-center"
      aria-hidden
    >
      {/* steam */}
      <span
        className="absolute -top-1.5 left-1/2 h-2.5 w-[2px] -translate-x-[6px] rounded-full bg-white/80 blur-[1px]"
        style={{ animation: "voxSteam 1.8s ease-in-out infinite" }}
      />
      <span
        className="absolute -top-2 left-1/2 h-3 w-[2px] translate-x-[1px] rounded-full bg-white/70 blur-[1px]"
        style={{ animation: "voxSteam 2.1s ease-in-out infinite 0.3s" }}
      />
      {/* cup */}
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z"
          fill={BRAND_WARM}
          stroke={BRAND}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"
          stroke={BRAND}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <ellipse cx="10" cy="11.5" rx="4.2" ry="0.9" fill={`color-mix(in oklch, ${BRAND_WARM} 60%, white)`} />
      </svg>
      <style>{`@keyframes voxSteam {0%{transform:translateY(2px) scaleY(0.6);opacity:0}30%{opacity:0.9}100%{transform:translateY(-6px) scaleY(1.1);opacity:0}}`}</style>
    </span>
  );
}

const CURL_SNIPPET = {
  filename: "request.sh",
  lines: [
    { text: "# generate audio with a named voice profile", color: "muted" },
    { text: 'curl -X POST http://localhost:8000/api/v1/tts \\', color: "code" },
    { text: '  -F "text=Hello, this is Vox." \\', color: "string" },
    { text: '  -F "voice_name=noelmo-normal" \\', color: "string" },
    { text: '  -F "preset=youtube" \\', color: "string" },
    { text: "  --output audio.mp3", color: "code" },
    { text: "", color: "code" },
    { text: "# every response carries timing + tracing headers", color: "muted" },
    { text: "X-Request-ID: 149e08c1-7b76-4fc3-88c3...", color: "header" },
    { text: "X-Audio-Duration-Seconds: 3.37", color: "header" },
    { text: "X-Generation-Seconds: 4.12", color: "header" },
    { text: "X-RTF: 1.22", color: "header" },
  ],
};

function colorClass(c?: string) {
  switch (c) {
    case "muted":
      return "text-white/35";
    case "string":
      return "text-[var(--brand-secondary)]";
    case "keyword":
      return "text-[var(--brand)]";
    case "header":
      return "text-[var(--brand-warm)]";
    default:
      return "text-white/85";
  }
}

function ApiSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CURL_SNIPPET.lines.map((l) => l.text).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <section id="api-docs" className="mt-20 scroll-mt-24 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-foreground/70 backdrop-blur">
        <StatusDot color="var(--brand)" />
        USE IT YOUR WAY
      </div>
      <h2 className="mt-4 text-[40px] font-black leading-[1.05] tracking-tight text-foreground">
        Built for scripts and automations
      </h2>
      <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-muted-foreground">
        Use the studio UI, or call the local API directly with curl. Every response carries timing and tracing headers.
      </p>

      {/* Terminal */}
      <div className="mx-auto mt-8 max-w-[820px] text-left">
        <div
          className="relative rounded-2xl border border-white/10 bg-[oklch(0.18_0.02_260)]/95 backdrop-blur"
          style={{
            boxShadow:
              "0 30px 80px -30px oklch(0.1 0.04 260 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.05)",
          }}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-secondary)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-warm)]" />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium text-white/40">
              <Terminal className="h-3.5 w-3.5" />
              {CURL_SNIPPET.filename}
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="px-5 py-5 font-mono text-[13.5px] leading-7 sm:px-7">
            {CURL_SNIPPET.lines.map((line, i) => (
              <div key={i} className={`min-h-[1.75rem] ${colorClass(line.color)}`}>
                {line.text || "\u00A0"}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <a
          href="/docs"
          className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl px-7 py-3.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5"
          style={{
            background:
              "var(--brand-gradient)",
            boxShadow:
              "var(--shadow-btn)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-80"
          />
          <BookOpen className="h-4 w-4" />
          Full API Documentation
          <ExternalLink className="h-3.5 w-3.5 opacity-80 transition-transform group-hover:translate-x-0.5" />
        </a>
        <p className="mt-4 text-[12px] text-muted-foreground">
          Local text-to-speech REST API for private audio generation on Apple Silicon.
        </p>

      </div>
    </section>
  );
}
