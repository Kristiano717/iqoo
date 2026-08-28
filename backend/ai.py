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
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

GEMINI_MODEL = "gemini-3.6-flash"
OPENAI_MODEL = "gpt-5"

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
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    # Deterministic demo per CLAUDE.md's engineering principles — no
    # temperature > 0 without a specific reason.
    config = {"temperature": 0}
    if schema is not None:
        config["response_mime_type"] = "application/json"
        config["response_schema"] = schema

    model = genai.GenerativeModel(
        GEMINI_MODEL,
        system_instruction=system_instruction,
        generation_config=config,
    )
    return model.generate_content(user_content).text


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
