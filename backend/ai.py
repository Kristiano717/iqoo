"""The two LLM calls this prototype makes, per CLAUDE.md's AI Behavior Rules:

1. generate_summary() — one call after a session ends, returning exactly
   {summary, tasks, facts}.
2. answer_recall() — one call when the user asks about past meetings,
   answering strictly from retrieved session notes (plain text, no schema).

Provider is picked by which key is set in backend/.env (GEMINI_API_KEY vs
OPENAI_API_KEY), per CLAUDE.md's rule to check the .env rather than assume.
Both branches share the same prompts (loaded from prompts/*.md), so
swapping providers is just an .env change.

NOTE ON MODEL CHOICE: CLAUDE.md names gemini-2.0-flash / gemini-2.5-flash
for the dev-time Gemini path. As of this build, both are retired for new
API keys (Google's API returns 404 pointing at a replacement). Verified
against the live API before picking: gemini-3.6-flash is the closest
available equivalent (still the free-tier "flash" tier) and was confirmed
working with this exact {summary, tasks, facts} schema. Flagging this here
since it's a deviation from the locked spec's exact model name, forced by
the models no longer existing rather than a discretionary swap.

The GPT-5 (OpenAI) branches below are implemented for when billing is set
up, but are UNVERIFIED — this environment has no OPENAI_API_KEY to test.
"""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

GEMINI_MODEL = "gemini-3.6-flash"
OPENAI_MODEL = "gpt-5"

# Realtime speech-to-text, used for live transcription of both sides of a
# call. Separate from GEMINI_MODEL: it's a dedicated STT model that holds a
# bidirectional WebSocket rather than answering one-shot prompts, and it's
# free on the Gemini free tier. The browser connects to it directly, using
# a short-lived token minted by create_live_token() below.
GEMINI_LIVE_MODEL = "gemini-3.5-transcribe-live"

# Cap on the model's hidden reasoning, and the single biggest lever on how
# long a session takes to summarise.
#
# gemini-3.6-flash is a thinking model. Left unbounded it spent 584-1015
# thinking tokens to produce ~105 tokens of output — roughly 89% of the work
# invisible — which measured 15-38s per extraction. Capped at 128 the same
# call returned in 2s, and the output held up: correct speaker attribution,
# only the user's own commitment classified as a task, four well-formed facts.
#
# 128 is the floor worth using: thinking_budget=0 is rejected outright by
# this model (400 INVALID_ARGUMENT), so thinking can be bounded but not
# switched off. Raise it if extraction quality regresses on longer
# transcripts — 512 measured ~7s and is the next step up.
GEMINI_THINKING_BUDGET = 128

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "tasks": {"type": "array", "items": {"type": "string"}},
        "facts": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "tasks", "facts"],
}


def _load_system_instruction(filename: str) -> str:
    text = (PROMPTS_DIR / filename).read_text(encoding="utf-8")
    marker = "## SYSTEM_INSTRUCTION"
    idx = text.index(marker)
    return text[idx + len(marker) :].strip()


EXTRACTION_INSTRUCTION = _load_system_instruction("extraction_prompt.md")
RECALL_INSTRUCTION = _load_system_instruction("recall_prompt.md")


def _active_provider() -> str:
    """Returns 'gemini' or 'openai' based on .env. Raises if ambiguous."""
    has_gemini = bool(os.environ.get("GEMINI_API_KEY"))
    has_openai = bool(os.environ.get("OPENAI_API_KEY"))

    if has_gemini and has_openai:
        raise RuntimeError(
            "Both GEMINI_API_KEY and OPENAI_API_KEY are set in backend/.env — "
            "comment one out so the provider isn't ambiguous."
        )
    if has_gemini:
        return "gemini"
    if has_openai:
        return "openai"
    raise RuntimeError(
        "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in backend/.env."
    )


def _call_gemini(system_instruction: str, user_content: str, schema: dict | None) -> str:
    from google import genai as google_genai
    from google.genai import types

    client = google_genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        # Deterministic demo per CLAUDE.md's engineering principles — no
        # temperature > 0 without a specific reason.
        temperature=0,
        thinking_config=types.ThinkingConfig(thinking_budget=GEMINI_THINKING_BUDGET),
    )
    if schema is not None:
        config.response_mime_type = "application/json"
        config.response_schema = schema

    return client.models.generate_content(
        model=GEMINI_MODEL, contents=user_content, config=config
    ).text


