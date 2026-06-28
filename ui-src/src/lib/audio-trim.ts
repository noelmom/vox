export type TrimRange = {
  start: number;
  end: number;
};

export const DEFAULT_MAX_VOICE_CLIP_DURATION_S = 120;
export const MIN_TRIM_GAP_S = 0.05;
export const TRIM_DURATION_TOLERANCE_S = 0.25;

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function audioBufferDuration(buffer: AudioBuffer): number {
  return buffer.length / buffer.sampleRate;
}

export function buildPeaks(buffer: AudioBuffer, bucketCount = 240): number[] {
  const channel = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(channel.length / bucketCount));
  const raw: number[] = [];
  for (let i = 0; i < bucketCount; i++) {
    let sum = 0;
    const start = i * size;
    const end = Math.min(channel.length, start + size);
    const span = Math.max(1, end - start);
    for (let j = start; j < end; j++) sum += channel[j] * channel[j];
    raw.push(Math.sqrt(sum / span));
  }
  const max = Math.max(...raw, 0.001);
  return raw.map((p) => p / max);
}

export function clampTrimRange(range: TrimRange, duration: number): TrimRange {
  const start = Math.max(0, Math.min(range.start, duration));
  const end = Math.max(start + MIN_TRIM_GAP_S, Math.min(range.end, duration));
  return {
    start,
    end: Math.max(start + MIN_TRIM_GAP_S, end),
  };
}

export function fullTrimRange(duration: number): TrimRange {
  return { start: 0, end: duration };
}

export function isFullTrimRange(range: TrimRange, duration: number, epsilon = 0.02): boolean {
  return Math.abs(range.start) <= epsilon && Math.abs(range.end - duration) <= epsilon;
}

export function trimmedDuration(range: TrimRange): number {
  return Math.max(0, range.end - range.start);
}

export function isTrimDurationWithinLimit(duration: number, maxDurationSeconds: number): boolean {
  return duration <= maxDurationSeconds + TRIM_DURATION_TOLERANCE_S;
}

export function trimLimitMessage(duration: number, maxDurationSeconds: number): string | null {
  if (isTrimDurationWithinLimit(duration, maxDurationSeconds)) return null;
  return `Selection is ${formatDuration(duration)}. Trim it to ${formatDuration(maxDurationSeconds)} or less to save.`;
}

export function clampTrimRangeToMaxDuration(range: TrimRange, maxDurationSeconds: number): TrimRange {
  const duration = trimmedDuration(range);
  if (duration <= maxDurationSeconds) return range;
  return {
    start: range.start,
    end: range.start + maxDurationSeconds,
  };
}

export function formatDuration(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function sliceAudioBuffer(buffer: AudioBuffer, startSeconds: number, endSeconds: number): AudioBuffer {
  const start = Math.max(0, Math.min(startSeconds, audioBufferDuration(buffer)));
  const end = Math.max(start, Math.min(endSeconds, audioBufferDuration(buffer)));
  const startFrame = Math.floor(start * buffer.sampleRate);
  const endFrame = Math.max(startFrame + 1, Math.ceil(end * buffer.sampleRate));
  const length = Math.max(1, endFrame - startFrame);
  const sliced = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch).subarray(startFrame, endFrame);
    sliced.copyToChannel(data, ch, 0);
  }
  return sliced;
}

export function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferBytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bufferBytes);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([bufferBytes], { type: "audio/wav" });
}

export async function exportTrimmedWavBlob(source: Blob, range: TrimRange): Promise<Blob> {
  const buffer = await decodeAudioBlob(source);
  const sliced = sliceAudioBuffer(buffer, range.start, range.end);
  return encodeWavFromAudioBuffer(sliced);
}
