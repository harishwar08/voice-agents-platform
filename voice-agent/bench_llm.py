"""How long Gemini takes to start a reply from each Google region, with Priya's real script.

Run: uv run bench_llm.py
"""

import statistics
import time

import httpx
from google import genai
from google.genai import types

from settings import CARTESIA_API, CARTESIA_VERSION, require, vertex_account

# (model, location); Gemini 2.5 models switch thinking off with a zero budget, 3.x use the lowest level.
# Every model is worth trying from asia-south1 as well as global: the trip out of India costs
# more than a smaller model saves, and leaving asia-south1 off 3.5 Flash Lite hid the fastest
# option here (398 ms from Mumbai against 665 ms through global).
CANDIDATES = [
    ("gemini-3.5-flash-lite", "asia-south1"),
    ("gemini-3.5-flash-lite", "global"),
    ("gemini-2.5-flash", "asia-south1"),
    ("gemini-2.5-flash", "global"),
    ("gemini-2.5-flash-lite", "asia-south1"),
    ("gemini-2.5-flash-lite", "global"),
]
RUNS = 5

# Short customer turns like the ones on real calls.
TURNS = [
    "iPhone sixteen Pro Max ki case unda?",
    "Transparent case kavali, price entha?",
    "Screen guard kuda unda?",
    "Delivery entha time padutundi?",
    "Okay, COD available a?",
]


def priya_script() -> str:
    res = httpx.get(
        f"{CARTESIA_API}/v1/agents/{require('CARTESIA_AGENT_ID')}",
        headers={"Authorization": f"Bearer {require('CARTESIA_API_KEY')}", "Cartesia-Version": CARTESIA_VERSION},
        timeout=20,
    )
    res.raise_for_status()
    return res.json()["config"]["instructions"]


def thinking(model: str) -> types.ThinkingConfig:
    if model.startswith("gemini-2.5"):
        return types.ThinkingConfig(thinking_budget=0)
    return types.ThinkingConfig(thinking_level="MINIMAL")


def first_text_ms(client: genai.Client, model: str, script: str, turn: str) -> tuple[float, str]:
    started = time.perf_counter()
    stream = client.models.generate_content_stream(
        model=model,
        contents=[types.Content(role="user", parts=[types.Part(text=turn)])],
        config=types.GenerateContentConfig(
            system_instruction=script,
            temperature=0.1,
            thinking_config=thinking(model),
        ),
    )
    for chunk in stream:
        if chunk.text:
            elapsed = (time.perf_counter() - started) * 1000
            text = chunk.text
            for rest in stream:  # finish the stream so the next request starts clean
                text += rest.text or ""
            return elapsed, text
    return float("nan"), ""


def main() -> None:
    credentials, project = vertex_account()
    script = priya_script()
    print(f"script: {len(script)} chars")
    for model, location in CANDIDATES:
        client = genai.Client(vertexai=True, project=project, location=location, credentials=credentials)
        try:
            first_text_ms(client, model, script, "Hello")  # warm-up: connection and auth, not counted
        except Exception as err:  # noqa: BLE001 - report and move on to the next candidate
            print(f"{model} @ {location}: not available ({str(err)[:120]})")
            continue
        results = [first_text_ms(client, model, script, TURNS[i % len(TURNS)]) for i in range(RUNS)]
        times = [t for t, _ in results]
        print(f"{model} @ {location}: median {statistics.median(times):.0f} ms, all {', '.join(f'{t:.0f}' for t in times)}")
        print(f"    sample reply: {results[1][1].strip()[:140]!r}")


if __name__ == "__main__":
    main()
