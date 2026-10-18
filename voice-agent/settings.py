"""Settings for the voice agent, read from the platform's own .env.local so keys live in one place."""

import base64
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2 import service_account
from livekit import api

ROOT = Path(__file__).resolve().parent
# The Next.js app's env file; a voice-agent/.env, if present, wins for agent-only overrides.
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env.local")

# Cartesia keeps the agent's script and Priya's voice; the test agent reads both from there,
# so it speaks exactly like the live one.
CARTESIA_API = "https://api.cartesia.ai"
CARTESIA_VERSION = "2026-08-14"

# The worker registers under this name; make_call.py dispatches calls to it.
AGENT_NAME = "priya-test"
# The LiveKit outbound trunk that setup_trunk.py creates for the Vobiz number.
TRUNK_NAME = "Vobiz outbound"


def env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, "").strip()
    return value or default


def require(name: str) -> str:
    value = env(name)
    if not value:
        raise SystemExit(f"Set {name} in .env.local first.")
    return value


async def trunk_id(lk: api.LiveKitAPI) -> str:
    """LIVEKIT_SIP_TRUNK_ID, or the trunk setup_trunk.py created, found by its name."""
    explicit = env("LIVEKIT_SIP_TRUNK_ID")
    if explicit:
        return explicit
    trunks = await lk.sip.list_sip_outbound_trunk(api.ListSIPOutboundTrunkRequest())
    for trunk in trunks.items:
        if trunk.name == TRUNK_NAME:
            return trunk.sip_trunk_id
    raise SystemExit("No Vobiz trunk in LiveKit yet. Run: uv run setup_trunk.py")


def vertex_account() -> tuple[service_account.Credentials, str]:
    """The service account in GOOGLE_VERTEX_CREDENTIALS, stored as the JSON file or base64 of it."""
    raw = require("GOOGLE_VERTEX_CREDENTIALS")
    info = json.loads(raw if raw.startswith("{") else base64.b64decode(raw).decode("utf-8"))
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    return credentials, info["project_id"]
