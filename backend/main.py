"""Second Coworker — FastAPI backend entrypoint.

Milestone 1 ("transcript works") is browser-only per CLAUDE.md — live
transcription and wake-phrase detection both run client-side with no
server round-trip. So this backend currently exposes nothing but a health
check; real endpoints (save session, generate summary, recall) get added
starting Milestone 2 ("save works").
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Second Coworker API")

# Vite's default dev server port. Update if the frontend port changes.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
