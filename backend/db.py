"""Supabase client, shared across endpoints.

Reads SUPABASE_URL / SUPABASE_KEY from backend/.env (see .env.example).
Kept as a single lazily-created client rather than a class/abstraction —
there's exactly one backend process talking to exactly one Supabase
project for this prototype, so a module-level singleton is enough.
"""

import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL / SUPABASE_KEY not set. Copy backend/.env.example "
                "to backend/.env and fill them in."
            )
        _client = create_client(url, key)
    return _client
