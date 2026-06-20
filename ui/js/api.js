/* Vox API client — thin wrappers around fetch */

const BASE = '';  // same origin

export async function healthCheck() {
  const r = await fetch(`${BASE}/health`);
  return r.json();
}

export async function listVoices() {
  const r = await fetch(`${BASE}/voices`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getVoice(name) {
  const r = await fetch(`${BASE}/voices/${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadVoice(formData) {
  const r = await fetch(`${BASE}/voices`, { method: 'POST', body: formData });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || r.statusText);
  }
  return r.json();
}

/**
 * Same as uploadVoice but fires onProgress({ percent, bytesLoaded, bytesTotal, speedBps, etaSec })
 * while the upload is in flight. Uses XHR so the browser can report real byte counts.
 */
export function uploadVoiceWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    xhr.upload.addEventListener('progress', e => {
      if (!e.lengthComputable) return;
      const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
      const speedBps   = e.loaded / elapsedSec;
      const etaSec     = speedBps > 0 ? (e.total - e.loaded) / speedBps : null;
      onProgress({
        percent:     Math.round((e.loaded / e.total) * 100),
        bytesLoaded: e.loaded,
        bytesTotal:  e.total,
        speedBps,
        etaSec,
      });
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid server response')); }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).detail || xhr.statusText)); }
        catch { reject(new Error(xhr.statusText)); }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed — network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', `${BASE}/voices`);
    xhr.send(formData);
  });
}

export async function patchVoice(name, { description, tags, exaggeration, cfg_weight, temperature, repetition_penalty, top_p, min_p } = {}) {
  const fd = new FormData();
  if (description  != null) fd.append('description', description);
  if (tags         != null) fd.append('tags', tags.join(','));
  if (exaggeration != null) fd.append('exaggeration', exaggeration);
  if (cfg_weight   != null) fd.append('cfg_weight', cfg_weight);
  if (temperature  != null) fd.append('temperature', temperature);
  if (repetition_penalty != null) fd.append('repetition_penalty', repetition_penalty);
  if (top_p        != null) fd.append('top_p', top_p);
  if (min_p        != null) fd.append('min_p', min_p);
  const r = await fetch(`${BASE}/voices/${encodeURIComponent(name)}`, { method: 'PATCH', body: fd });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || r.statusText);
  }
  return r.json();
}

export async function deleteVoice(name) {
  const r = await fetch(`${BASE}/voices/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}

export async function listJobs({ limit = 50, offset = 0, status, voice_id } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (status)   params.set('status', status);
  if (voice_id) params.set('voice_id', voice_id);
  const r = await fetch(`${BASE}/jobs?${params}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listPresets() {
  const r = await fetch(`${BASE}/presets`);
  return r.json();
}

/**
 * Generate TTS audio. Returns { blob, headers } where blob is the audio file
 * and headers is an object with all X-* timing/tracing headers.
 */
export async function generateTTS({ text, preset = 'default', voice_name, output_format = 'mp3',
  max_chars, temperature, exaggeration, cfg_weight, repetition_penalty, top_p, min_p } = {}) {

  const fd = new FormData();
  fd.append('text', text);
  fd.append('preset', preset);
  fd.append('output_format', output_format);
  if (voice_name)         fd.append('voice_name', voice_name);
  if (max_chars != null)  fd.append('max_chars', max_chars);
  if (temperature != null)        fd.append('temperature', temperature);
  if (exaggeration != null)       fd.append('exaggeration', exaggeration);
  if (cfg_weight != null)         fd.append('cfg_weight', cfg_weight);
  if (repetition_penalty != null) fd.append('repetition_penalty', repetition_penalty);
  if (top_p != null)              fd.append('top_p', top_p);
  if (min_p != null)              fd.append('min_p', min_p);

  const r = await fetch(`${BASE}/tts`, { method: 'POST', body: fd });

  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || r.statusText);
  }

  const headers = {};
  for (const [k, v] of r.headers.entries()) {
    if (k.toLowerCase().startsWith('x-')) headers[k] = v;
  }

  const blob = await r.blob();
  return { blob, headers };
}
