"""Second Coworker — FastAPI backend entrypoint.

Milestone 1 ("transcript works") was browser-only per CLAUDE.md — live
transcription and wake-phrase detection both run client-side with no
server round-trip. Milestone 2 ("save works") added session persistence.
Milestone 3 ("tasks work") added task persistence. Milestone 4 ("summary
works") adds the single end-of-session LLM call. Recall (Milestone 5)
still isn't wired up.
"""

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai import generate_summary
from db import get_client

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


def _compose_stored_summary(summary: str, facts: list[str]) -> str:
    # sessions.summary is the ONLY column the locked schema gives this data
    # a home in — no separate facts table/column (see CLAUDE.md's Database
    # Schema section). Facts get folded in here so recall (Milestone 5),
    # which only ever reads sessions.summary, can still see them.
    if not facts:
        return summary
    facts_block = "\n".join(f"- {f}" for f in facts)
    return f"{summary}\n\nKey facts:\n{facts_block}"


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

    stored_summary = _compose_stored_summary(extracted["summary"], extracted["facts"])
    try:
        get_client().table("sessions").update({"summary": stored_summary}).eq("id", session_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save summary: {exc}")

    # Return the structured pieces (not the flattened stored text) so the
    # frontend can render summary/tasks/facts as distinct sections.
    return extracted
