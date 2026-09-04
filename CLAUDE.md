# Second Coworker — Project Context for Claude Code

This file is the source of truth for this repo. Read it fully before writing any code. Treat it the way you'd treat a locked spec, not a suggestion — if a request conflicts with something below, flag the conflict instead of silently expanding scope.

## Identity

**Project:** Second Coworker
**Tagline:** Your AI teammate that remembers every meeting, captures tasks in real time, and recalls past context exactly when you need it.
**Stage:** Prototype (not the final product). Submission deadline: before September 1, 2026.
**Team:** 2 developers, remote, pairing via VS Code Live Share + GitHub. Both people touch every layer — no hard frontend/backend split.

## Product Differentiator (don't lose this while building)

This is not a transcription tool. Competitors (Fireflies, Granola, Fathom, Otter, Limitless, Rewind) already do live transcription and summaries — that's not the bet. The bet is **structured persistent memory**: instead of storing raw transcript text and searching it later, extract memory objects into fixed categories (Task, Decision, Preference, Requirement, Fact, Action Item) and answer recall questions from those structured objects, not from re-reading the whole transcript. Keep this in mind when writing the extraction/summary prompt — don't let it collapse into "just summarize the text."

## The One Loop (this is the entire prototype — nothing more)

1. User starts a session.
2. User speaks → live transcript renders. Both sides of a call are captured: the
   microphone, and the other participant via the shared meeting tab.
3. User says a wake phrase ("Hey Coworker, remind me to...") → a task is created and appears in the task tray immediately.
4. User ends the session.
5. Backend sends the full transcript once to the LLM, gets back structured JSON (`summary`, `tasks`, `facts`).
6. Everything is stored in Supabase.
7. In a later session, user asks something like "What did I decide yesterday?" → backend retrieves past session summaries and asks the LLM to answer using only that retrieved context.

If that loop works reliably end-to-end, the prototype is done. Do not add anything beyond it without the user explicitly asking.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React |
| Audio / live transcript | **`gemini-3.5-transcribe-live`** over a WebSocket, straight from the browser. Web Speech API is kept as a fallback. |
| Backend | FastAPI |
| AI | **GPT-5 is the locked default.** For local dev/testing without API cost, the user may swap in the **Gemini API free tier** (`gemini-2.0-flash` or `gemini-2.5-flash`) using its `response_schema` structured-output mode to enforce the same `{summary, tasks, facts}` JSON contract. If you're not sure which is currently wired up, check `backend/.env` for which API key is set (`OPENAI_API_KEY` vs `GEMINI_API_KEY`) rather than assuming. Keep the prompt/response contract identical either way so swapping providers is a one-file change. |
| Database | Supabase |
| Deployment | Frontend on Vercel (static Vite build), backend on Render. `/api/*` is rewritten to the backend so every call is same-origin. |

Do not introduce a different framework, database, or AI provider than what's above without the user explicitly asking for it.

> **Deviations from the original locked stack**, all with explicit sign-off.
> Recorded here rather than silently rewritten, so the reasoning survives:
>
> - **Transcription moved from Web Speech to `gemini-3.5-transcribe-live`.**
>   The Web Speech API only ever listens to the default microphone and accepts
>   no audio stream, so the other participant on a call — whose voice comes out
>   of the speakers — could never be captured. That made half of every meeting
>   unrecordable. It also does its own internal mic capture, which meant we
>   could not set `echoCancellation` and therefore could not solve echo at the
>   source. Web Speech is retained as a fallback for when the live engine can't
>   start at all, so a rate limit doesn't cost the whole meeting.
>
> - **The Gemini model names in the AI row are stale.** `gemini-2.0-flash` and
>   `gemini-2.5-flash` are both retired for new API keys (the API 404s). The
>   build uses `gemini-3.6-flash`, verified against the live API with this exact
>   `{summary, tasks, facts}` schema. See the note at the top of `backend/ai.py`.
>
> - **Deployment is no longer local-only.** The app is a PWA meant to be
>   installed from a home screen, which requires it to work without a laptop
>   running. This does mean the hosted instance is public and unauthenticated —
>   see the warning in README.md. Demo data only.

## Folder Structure

```
second-coworker/
  frontend/
  backend/
  database/
  docs/
  prompts/
  CLAUDE.md
```

Keep responsibilities separated. Don't create new top-level folders without a reason.

## Database Schema (nothing beyond this until something needs it)

**sessions**

| Field | Type |
|---|---|
| id | UUID |
| transcript | text |
| summary | text |
| facts | jsonb (array of strings) |
| timestamp | datetime |

> `facts` was added during Milestone 4 with explicit sign-off — it wasn't in
> the original locked schema. The extraction call returns a `facts` array,
> and the only alternative was flattening it into the `summary` prose, which
> throws away exactly the structure this product is betting on. Recall reads
> both `summary` and `facts`.

