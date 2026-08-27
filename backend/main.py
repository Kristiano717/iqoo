"""Second Coworker — FastAPI backend entrypoint.

Milestone 1 ("transcript works") was browser-only per CLAUDE.md — live
transcription and wake-phrase detection both run client-side with no
server round-trip. Milestone 2 ("save works") added session persistence.
Milestone 3 ("tasks work") adds task persistence: wake-phrase hits are
still detected live in the browser (no server round-trip during the
session), the tray is just POSTed here once, at End Session. Summary
generation (Milestone 4) and recall (Milestone 5) still aren't wired up.
"""

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
