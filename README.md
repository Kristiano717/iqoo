# Second Coworker

**Your AI teammate that remembers every meeting, captures tasks in real time, and recalls past context exactly when you need it.**

Meeting tools give you a transcript. Nobody reads the transcript. Second Coworker
throws the prose away and keeps the *structure* — the decisions, the commitments,
the constraints — so that three weeks later, "what did we decide about pricing?"
has an answer instead of a search result.

Working prototype. The full loop runs end to end. Built for **iQOO Hackathon 2026**.

---

## The problem

Every meeting produces decisions. Almost none of them survive.

The current answer is transcription: Fireflies, Granola, Fathom, Otter, Limitless
all record the room and hand back a wall of text with a summary stapled to the
top. That's a better filing cabinet, not a better memory. The information is
technically present and practically unreachable — you'd have to know which
meeting to open before you can find what you forgot.

So the question that actually matters is never *"what was said?"* It's
**"what did we decide, and why?"** — asked weeks later, by someone who doesn't
remember which meeting to look in.

## The bet

**Store memory objects, not transcripts.**

When a session ends, one model call extracts the transcript into a fixed set of
categories — `Task`, `Decision`, `Preference`, `Requirement`, `Fact`,
`Action Item` — and those objects are what get persisted. Recall then answers
from the structured objects, never by re-reading raw text.

|  | Transcript tools | Second Coworker |
|---|---|---|
| What's stored | Raw text + a summary | Structured memory statements |
| Retrieval | Search the meeting you already remembered | Ask a question across all meetings |
| Answer to "why did we drop X?" | A timestamp to go read | The decision, and the meeting it came from |
| Grows more useful over time | Archive grows | Memory grows |

The categories are deliberately fixed and small. An open-ended "extract what
seems important" prompt collapses back into summarization — which is the thing
that already doesn't work.

## How it works

```mermaid
flowchart LR
  A[Your mic] -->|Gemini Live| B[Live transcript<br/>speaker-labelled]
  A2[Their audio - shared tab] -->|Gemini Live| B
  B -->|regex, client-side| C[Wake phrase - task tray]
  B -->|once, at session end| D[LLM extraction]
  D -->|summary + tasks + facts| E[(Supabase)]
  E -->|newest 10 sessions| F[Recall - answers from stored memory only]
```

1. **Start a session.** Speech renders live in the browser — no server round-trip.
2. **Say a wake phrase.** *"Hey Coworker, remind me to send the deck"* → the task
   appears in the tray instantly. This is a regex on the transcript stream, not a
   second model running continuously.
3. **End the session.** The transcript goes to the LLM **once** and comes back as
   strict JSON: `{summary, tasks, facts}`.
4. **Ask later.** *"What did I decide in yesterday's meeting?"* → the backend
   retrieves past sessions by recency and the model answers **only** from that
   retrieved context. If the answer isn't there, it says so instead of guessing.

Two design choices worth calling out, because they're the ones people ask about:

- **Extraction runs once, at the end** — not every few seconds. Continuous
  extraction burns tokens to produce worse structure, because the model can't see
  where the conversation landed until it lands.
- **Retrieval is by recency, not embeddings.** At the scale where a memory layer
  has to *earn* trust, a vector index adds a failure mode (silently retrieving
  the wrong thing) without adding an answer. It's a roadmap item, not a v1.

## What's actually built

Honest status, because a demo that overclaims is worse than a small one that doesn't.

| | |
|---|---|
| Live transcription, both sides | ⚠️ Built and building clean; needs a real two-party call to confirm |
| Wake-phrase → task tray | ✅ Verified, handles phrases split across pauses |
| End-of-session extraction | ✅ Verified against live Gemini |
| Supabase persistence | ✅ Verified |
| Cross-session recall | ✅ Verified, including date-relative questions |
| Installable from the browser (PWA) | ✅ Manifest, icons and service worker in place |
| Speaker attribution (you / them) | ✅ Two separate streams, no diarization model |
| Session review screen | ❌ Roadmap — recall works, but you can't browse one meeting on its own |
| Auth / multi-user | ❌ Out of scope — single-user prototype, RLS off |

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Four screens, state-based switching — no router needed |
| Transcription | `gemini-3.5-transcribe-live` | Realtime, free tier, and accepts a raw stream — which is what makes capturing the other participant possible |
| Backend | FastAPI | Five routes; `/docs` gives a live API explorer |
| AI | `gemini-3.6-flash`, `temperature: 0` | Structured output via `response_schema` enforces the JSON contract |
| Database | Supabase | Postgres without running Postgres |

The provider is chosen at runtime by which key is in `.env` (`GEMINI_API_KEY` vs
`OPENAI_API_KEY`), and the prompts live in [`prompts/`](prompts/) as files rather
than string literals — so swapping models is a one-file change and the
`{summary, tasks, facts}` contract holds either way.

