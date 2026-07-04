---
name: vox-local-tts
description: Use Vox Studio as a local text-to-speech tool on macOS. Generate MP3/WAV speech from text through the local REST API, poll async jobs, and download completed audio.
---

# Vox Local TTS Skill

Use this skill when an agent needs to create speech audio on a Mac where Vox Studio is installed and running.

Vox runs locally by default:

```text
http://localhost:8000
```

## Safety And Assumptions

- Do not assume Vox is running. Check `/health` first.
- Do not upload user scripts or voice data to third-party services through this skill.
- Treat generated audio as local user data.
- Jobs are asynchronous. Submit text, poll the job, then download audio.
- If the server is not available, tell the user to start Vox from the menu bar helper.

## Check Server Health

```bash
curl -s http://localhost:8000/health
```

Expected healthy response includes:

```json
{
  "status": "ok",
  "model_state": "ready",
  "model_ready": true
}
```

If `model_ready` is false, wait and retry. First launch can take longer while the model loads.

## Generate Speech

Submit text to the local TTS endpoint:

```bash
curl -s -X POST http://localhost:8000/api/v1/tts \
  -F "text=Hello from a local AI agent." \
  -F "voice_name=noelmo-demo" \
  -F "preset=default"
```

The response includes a `request_id`. Keep that ID for polling.

## Poll Job Status

```bash
curl -s http://localhost:8000/api/v1/jobs/{request_id}
```

Wait until the job status is `completed`.

If status is `failed`, show the error message and request ID to the user.

## Download Audio

```bash
curl -L http://localhost:8000/api/v1/jobs/{request_id}/audio \
  --output voice.mp3
```

Use `.mp3` or `.wav` based on the requested output format.

## Discover Voice Profiles

```bash
curl -s http://localhost:8000/api/v1/voices
```

Use one of the returned voice profile names as `voice_name`.

## Recommended Agent Flow

1. Check `GET /health`.
2. If the model is not ready, wait and retry.
3. Fetch voices with `GET /api/v1/voices`.
4. Submit text with `POST /api/v1/tts`.
5. Poll `GET /api/v1/jobs/{request_id}`.
6. Download audio from `GET /api/v1/jobs/{request_id}/audio`.
7. Return the saved file path to the user.

## Local API Docs

When Vox is installed and running, open:

```text
http://localhost:8000/docs
```
