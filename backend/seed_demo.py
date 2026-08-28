"""Seeds a dated prior session so the demo's recall question is deterministic.

Why this exists: CLAUDE.md's demo script asks "What did I decide in
yesterday's meeting?" — but every session created during development is
timestamped today. Asked that question against today-only data, the model
answers from a *today* meeting without flagging the date mismatch, which
makes the headline demo moment quietly wrong.

This writes one fully-formed session (transcript + summary + facts +
tasks) backdated to yesterday, so the recall answer cites a real
yesterday and the demo is reproducible.

Run from backend/:  python seed_demo.py
Add --reset to delete any previously seeded demo session first, so
re-running before a rehearsal doesn't stack duplicates.
"""

import sys
from datetime import datetime, timedelta, timezone

from db import get_client

# Marker kept inside the transcript so the seeded row is identifiable for
# --reset without needing an extra schema column.
SEED_MARKER = "[seeded-demo-session]"

TRANSCRIPT = (
    f"{SEED_MARKER} "
    "Alright, let's go over the launch plan. We looked at the timeline and "
    "the design work isn't going to be ready for the original date, so we "
    "decided to push the launch to March. Marketing asked for weekly "
    "check-ins instead of the daily standups, and we agreed that works "
    "better for everyone. Hey Coworker, remind me to send the deck to the "
    "client. One more thing, the client wants the final numbers before we "
    "sign anything."
)

SUMMARY = (
    "The team reviewed the launch plan and decided to push the launch to March "
    "because the design work would not be ready for the original date. They also "
    "agreed to switch from daily standups to weekly check-ins at marketing's "
    "request. A reminder was captured to send the deck to the client, and the "
    "client requires final numbers before signing."
)

FACTS = [
    "Decided to push the launch to March",
    "Design work would not be ready for the original launch date",
    "Agreed to switch from daily standups to weekly check-ins",
    "Client requires final numbers before signing",
]

TASKS = ["Send the deck to the client"]


def reset(client):
    rows = client.table("sessions").select("id,transcript").execute()
    seeded = [r["id"] for r in rows.data if SEED_MARKER in (r["transcript"] or "")]
    for sid in seeded:
        # tasks cascade on session delete (see database/schema.sql)
        client.table("sessions").delete().eq("id", sid).execute()
    return len(seeded)


def main():
    client = get_client()

    if "--reset" in sys.argv:
        removed = reset(client)
        print(f"Removed {removed} previously seeded session(s).")

    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    session = (
        client.table("sessions")
        .insert(
            {
                "transcript": TRANSCRIPT,
                "summary": SUMMARY,
                "facts": FACTS,
                "timestamp": yesterday.isoformat(),
            }
        )
        .execute()
    )
    session_id = session.data[0]["id"]

    client.table("tasks").insert(
        [{"session_id": session_id, "text": t, "timestamp": yesterday.isoformat()} for t in TASKS]
    ).execute()

    print(f"Seeded session {session_id} dated {yesterday.date()}.")
    print("Try: \"What did I decide in yesterday's meeting?\"")


if __name__ == "__main__":
    main()