**tasks**

| Field | Type |
|---|---|
| id | UUID |
| session_id | UUID |
| text | text |
| timestamp | datetime |

**Allowed memory categories** when extracting from transcript (don't invent new ones): `Task`, `Decision`, `Preference`, `Requirement`, `Fact`, `Action Item`.

## AI Behavior Rules

**During the meeting**, only two things run live:
1. Continuous live transcription.
2. Wake-phrase detection on the transcript stream (simple string/regex match — this is NOT a second LLM call running continuously). It scans the **microphone stream only**: "Hey Coworker" is an instruction from the user, so the other participant can't put tasks in your tray.

Nothing else runs continuously. No per-sentence AI calls, no background extraction loop.

**After the meeting ends**, send the transcript once to the LLM with a prompt that returns exactly:

```json
{
  "summary": "...",
  "tasks": ["..."],
  "facts": ["..."]
}
```

Store the result. Don't add extra fields the schema doesn't have a place for.

**Memory recall**: retrieve relevant past `sessions` rows (by recency/date — no vector search, no embeddings), pass their summaries as context, and ask the LLM to answer using only that retrieved context. If the answer isn't in the retrieved context, say so rather than guessing.

## UI (five screens, no more)

1. **Home** — Start Session.
2. **Live Session** — live transcript, task tray, session controls.
3. **Summary Screen** — summary, tasks, key facts.
4. **Recall Screen** — user asks a question, assistant answers from stored memory.
5. **Review Screen** — browse past sessions and open one on its own.

> **Deviation, signed off.** The spec said four screens. Review was added
> because recall could answer questions across meetings but nothing could
> open a single one — the stored summaries, facts and tasks were only ever
> reachable through a question. It reads existing rows and adds no capture,
> no schema and no AI call.

## In Scope

- Live transcription
- Wake-phrase task detection
- Task tray
- End-of-session AI summary
- Cross-session memory recall
- Simple web interface (the five screens above)
- Supabase storage
- FastAPI backend
- React frontend

## Explicitly Out of Scope

Do not build these. If asked to add one, remind the user it's outside the locked prototype and treat it as a roadmap item instead:

- Always-on listening
- Email / calendar / Slack / CRM integrations
- Speaker diarization / speaker identification — **partially crossed, deliberately.**
  Transcripts are now labelled `You:` / `Them:`, but this is *not* diarization:
  the two speakers arrive as two separately-captured audio streams (microphone
  and shared tab) and each is tagged at its source. No model infers who is
  speaking. Telling apart two voices *within one stream* — several people in a
  room on one microphone — remains out of scope and still needs a real model.
- Authentication / multi-user accounts
- Desktop background agent
- WASAPI / CoreAudio
- Memory Graph
- Contradiction detection
- Vector database
- Continuous/real-time extraction (every few seconds) — extraction happens once, after the session ends

These are roadmap-only, for later phases: Memory OS, Memory Graph, cross-meeting contradiction detection, desktop app, WASAPI/CoreAudio, universal meeting compatibility, pre-meeting briefing, live proactive alerts.

## Engineering Principles (non-negotiable)

1. End-to-end over perfection.
2. Working demo over beautiful UI.
3. Deterministic demo over clever AI — the demo script is fixed and rehearsed, not improvised. Don't introduce nondeterminism (e.g., temperature > 0 on the summary/recall calls) without a reason.
4. One complete loop over many incomplete features.
5. Memory is the product; transcription is infrastructure. Don't over-invest in transcription polish (custom VAD, noise handling, etc.) at the expense of the memory/recall piece.

## How to Help (when writing code)

- Give production-quality code for the current prototype stage — not a toy stub, but also not more abstraction than a 2-3 day prototype needs.
- Say exactly which files you're creating or modifying, with folder paths.
- Mention any new package that needs installing (pip/npm) and how to test the feature you just added.
- When debugging: find the root cause, give the smallest working fix first, don't rewrite unrelated code while you're in there.
- Keep decisions consistent with what's already in this file and in the existing codebase — don't quietly re-architect something that already works.
- Both teammates need to be able to understand any part of the system, so explain non-obvious implementation decisions briefly as you go (a comment or a short note), not just the code.

## Git Workflow

Work on `main`. Commit after every working milestone, and never leave `main` in a broken state. Rough milestone order: transcript works → save works → tasks work → summary works → recall works.

## Demo Script (keep this deterministic)

```
"Today we're discussing the project."
"Hey Coworker, remind me to send the deck."
[end session]
→ summary appears

[later session]
"What did I decide in yesterday's meeting?"
→ assistant retrieves and answers
```

No unpredictable AI behavior during the actual demo — this is the sequence to test against repeatedly.
