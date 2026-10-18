"""Checks that the Sarvam key works for Telugu: Priya's voice says a line and Sarvam transcribes it.

Run: uv run check_sarvam.py
"""

import time

import httpx

from settings import CARTESIA_API, CARTESIA_VERSION, env, require

LINE = "Naku iPhone sixteen Pro Max ki transparent case kavali, price entha?"


def main() -> None:
    cartesia = {"Authorization": f"Bearer {require('CARTESIA_API_KEY')}", "Cartesia-Version": CARTESIA_VERSION}
    voice = httpx.get(f"{CARTESIA_API}/v1/agents/{require('CARTESIA_AGENT_ID')}", headers=cartesia, timeout=20).json()[
        "config"
    ]["audio"]["output"]["voice_id"]
    wav = httpx.post(
        f"{CARTESIA_API}/tts/bytes",
        headers=cartesia,
        json={
            "model_id": "sonic-3",
            "transcript": LINE,
            "voice": {"mode": "id", "id": voice},
            "language": "te",
            "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 16000},
        },
        timeout=30,
    ).content

    started = time.perf_counter()
    res = httpx.post(
        "https://api.sarvam.ai/speech-to-text",
        headers={"api-subscription-key": require("SARVAM_API_KEY")},
        data={"model": env("SARVAM_STT_MODEL", "saaras:v4"), "language_code": "te-IN", "mode": "codemix"},
        files={"file": ("line.wav", wav, "audio/wav")},
        timeout=30,
    )
    print(f"said:   {LINE}")
    print(f"Sarvam: {res.status_code} in {(time.perf_counter() - started) * 1000:.0f} ms: {res.text[:300]}")


if __name__ == "__main__":
    main()
