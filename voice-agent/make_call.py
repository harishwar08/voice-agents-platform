"""Place a test call: hands the number to the running agent.py worker, which does the dialling.

The worker is what owns the trunk and the SIP participant (see agent.py's entrypoint), so this
script only starts a job and names the room. The room name is what the call's log is saved under,
so `calls/priya-test-<unix seconds>.json` is the record of the call placed here.

Start the worker first, in its own terminal:  uv run agent.py dev
Then:                                        uv run make_call.py --to +918074562571
"""

import argparse
import asyncio
import json
import time

from livekit import api

from settings import AGENT_NAME, require

# LiveKit wants the number in E.164: a plus, the country code, then the number. A bare 10-digit
# Indian number is rejected by the trunk, so it's caught here rather than mid-call.
E164_HELP = "Use E.164, with the country code: +918074562571, not 8074562571."


def phone_number(value: str) -> str:
    cleaned = "".join(value.split())
    if not cleaned.startswith("+") or not cleaned[1:].isdigit() or not 8 <= len(cleaned[1:]) <= 15:
        raise argparse.ArgumentTypeError(f"{value!r} isn't a phone number. {E164_HELP}")
    return cleaned


async def place(phone: str) -> str:
    # LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET; settings.py has already loaded .env.local.
    require("LIVEKIT_URL")
    require("LIVEKIT_API_KEY")
    require("LIVEKIT_API_SECRET")
    room = f"{AGENT_NAME}-{int(time.time())}"
    async with api.LiveKitAPI() as lk:
        await lk.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=AGENT_NAME,
                room=room,
                # agent.py reads phone_number out of the job metadata and dials it.
                metadata=json.dumps({"phone_number": phone}),
            )
        )
    return room


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--to", required=True, type=phone_number, help=f"Who to call. {E164_HELP}")
    args = parser.parse_args()
    room = asyncio.run(place(args.to))
    print(f"calling {args.to} as {room}")
    print(f"the worker's terminal shows each reply's timing; the call is saved to calls/{room}.json")


if __name__ == "__main__":
    main()
