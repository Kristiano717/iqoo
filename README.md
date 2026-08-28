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
