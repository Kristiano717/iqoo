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


@app.post("/sessions/{session_id}/tasks")
def save_tasks(session_id: str, body: SaveTasksRequest):
    if not body.tasks:
        return {"saved": 0}

    now = datetime.now(timezone.utc).isoformat()
    rows = [{"session_id": session_id, "text": t, "timestamp": now} for t in body.tasks]
    try:
        result = get_client().table("tasks").insert(rows).execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save tasks: {exc}")

    return {"saved": len(result.data)}


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
