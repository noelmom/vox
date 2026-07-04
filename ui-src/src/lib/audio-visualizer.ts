/**
 * Bar-based RMS history visualizer.
 *
 * Every BAR_INTERVAL_MS the current RMS is sampled and appended as a new bar.
 * Bars fill left-to-right; once the canvas is full, old bars drop off the left.
 * The result is the classic "bars grow as you speak/play" pattern.
 *
 * Recording pipeline:  MediaStream → MediaStreamAudioSourceNode → AnalyserNode
 * Playback pipeline:   HTMLAudioElement → MediaElementAudioSourceNode → AnalyserNode → destination
 */

const BAR_COLOR      = "rgba(255, 255, 255, 0.72)";
const BAR_WIDTH      = 3;   // px
const BAR_GAP        = 2;   // px between bars
const BAR_INTERVAL   = 55;  // ms between bar samples (~18 bars/sec)
const MIN_BAR_H      = 2;   // px — always visible, even in silence
const FFT_SIZE       = 256;
const SMOOTHING      = 0.75;

const elementSourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

export class AudioVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> = new Uint8Array(FFT_SIZE / 2);
  private bars: number[] = [];          // normalised RMS values [0..1]
  private staticBars: number[] | null = null; // decoded full-clip peaks
  private rafId: number | null = null;
  private lastBarTime = 0;
  private running = false;
  private dpr = window.devicePixelRatio || 1;
  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async startMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.connectStream(stream);
  }

  connectStream(stream: MediaStream): void {
    this._reset();
    this._ensureCtx();
    const source = this.audioCtx!.createMediaStreamSource(stream);
    this.sourceNode = source;
    source.connect(this.analyser!);
    this._startLoop();
  }

  connectAudioElement(el: HTMLAudioElement): void {
    this._reset();
    this._ensureCtx();
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

  /** Freeze — stop animating but keep the bars on screen. */
  stop(): void {
    this._stopLoop();
  }

  /**
   * Render a pre-decoded full-clip waveform spread across the full canvas width.
   * Pass normalised peak values [0..1] — one per bar bucket.
   * Call after recording/upload is complete so the user sees the whole clip at once.
   */
  setStaticBars(peaks: number[]): void {
    this._stopLoop();
    this.staticBars = peaks;
    this._drawStatic();
  }

  /** Full teardown for unmount. */
  destroy(): void {
    this._stopLoop();
    this.resizeObserver.disconnect();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
    this.bars = [];
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _ensureCtx(): void {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  private _reset(): void {
    this._stopLoop();
    this.bars = [];
    this.staticBars = null;
  }

  private _stopLoop(): void {
    this.running = false;
    if (this.rafId != null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    try { this.sourceNode?.disconnect(); } catch { /* ok */ }
    try { this.analyser?.disconnect(); }  catch { /* ok */ }
    this.sourceNode = null;
  }

  private _startLoop(): void {
    this.running = true;
    this.lastBarTime = performance.now();

    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);

      // Sample a new bar on interval
      if (now - this.lastBarTime >= BAR_INTERVAL) {
        this.lastBarTime = now;
        this.bars.push(this._rms());

        // Trim bars that no longer fit
        const maxBars = this._maxBars();
        if (this.bars.length > maxBars) {
          this.bars = this.bars.slice(this.bars.length - maxBars);
        }
      }

      this._draw();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private _rms(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const n = (this.dataArray[i] - 128) / 128;
      sum += n * n;
    }
    return Math.sqrt(sum / this.dataArray.length);
  }

  private _maxBars(): number {
    const W = this.canvas.width / this.dpr;
    return Math.floor(W / (BAR_WIDTH + BAR_GAP));
  }

  private _draw(): void {
    const { canvas, ctx, dpr } = this;
    const W  = canvas.width  / dpr;
    const H  = canvas.height / dpr;
    const cy = H / 2;

    // Clear
    ctx.clearRect(0, 0, W, H);

    if (this.bars.length === 0) return;

    ctx.fillStyle = BAR_COLOR;

    const maxBars = this._maxBars();
    // Pad left with empty space if bars haven't filled the canvas yet
    const startX = Math.max(0, (maxBars - this.bars.length)) * (BAR_WIDTH + BAR_GAP);

    for (let i = 0; i < this.bars.length; i++) {
      const amp = this.bars[i];
      const h   = Math.max(MIN_BAR_H, amp * H * 0.9);
      const x   = startX + i * (BAR_WIDTH + BAR_GAP);
      ctx.fillRect(x, cy - h / 2, BAR_WIDTH, h);
    }
  }

  private _drawStatic(): void {
    const { canvas, ctx, dpr } = this;
    const W  = canvas.width  / dpr;
    const H  = canvas.height / dpr;
    const cy = H / 2;
    const peaks = this.staticBars!;

    ctx.clearRect(0, 0, W, H);
    if (!peaks.length) return;

    // Spread bars to fill the full width
    const totalGap = (peaks.length - 1) * BAR_GAP;
    const barW = Math.max(1, (W - totalGap) / peaks.length);

    ctx.fillStyle = BAR_COLOR;
    for (let i = 0; i < peaks.length; i++) {
      const h = Math.max(MIN_BAR_H, peaks[i] * H * 0.9);
      const x = i * (barW + BAR_GAP);
      ctx.fillRect(x, cy - h / 2, barW, h);
    }
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.canvas.width  = rect.width  * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    // Redraw static frame after resize clears the canvas
    if (this.staticBars && !this.running) this._drawStatic();
  }
}
