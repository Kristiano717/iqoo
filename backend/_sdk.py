import os, time, ai
from dotenv import load_dotenv; load_dotenv()
T = """You: Let's go through the pricing sheet.
Them: We need it finalised before Friday.
Them: We'd prefer weekly check-ins rather than daily standups.
You: Fine. I'll move the redesign to Q3."""
prompt = f"Transcript:\n{T}"

print("=== OLD SDK: google-generativeai (gRPC) ===")
for i in range(2):
    s = time.time()
    try:
        out = ai._call_gemini(ai.EXTRACTION_INSTRUCTION, prompt, ai.EXTRACTION_SCHEMA)
        print(f"  {time.time()-s:6.1f}s  run {i+1}  ({len(out)} chars)")
    except Exception as e:
        print(f"  FAILED {type(e).__name__}: {str(e)[:80]}")

print("\n=== NEW SDK: google-genai (HTTP) ===")
from google import genai
from google.genai import types
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
for i in range(3):
    s = time.time()
    try:
        r = client.models.generate_content(
            model=ai.GEMINI_MODEL, contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=ai.EXTRACTION_INSTRUCTION, temperature=0,
                response_mime_type="application/json", response_schema=ai.EXTRACTION_SCHEMA))
        u = r.usage_metadata
        print(f"  {time.time()-s:6.1f}s  run {i+1}  ({len(r.text)} chars, {u.candidates_token_count} out / {getattr(u,'thoughts_token_count',None)} thinking tok)")
    except Exception as e:
        print(f"  FAILED {type(e).__name__}: {str(e)[:80]}")

print("\n=== NEW SDK with a small thinking budget ===")
for budget in (128, 512):
    s = time.time()
    try:
        r = client.models.generate_content(
            model=ai.GEMINI_MODEL, contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=ai.EXTRACTION_INSTRUCTION, temperature=0,
                response_mime_type="application/json", response_schema=ai.EXTRACTION_SCHEMA,
                thinking_config=types.ThinkingConfig(thinking_budget=budget)))
        u = r.usage_metadata
        print(f"  {time.time()-s:6.1f}s  budget={budget}  ({u.candidates_token_count} out / {getattr(u,'thoughts_token_count',None)} thinking tok)")
    except Exception as e:
        print(f"  budget={budget} FAILED: {str(e)[:100]}")
