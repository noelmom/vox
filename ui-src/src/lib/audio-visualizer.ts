/**
 * AudioVisualizer — Web Audio API driven canvas visualizer.
 *
 * Pipeline (recording):  MediaStream → MediaStreamAudioSourceNode → AnalyserNode → (no output needed)
 * Pipeline (playback):   HTMLAudioElement → MediaElementAudioSourceNode → AnalyserNode → AudioDestinationNode
 *
 * Visual: a single flowing sine-wave line whose amplitude tracks RMS volume.
 * The line is always in subtle motion; silence gives a gentle breathing baseline.
 */

const LINE_COLOR  = "#3ea6ff";
const BG_COLOR    = "#0b0f17";
const WAVE_POINTS = 128;      // path resolution — higher = smoother curve
const FFT_SIZE    = 256;      // must be power of 2; 256 → 128 freq bins, low latency
const SMOOTHING   = 0.82;     // AnalyserNode built-in smoothing (0=none, 1=frozen)
const ATTACK      = 0.35;     // RMS smoothing attack — how fast amplitude rises
const RELEASE     = 0.055;    // RMS smoothing release — how slowly it falls back
const MIN_AMP     = 4;        // px — keeps the line alive even in silence

// WeakMap so we never create two MediaElementSource nodes for the same element.
const elementSourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

export class AudioVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioNode | null = null;
  private dataArray: Uint8Array = new Uint8Array(FFT_SIZE / 2);
  private rafId: number | null = null;
  private phase = 0;
  private smoothedRms = 0;
  private running = false;
  private resizeObserver: ResizeObserver;
  private dpr = window.devicePixelRatio || 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext("2d")!;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Request mic access internally and start live visualization. */
  async startMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.connectStream(stream);
  }

  /**
   * Visualize an existing MediaStream (e.g. the one already open for MediaRecorder).
   * Avoids asking for mic permission a second time.
   */
  connectStream(stream: MediaStream): void {
    this._stop();
    this._ensureAudioCtx();
    const source = this.audioCtx!.createMediaStreamSource(stream);
    this.sourceNode = source;
    source.connect(this.analyser!);
    // MediaStreamSource does NOT need to connect to destination — mic audio
    // is captured by MediaRecorder separately; we only need it for analysis.
    this._startLoop();
  }

  /**
   * Visualize audio from an <audio> element.
   * Routes element → analyser → destination so audio still plays out loud.
   * Safe to call multiple times on the same element (reuses existing source node).
   */
  connectAudioElement(el: HTMLAudioElement): void {
    this._stop();
    this._ensureAudioCtx();

    let source = elementSourceMap.get(el);
    if (!source) {
      source = this.audioCtx!.createMediaElementSource(el);
      elementSourceMap.set(el, source);
    }

    this.sourceNode = source;
    source.connect(this.analyser!);
    this.analyser!.connect(this.audioCtx!.destination);
    this._startLoop();
  }

  /** Pause the animation and disconnect from the audio graph. */
  stop(): void {
    this._stop();
    this._clearCanvas();
  }

  /** Full teardown — call when the component unmounts. */
  destroy(): void {
    this._stop();
    this.resizeObserver.disconnect();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _ensureAudioCtx(): void {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContext();
    }
    // Resume if suspended (browsers suspend on user-gesture requirement)
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  private _stop(): void {
    this.running = false;
    if (this.rafId != null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    // Disconnect source from analyser — leave the source node alive for reuse
    try { this.sourceNode?.disconnect(); } catch { /* already disconnected */ }
    try { this.analyser?.disconnect(); }  catch { /* already disconnected */ }
    this.sourceNode = null;
  }

  private _startLoop(): void {
    this.running = true;
    this.phase = 0;
    this.smoothedRms = 0;

    const tick = () => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      this._updateRms();
      this._draw();
      this.phase += 0.038; // wave drift speed
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private _updateRms(): void {
    if (!this.analyser) return;
    // Time-domain data: each byte is [0,255], 128 = silence
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const norm = (this.dataArray[i] - 128) / 128; // normalise to [-1, 1]
      sum += norm * norm;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    // Asymmetric smoothing: snap up fast, decay slow
    const alpha = rms > this.smoothedRms ? ATTACK : RELEASE;
    this.smoothedRms = this.smoothedRms + alpha * (rms - this.smoothedRms);
  }

  private _draw(): void {
    const canvas = this.canvas;
    const ctx    = this.ctx2d;
    const dpr    = this.dpr;
    const W      = canvas.width  / dpr;
    const H      = canvas.height / dpr;
    const cy     = H / 2;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // Amplitude: minimum breathing + RMS-driven peaks capped at 40% of height
    const amplitude = Math.min(MIN_AMP + this.smoothedRms * H * 1.8, H * 0.40);

    // Build the wave path
    ctx.beginPath();
    for (let i = 0; i <= WAVE_POINTS; i++) {
      const t = (i / WAVE_POINTS);
      const x = t * W;

      // Three overlapping harmonics at different speeds and frequencies.
      // Primary: slow, wide — dominant shape
      // Second:  slightly faster, half amplitude — adds organic variation
      // Third:   fastest, quarter amplitude — subtle texture
      const y = cy
        + Math.sin(t * Math.PI * 3    +  this.phase)         * amplitude
        + Math.sin(t * Math.PI * 5.3  + (this.phase * 1.4))  * amplitude * 0.35
        + Math.sin(t * Math.PI * 8.7  - (this.phase * 0.7))  * amplitude * 0.15;

      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    }

    // Outer glow — wide, low opacity
    ctx.save();
    ctx.shadowColor = LINE_COLOR;
    ctx.shadowBlur  = 18;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth   = 3;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.restore();

    // Mid glow
    ctx.save();
    ctx.shadowColor = LINE_COLOR;
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth   = 1.8;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.restore();

    // Bright core line
    ctx.save();
    ctx.shadowColor = "#a8d8ff";
    ctx.shadowBlur  = 3;
    ctx.strokeStyle = "#c8e8ff";
    ctx.lineWidth   = 1.2;
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();
  }

  private _clearCanvas(): void {
    const dpr = this.dpr;
    const W = this.canvas.width  / dpr;
    const H = this.canvas.height / dpr;
    this.ctx2d.fillStyle = BG_COLOR;
    this.ctx2d.fillRect(0, 0, W, H);
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.canvas.width  = rect.width  * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx2d.scale(this.dpr, this.dpr);
  }
}
