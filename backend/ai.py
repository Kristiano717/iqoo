"""End-of-session summary generation — one LLM call per CLAUDE.md's AI
Behavior Rules, returning exactly {summary, tasks, facts}.

Provider is picked by which key is set in backend/.env (GEMINI_API_KEY vs
OPENAI_API_KEY), per CLAUDE.md's rule to check the .env rather than assume.
Both branches share the same prompt (loaded from prompts/extraction_prompt.md)
and the same response schema, so swapping providers is just an .env change.

NOTE ON MODEL CHOICE: CLAUDE.md names gemini-2.0-flash / gemini-2.5-flash
for the dev-time Gemini path. As of this build, both are retired for new
API keys (Google's API returns 404 pointing at a replacement). Verified
against the live API before picking: gemini-3.6-flash is the closest
available equivalent (still the free-tier "flash" tier) and was confirmed
working with this exact {summary, tasks, facts} schema. Flagging this here
since it's a deviation from the locked spec's exact model name, forced by
the models no longer existing rather than a discretionary swap.

The GPT-5 (OpenAI) branch below is implemented for when billing is set up,
but is UNVERIFIED — this environment has no OPENAI_API_KEY to test against.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extraction_prompt.md"

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "tasks": {"type": "array", "items": {"type": "string"}},
        "facts": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "tasks", "facts"],
}


def _load_system_instruction() -> str:
    text = PROMPT_PATH.read_text(encoding="utf-8")
    marker = "## SYSTEM_INSTRUCTION"
    idx = text.index(marker)
    return text[idx + len(marker) :].strip()


SYSTEM_INSTRUCTION = _load_system_instruction()


def _generate_with_gemini(transcript: str) -> dict:
    import google.generativeai as genai

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel(
        "gemini-3.6-flash",
        system_instruction=SYSTEM_INSTRUCTION,
        generation_config={
            "response_mime_type": "application/json",
            "response_schema": RESPONSE_SCHEMA,
            # Deterministic demo per CLAUDE.md's engineering principles —
            # no temperature > 0 without a specific reason.
            "temperature": 0,
        },
    )
    response = model.generate_content(f"Transcript:\n{transcript}")
    return json.loads(response.text)


def _generate_with_openai(transcript: str) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model="gpt-5",
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": f"Transcript:\n{transcript}"},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "session_extraction", "schema": RESPONSE_SCHEMA, "strict": True},
        },
    )
    return json.loads(response.choices[0].message.content)


def generate_summary(transcript: str) -> dict:
    """Returns {summary, tasks, facts} for the given transcript, using
    whichever provider has a key set in .env. Raises RuntimeError if
    neither (or both, ambiguously) are configured."""
    has_gemini = bool(os.environ.get("GEMINI_API_KEY"))
    has_openai = bool(os.environ.get("OPENAI_API_KEY"))

    if has_gemini and not has_openai:
        return _generate_with_gemini(transcript)
    if has_openai and not has_gemini:
        return _generate_with_openai(transcript)
    if has_gemini and has_openai:
        raise RuntimeError(
            "Both GEMINI_API_KEY and OPENAI_API_KEY are set in backend/.env — "
            "comment one out so the provider isn't ambiguous."
        )
    raise RuntimeError(
        "No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in backend/.env."
    )