def _call_openai(system_instruction: str, user_content: str, schema: dict | None) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    kwargs = {
        "model": OPENAI_MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_content},
        ],
    }
    if schema is not None:
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "structured_output", "schema": schema, "strict": True},
        }
    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content


def _call_llm(system_instruction: str, user_content: str, schema: dict | None = None) -> str:
    if _active_provider() == "gemini":
        return _call_gemini(system_instruction, user_content, schema)
    return _call_openai(system_instruction, user_content, schema)


def generate_summary(transcript: str) -> dict:
    """One post-session call. Returns {summary, tasks, facts}."""
    raw = _call_llm(EXTRACTION_INSTRUCTION, f"Transcript:\n{transcript}", EXTRACTION_SCHEMA)
    return json.loads(raw)


def format_session_context(sessions: list[dict]) -> str:
    """Renders retrieved session rows into the notes block the recall
    prompt expects. Oldest first, so 'yesterday' vs 'last week' ordering
    reads naturally to the model."""
    blocks = []
    for s in sessions:
        # timestamp is an ISO string from Supabase; date portion is enough
        # context for questions like "what did I decide yesterday?".
        date = (s.get("timestamp") or "")[:10]
        summary = (s.get("summary") or "").strip() or "(no summary generated for this session)"
        facts = s.get("facts") or []
        lines = [f"Meeting on {date}:", f"Summary: {summary}"]
        if facts:
            lines.append("Facts:")
            lines.extend(f"- {f}" for f in facts)
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def answer_recall(question: str, sessions: list[dict]) -> str:
    """Answers a question using only the given past sessions. Returns
    plain text — no schema, since the answer is prose."""
    if not sessions:
        # Don't spend an LLM call to say "nothing stored" — and don't let
        # the model improvise an answer from an empty context either.
        return "I don't have any past sessions stored yet, so there's nothing to recall."

    # Today's date has to be stated explicitly: the model has no clock, so
    # without it a question like "what did I decide yesterday?" can't be
    # resolved against the dated notes and it hedges across every session.
    today = datetime.now(timezone.utc).date().isoformat()
    context = format_session_context(sessions)
    user_content = (
        f"Today's date is {today}.\n\n"
        f"Past session notes:\n\n{context}\n\n"
        f"Question: {question}"
    )
    return _call_llm(RECALL_INSTRUCTION, user_content, schema=None).strip()


# ---------------------------------------------------------------------------
# Realtime transcription tokens
# ---------------------------------------------------------------------------

# How long a minted token stays usable for sending audio. Live sessions cap
# at 10 minutes, so this gives comfortable headroom for one full session
# without leaving a long-lived credential lying around.
LIVE_TOKEN_TTL_MINUTES = 20

# How long the browser has to actually open the socket after asking for a
# token. Short on purpose: the frontend requests one immediately before
# connecting, so anything longer is just a wider window for a leaked token.
LIVE_TOKEN_START_WINDOW_MINUTES = 2


def create_live_token() -> dict:
    """Mints a short-lived token for one Gemini Live WebSocket connection.

    The browser connects to Gemini directly — audio never round-trips
    through this backend, which is what keeps latency at sub-second. That
    means the browser needs a credential, and it must not be
    GEMINI_API_KEY. Ephemeral tokens exist for exactly this: they're
    scoped to a single session and expire in minutes.

    Deliberately `uses=1`, one token per connection. A call has two audio
    sources (microphone and the other participant), and each Live session
    is capped at 10 minutes, so the frontend asks for a fresh token per
    socket rather than sharing one — a token that can open N sessions is a
    token worth stealing.
    """
    provider = _active_provider()
    if provider != "gemini":
        raise RuntimeError(
            f"Live transcription needs the Gemini provider, but {provider} is "
            "configured. Set GEMINI_API_KEY in backend/.env."
        )

    from google import genai as google_genai

    client = google_genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    now = datetime.now(timezone.utc)
    token = client.auth_tokens.create(
        config={
            "uses": 1,
            "expire_time": now + timedelta(minutes=LIVE_TOKEN_TTL_MINUTES),
            "new_session_expire_time": now
            + timedelta(minutes=LIVE_TOKEN_START_WINDOW_MINUTES),
        }
    )

    # The model name travels with the token so the browser never hardcodes
    # it — swapping STT models stays a backend-only change, matching how
    # GEMINI_MODEL works for the one-shot calls.
    return {"token": token.name, "model": GEMINI_LIVE_MODEL}
