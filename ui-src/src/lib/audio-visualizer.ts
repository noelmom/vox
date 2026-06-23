const LINE_COLOR  = "#3ea6ff";
const BG_COLOR    = "#0b0f17";
const WAVE_POINTS = 200;
const FFT_SIZE    = 256;
const SMOOTHING   = 0.85;
const ATTACK      = 0.30;
const RELEASE     = 0.04;
const MIN_AMP     = 3;     // px — baseline so the line is never flat

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

  async startMicrophone(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.connectStream(stream);
  }

  connectStream(stream: MediaStream): void {
    this._stop();
    this._ensureAudioCtx();
    const source = this.audioCtx!.createMediaStreamSource(stream);
    this.sourceNode = source;
    source.connect(this.analyser!);
    this._startLoop();
  }

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

  stop(): void {
    this._stop();
    this._clearCanvas();
  }

  destroy(): void {
    this._stop();
    this.resizeObserver.disconnect();
    this.audioCtx?.close();
    this.audioCtx = null;
    this.analyser = null;
  }

  private _ensureAudioCtx(): void {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") this.audioCtx.resume();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  private _stop(): void {
    this.running = false;
    if (this.rafId != null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
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
      this.phase += 0.022; // slow horizontal drift
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private _updateRms(): void {
    if (!this.analyser) return;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const norm = (this.dataArray[i] - 128) / 128;
      sum += norm * norm;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    const alpha = rms > this.smoothedRms ? ATTACK : RELEASE;
    this.smoothedRms = this.smoothedRms + alpha * (rms - this.smoothedRms);
  }

  private _draw(): void {
    const { canvas, ctx2d: ctx, dpr } = this;
    const W  = canvas.width  / dpr;
    const H  = canvas.height / dpr;
    const cy = H / 2;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // RMS drives amplitude; MIN_AMP keeps it alive at silence
    const amp = Math.min(MIN_AMP + this.smoothedRms * H * 2.2, H * 0.42);

    // Single clean sine — 1.5 cycles across the canvas
    ctx.beginPath();
    for (let i = 0; i <= WAVE_POINTS; i++) {
      const t = i / WAVE_POINTS;
      const x = t * W;
      const y = cy + Math.sin(t * Math.PI * 3 + this.phase) * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }

    // Outer glow
    ctx.save();
    ctx.shadowColor = LINE_COLOR;
    ctx.shadowBlur  = 20;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth   = 3;
    ctx.globalAlpha = 0.15;
    ctx.stroke();
    ctx.restore();

    // Mid glow
    ctx.save();
    ctx.shadowColor = LINE_COLOR;
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.restore();

    // Bright core
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
    const { canvas, ctx2d: ctx, dpr } = this;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
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
