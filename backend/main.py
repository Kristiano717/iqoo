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
