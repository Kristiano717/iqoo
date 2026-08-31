# Second Coworker

Your AI teammate that remembers every meeting, captures tasks in real time, and
recalls past context exactly when you need it.

Prototype. See [CLAUDE.md](CLAUDE.md) for the locked scope — it's the source of
truth, and this README only covers how to run what's there.

## What works today

The full loop, end to end:

1. Start a session → live transcript renders (Web Speech API, in-browser)
2. Say *"Hey Coworker, remind me to…"* → task appears in the tray instantly
3. End the session → transcript + tasks saved to Supabase
4. One LLM call extracts `{summary, tasks, facts}` → shown and stored
5. Later, ask *"What did I decide in yesterday's meeting?"* → answered from
   stored summaries only

## Setup

Requires Node 18+, Python 3.11+, and a Chromium browser (Chrome or Edge — the
Web Speech API doesn't exist in Firefox/Safari).

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_KEY` | same page → `anon` `public` key |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free tier) |

Set **only one** AI key. The backend picks its provider by which one is
present, and refuses to start a call if both are set (see `ai.py`).

### 2. Database

In Supabase → SQL Editor, run [database/schema.sql](database/schema.sql). It's
idempotent, so it's safe to re-run.

RLS is intentionally **off** — there's no auth in this prototype, and enabling
it without policies would deny every insert.

### 3. Frontend

```bash
cd frontend
npm install
```

## Running

Two terminals:

```bash
# terminal 1
cd backend && venv\Scripts\activate && uvicorn main:app --reload

# terminal 2
cd frontend && npm run dev
```

- Frontend: http://localhost:5175 (pinned in `vite.config.js`)
- Backend: http://localhost:8000 — `/docs` gives an interactive API explorer

Open the frontend in Chrome/Edge and accept the microphone prompt.

### Before a demo

Seed a backdated session so the "yesterday" recall question has something real
to find — without this, every session is timestamped today and the answer is
vague:

```bash
cd backend && python seed_demo.py --reset
```

## Running it on a phone

The app is a PWA, so the phone runs the same code the laptop does — there's no
separate mobile build. Two things have to be true, and both come from the
browser, not from us:

- **It must be served over HTTPS.** `getUserMedia` and the Web Speech API are
  restricted to secure contexts, so `http://192.168.x.x:5175` over the LAN is
  refused outright. Only `localhost` gets an exemption, and on the phone
  `localhost` is the phone.
- **The API must be same-origin.** That's why `src/api.js` calls `/api/...` and
  `vite.config.js` proxies it to FastAPI — one tunnel covers both servers, and
  an HTTPS page never has to call a plain-HTTP backend.

### 1. Start both servers as usual

```bash
cd backend && venv\Scripts\activate && uvicorn main:app --reload
cd frontend && npm run dev
```

### 2. Expose the frontend over HTTPS

`cloudflared` gives a throwaway HTTPS URL with no account and no signup:

```bash
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:5175
```

It prints a `https://<random-words>.trycloudflare.com` URL. Tunnel hostnames
are already in `server.allowedHosts` in `vite.config.js` — without that, Vite
5.4.12+ answers every tunnel request with "Blocked request".

Only tunnel the *frontend*. The backend is reached through the proxy, so
exposing port 8000 separately isn't needed and would reintroduce CORS.

### 3. Install it on the phone

Open the tunnel URL in Chrome on the phone → **⋮ → Add to Home Screen** →
**Install**.

If the dialog says "Add shortcut" rather than "Install", Chrome hasn't accepted
the manifest — the app will still run, but only as a browser tab, and Android
can't float a browser tab. Check `chrome://inspect` or DevTools → Application →
Manifest against `public/manifest.webmanifest`.

### 4. Float it

Installing produces a WebAPK — a real installed Android app, not a bookmark —
which is what Funtouch OS / OriginOS's floating-window switcher can pick up:
swipe in from a bottom corner to open the multi-window sidebar, then drag
**Coworker** out as a floating window. (Untested on the target device; if the
sidebar won't take it, split-screen from Recents is the fallback and reads
almost as well on video.)

### 5. Record

The built-in screen recorder in Quick Settings is the cleanest capture.

**Test the audio source before the real take.** Android generally grants the
microphone to one app at a time, so a screen recorder set to record mic audio
can starve Chrome's capture — the video has your voice but the transcript never
moves. If that happens, either set the recorder to mute/media only and narrate
in the edit, or film the phone with a second camera, which for a phone-first
hackathon looks more convincing anyway.

Seed the backdated session first, or the "yesterday" question has nothing to
find:

```bash
cd backend && python seed_demo.py --reset
```

### Known risks on Android

- **Chrome ignores `continuous` on Android** and ends recognition after every
  utterance. `useSpeechTranscript` restarts it automatically on `end`, with a
  short delay — restarting synchronously races the teardown and throws, which
  would kill the transcript after one sentence. Long pauses may still drop a
  word at the seam.
- **The tunnel URL changes on every `cloudflared` restart**, and reinstalling
  the PWA against a new origin gives you a second icon. Leave the tunnel
  running for the whole session.
- **Gemini's free tier is 20 requests/day.** Each end-of-session summary and
  each recall question is one. Rehearse the speech parts with the AI steps
  skipped.

## Transcription engines

Home has an engine picker:

- **Cloud (Web Speech)** — the default and the verified path. Word-by-word,
  near-instant, but sends audio to Google and needs a network.
- **On-device (Whisper)** — Silero VAD segments speech, Whisper transcribes
  each utterance in a worker. Nothing leaves the device, ~2s after each
  pause, no interim text. Still experimental: its browser-side init is not
  yet confirmed working. First run downloads ~152MB of model.

`frontend/public/ort/` holds the onnxruntime wasm the Whisper path needs.
It is **gitignored** (~40MB, reproducible) and regenerated automatically on
`npm install`, `npm run dev` and `npm run build` by
`frontend/scripts/copy-ort-assets.mjs`. If Whisper reports "no available
backend found", run that script.

## Gotchas worth knowing

**`uvicorn --reload` silently serves stale code.** It bit us repeatedly. The
reloader spawns a child worker; killing only the PID uvicorn printed leaves
that worker orphaned and still bound to the port, happily serving old code —
and Windows keeps attributing the socket to the dead parent, so it looks like a
phantom listener. If a backend change isn't taking effect, kill the workers by
name and restart:

```bash
# Windows — note the process is python3.11.exe in this venv, not python.exe
taskkill /IM python3.11.exe /F
```

**Web Speech API captures your microphone only.** In a video call, other
participants' audio goes to your speakers, not your mic, so only your own
speech is transcribed. Capturing system audio needs WASAPI/CoreAudio, which is
a roadmap item, not part of this prototype.

**Chrome/Edge only.** No Web Speech API in Firefox or Safari.

## Layout

```
backend/     FastAPI app, Supabase client, LLM calls, demo seeder
frontend/    React + Vite, four screens
database/    schema.sql
prompts/     extraction + recall prompts (kept in files so swapping
             LLM providers doesn't change the contract)
```