Temperature is pinned to `0` everywhere. A demo that answers differently on the
second run isn't a demo.

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** is the system design: the two
audio paths, why audio bypasses the backend, how echo and session expiry are
handled, and the request lifecycle for every route.

```
backend/     FastAPI app, Supabase client, LLM calls, demo seeder
docs/        system design
frontend/    React + Vite, four screens, PWA manifest
database/    schema.sql
prompts/     extraction + recall prompts
```

---

## Quickstart

Requires **Node 18+**, **Python 3.11+**, and desktop **Chrome or Edge** —
capturing another tab's audio needs `getDisplayMedia` with audio, which Firefox
and Safari don't support.

**1. Backend**

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Copy `.env.example` to `.env`:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_KEY` | same page → `anon` `public` key |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (free tier) |

Set **only one** AI key — the backend refuses to run a call if both are present.

**2. Database**

Run [`database/schema.sql`](database/schema.sql) in the Supabase SQL editor.
It's idempotent. RLS is intentionally off: there's no auth in this prototype, and
enabling it without policies denies every insert.

**3. Frontend**

```bash
cd frontend && npm install
```

**4. Run** — two terminals:

```bash
cd backend && venv\Scripts\activate && uvicorn main:app --reload
cd frontend && npm run dev
```

Open **http://localhost:5175** in Chrome and accept the microphone prompt.
The backend is reached through Vite's `/api` proxy, so you don't open port 8000
directly.

**Before a demo,** seed a backdated session so "yesterday" has something real to
find — otherwise every session is timestamped today and the answer is vague:

```bash
cd backend && python seed_demo.py --reset
```

---

## Deploying

The app installs to a phone or desktop home screen as a PWA, and once deployed it
works without anything running locally.

The key idea: **the frontend always calls `/api/...` same-origin.** In development
Vite proxies that to `localhost:8000`; in production Vercel rewrites it to the
hosted backend. The frontend never learns the backend's real URL, so there is no
CORS configuration and no build-time API variable to get wrong.

**1. Backend → Render**

[`render.yaml`](render.yaml) is a blueprint: point Render at this repo and it
picks up the build and start commands. Set `SUPABASE_URL`, `SUPABASE_KEY` and
`GEMINI_API_KEY` in the dashboard — they're marked `sync: false` so they're never
read from the repo.

Note the free plan sleeps after inactivity and takes **~50s to wake**. Hit the
URL once before any demo.

**2. Frontend → Vercel**

Set the project's **Root Directory** to `frontend`. Vercel auto-detects Vite.

Then edit [`frontend/vercel.json`](frontend/vercel.json) and replace
`REPLACE-ME.onrender.com` with the Render URL from step 1. That single rewrite is
the whole integration.

**3. Install it**

Open the Vercel URL in Chrome → **⋮ → Add to Home Screen**. It should say
**Install**, not "Add shortcut" — a shortcut means the manifest wasn't accepted
and you'll get a browser tab instead of an app.

> **Deploying makes the data public.** There's no auth, and RLS is off, so anyone
> with the URL can create sessions and read every stored memory. That's fine for
> a demo with demo data. Don't put a real meeting through the hosted version.

## Gotchas worth knowing

Each of these cost us real hours.

**`uvicorn --reload` silently serves stale code.** The reloader spawns a child
worker; killing only the PID uvicorn printed leaves that worker orphaned and still
bound to the port, serving old code — and Windows keeps attributing the socket to
the dead parent, so it looks like a phantom listener. Kill by name:

```bash
taskkill /IM python3.11.exe /F   # note: python3.11.exe in this venv, not python.exe
```

**Android Chrome ignores `continuous`** and ends recognition after every
utterance. `useSpeechTranscript` restarts it on `end` with a short delay —
restarting synchronously races the teardown, throws `InvalidStateError`, and the
transcript dies after one sentence.

**The other participant needs their tab shared.** Their audio reaches you through
your speakers, not your microphone, so the app asks you to share the meeting tab
**with "Also share tab audio" ticked**. Sharing without it silently succeeds and
captures only your side — the app detects this and says so.

**Both-sides capture is desktop-only.** `getDisplayMedia` audio doesn't exist on
Android, so on a phone the app records your microphone alone.

**Speech needs a secure context.** `localhost` and `https://` work;
`http://192.168.x.x` is refused outright by the browser.

## Roadmap

Deliberately *not* built yet — the prototype is one complete loop, not many
incomplete features.

- **Session review** — open any past meeting on its own, see what came out of it,
  and move around by date rather than only asking questions
- **Capture the other side of a call** — `getDisplayMedia` tab audio, which also
  yields a rough "them vs me" split without a diarization model
- **Memory Graph** — link decisions to the requirements and people they touch
- **Contradiction detection** across meetings ("this reverses what you decided in March")
- **Typed memory columns** — the six categories drive extraction today but are
  flattened into a string array in storage

## License

MIT — see [LICENSE](LICENSE).

---

<sub>[`CLAUDE.md`](CLAUDE.md) is the locked scope for this prototype and takes
precedence over this README.</sub>
