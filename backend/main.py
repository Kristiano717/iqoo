"""Second Coworker — FastAPI backend entrypoint.

Milestone 1 ("transcript works") was browser-only per CLAUDE.md — live
transcription and wake-phrase detection both run client-side with no
server round-trip. Milestone 2 ("save works") added session persistence.
Milestone 3 ("tasks work") added task persistence. Milestone 4 ("summary
works") added the single end-of-session LLM call. Milestone 5 ("recall
works") adds cross-session memory recall — the last piece of the loop.
"""

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai import answer_recall, generate_summary
from db import get_client

# How many past sessions to pull into the recall context. Retrieval is by
# recency only — no vector search, no embeddings (CLAUDE.md). A small,
# fixed window keeps the prompt bounded and the demo deterministic.
RECALL_SESSION_LIMIT = 10

app = FastAPI(title="Second Coworker API")

# Pinned in frontend/vite.config.js (see comment there for why it's not
# the 5173 default). Update both together if the frontend port changes.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


class SaveSessionRequest(BaseModel):
    transcript: str


@app.post("/sessions")
def save_session(body: SaveSessionRequest):
    # summary is left null here on purpose — Milestone 4 fills it in via a
    # separate call once the end-of-session LLM summary exists.
    row = {
        "transcript": body.transcript,
        "summary": None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        result = get_client().table("sessions").insert(row).execute()
    except Exception as exc:  # Supabase/network errors — surface plainly, don't guess.
        raise HTTPException(status_code=502, detail=f"Failed to save session: {exc}")

    saved = result.data[0]
    return {"id": saved["id"], "timestamp": saved["timestamp"]}


class SaveTasksRequest(BaseModel):
    tasks: list[str]


def _insert_tasks(session_id: str, tasks: list[str]) -> int:
    """Inserts tasks for a session, skipping ones already stored for it.

    Two paths write here — the live wake-phrase tray (at End Session) and
    the AI extraction (at summarize) — and they overlap heavily, since a
    spoken "Hey Coworker, remind me to X" is also an obvious Task to the
    model. Dedupe so the same reminder doesn't land twice.
    """
    if not tasks:
        return 0

    existing_rows = (
        get_client().table("tasks").select("text").eq("session_id", session_id).execute()
    )
    existing = {r["text"].strip().lower() for r in existing_rows.data}

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    seen = set(existing)
    for t in tasks:
        key = t.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append({"session_id": session_id, "text": t, "timestamp": now})

    if not rows:
        return 0
    result = get_client().table("tasks").insert(rows).execute()
    return len(result.data)


@app.post("/sessions/{session_id}/tasks")
def save_tasks(session_id: str, body: SaveTasksRequest):
    try:
        saved = _insert_tasks(session_id, body.tasks)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save tasks: {exc}")

    return {"saved": saved}


@app.post("/sessions/{session_id}/summarize")
def summarize_session(session_id: str):
    try:
        row = get_client().table("sessions").select("transcript").eq("id", session_id).single().execute()
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Session not found: {exc}")

    transcript = row.data["transcript"]
    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Session has an empty transcript, nothing to summarize.")

    try:
        extracted = generate_summary(transcript)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI summary generation failed: {exc}")

    # summary and facts are stored in their own columns — facts keep their
    # structure rather than being flattened into prose, which is the whole
    # point of the "structured memory objects" differentiator. Recall
    # (Milestone 5) reads both.
    try:
        (
            get_client()
            .table("sessions")
            .update({"summary": extracted["summary"], "facts": extracted["facts"]})
            .eq("id", session_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save summary: {exc}")

    # Persist the model's extracted tasks too. Without this they'd only
    # ever be displayed and then thrown away — the tasks table would hold
    # nothing but wake-phrase hits, missing every task that was discussed
    # without the magic phrase. Deduped against what's already stored.
    try:
        _insert_tasks(session_id, extracted["tasks"])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save extracted tasks: {exc}")

    return extracted


class RecallRequest(BaseModel):
    question: str


@app.post("/recall")
def recall(body: RecallRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is empty.")

    try:
        result = (
            get_client()
            .table("sessions")
            .select("summary,facts,timestamp")
            # Only summarized sessions are useful context — a row whose
            # summary is still null was never run through extraction.
            .not_.is_("summary", "null")
            .order("timestamp", desc=True)
            .limit(RECALL_SESSION_LIMIT)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to retrieve past sessions: {exc}")

    # Retrieved newest-first (so the limit keeps the most recent), but
    # reversed for the prompt so the model reads them oldest-to-newest.
    sessions = list(reversed(result.data))

    try:
        answer = answer_recall(question, sessions)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Recall failed: {exc}")

    return {"answer": answer, "sessions_searched": len(sessions)}
