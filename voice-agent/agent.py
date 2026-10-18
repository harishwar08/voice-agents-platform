"""Priya on our own voice pipeline: a LiveKit agent that calls customers through the Vobiz trunk.

This is the latency test version. It takes Priya's script, greeting and voice from the live
Cartesia agent, so both setups say the same thing, and it logs how long each reply took and
saves it under calls/ for comparison with Cartesia's call logs.

Run the worker:  uv run agent.py dev
Place a call:    uv run make_call.py --to +91XXXXXXXXXX
"""

import asyncio
import json
import logging
import re
import statistics
import time
from collections.abc import AsyncIterable
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import numpy as np
from livekit import api, rtc
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, JobProcess, ModelSettings, cli, stt, utils
from livekit.agents.llm import ChatContext
from livekit.agents.tokenize import BufferedSentenceStream, SentenceStream, SentenceTokenizer, blingfire
from livekit.agents.voice.events import ConversationItemAddedEvent, UserStateChangedEvent
from livekit.plugins import cartesia, deepgram, google, sarvam, silero

from settings import AGENT_NAME, CARTESIA_API, CARTESIA_VERSION, ROOT, env, require, trunk_id, vertex_account

logger = logging.getLogger("priya")
CALLS_DIR = ROOT / "calls"

# The voice detector's silence is when the recognizer is told to finish and Gemini starts early.
# Priya still only answers once the caller has been quiet for END_OF_TURN_SECS, so people who
# pause mid-sentence aren't talked over. Cartesia waits about 1 s for Telugu.
#
# These two are what decide whether Gemini's time is hidden or paid for. At 0.2 s against an
# END_OF_TURN_SECS of 0.3 s, Gemini got a 0.1 s head start -- too little to even send the request,
# so calls/priya-test-1791957555.json shows the parts adding up to the whole (0.30 + 0.54 + 0.17
# = 1.01 s against a 1.00 s median): the early start bought nothing. The gap between the two is
# the head start, so a lower silence hides more of Gemini behind a wait we pay for anyway.
# The cost is more flushes and more discarded early answers on callers who pause mid-sentence;
# preemptive_generation's max_retries covers the discards. Worth A/B-ing 0.12 against 0.2.
SILENCE_SECS = float(env("VOICE_SILENCE_SECS", "0.12"))
END_OF_TURN_SECS = float(env("VOICE_END_OF_TURN_SECS", "0.3"))
# Turns of history kept behind Priya's script. Nothing trimmed it before, so the script and every
# turn so far were re-read on each reply and Gemini slowed as the call went on: in
# calls/priya-test-1791952668.json its first-word time drifted 0.50 -> 0.59 -> 0.96 -> 1.03 s.
# 0 keeps everything, as before.
HISTORY_TURNS = int(env("VOICE_HISTORY_TURNS", "8"))
IST = timezone(timedelta(hours=5, minutes=30))
# Louder than line noise (about -30 dBFS): the caller has said something, usually "Hello?".
CALLER_VOICE_PEAK = 1000
# A phone call's audio takes a moment to start flowing after it's answered. A greeting voiced in
# advance and played at once lost its first ~2 s ("Hello andi, welcome to Husle Lifestyle"), so
# Priya waits for the caller's "Hello?", or this long at most.
GREETING_WAIT_SECS = float(env("VOICE_GREETING_WAIT_SECS", "1.0"))
# A clause ends at punctuation followed by a space, so "1,499" isn't split.
CLAUSE_END = re.compile(r"[,.!?;:]+(?=\s)")


def script_rule() -> str:
    """How Priya spells her Telugu, which is a trade between clarity and speed.

    Cartesia is told language="te", so Telugu script is what it pronounces exactly. Romanised
    Telugu ("chustunnaro") leaves it guessing vowel length and retroflex consonants, which is
    why callers found the speech unclear. The cost of real script, measured earlier on this
    setup, was Cartesia starting to speak ~0.4 s later.

    VOICE_SCRIPT picks one:
      hybrid (default) -- Telugu script, with English product names left in English letters,
                          the way people actually code-mix. Clear, and keeps "iPhone 17 Pro Max"
                          from being mangled into script.
      telugu           -- everything in Telugu script, product names included.
      latin            -- everything romanised. Fastest to start speaking, least clear.
    """
    mode = env("VOICE_SCRIPT", "hybrid")
    if mode == "latin":
        return (
            "- Write every reply in English letters, the way these examples spell Telugu "
            '("Sure andi, mee phone model cheppandi?"). Never write Telugu script.\n'
        )
    if mode == "telugu":
        return "- Write every reply in Telugu script.\n"
    if mode != "hybrid":
        raise SystemExit(f"VOICE_SCRIPT must be hybrid, telugu or latin, got {mode!r}.")
    return (
        "- Write the Telugu part of every reply in Telugu script, not in English letters: write "
        '"సరే అండి, మీ ఫోన్ మాడల్ చెప్పండి?", not "Sare andi, mee phone model cheppandi?".\n'
        "- Leave English product names, brands and model numbers in English letters inside that "
        'Telugu sentence: "మీకు iPhone 17 Pro Max కి case కావాలా?". Never transliterate a brand into Telugu script.\n'
        "- Never mix the two for ordinary Telugu words: a single Telugu letter dropped into an "
        "otherwise English-letter sentence makes the voice stumble.\n"
    )


def call_rules() -> str:
    """Put ahead of the Cartesia script, which stays untouched.

    On test calls Gemini 2.5 Flash told customers the iPhone 16, 17 and 18 "aren't released yet".
    """
    today = datetime.now(IST).strftime("%d %B %Y")
    return (
        f"Today is {today}.\n"
        + script_rule()
        + '- Usually open with a short phrase and a comma, like "సరే అండి," or "సర్లే అండి,".\n'
        "- Your knowledge of phone launches is out of date. Never tell a customer a phone model doesn't "
        "exist or isn't released yet; they know their own phone. If you aren't sure we have a case for "
        "it, say the team will confirm.\n\n"
    )


def voice_speed(config: dict) -> float | None:
    """How fast Priya talks: the live agent's own setting, or VOICE_SPEED to try one on a call.

    sonic-3 takes 0.6 to 2.0, where 1.0 is the voice's natural pace and lower is slower. Left
    unset the voice runs at its own pace, which for Telugu comes out fast. This is a property of
    the voice, not of the script -- asking the instructions to "speak slowly" changes the words
    Priya chooses, not the speed they come out at.
    """
    override = env("VOICE_SPEED")
    speed = float(override) if override else config.get("audio", {}).get("output", {}).get("speed")
    if speed is None:
        return None
    if not 0.6 <= float(speed) <= 2.0:
        raise SystemExit(f"VOICE_SPEED must be between 0.6 and 2.0, got {speed}.")
    return float(speed)


def cartesia_agent() -> dict:
    """The live agent's config: Priya's script, greeting and voice."""
    res = httpx.get(
        f"{CARTESIA_API}/v1/agents/{require('CARTESIA_AGENT_ID')}",
        headers={"Authorization": f"Bearer {require('CARTESIA_API_KEY')}", "Cartesia-Version": CARTESIA_VERSION},
        timeout=20,
    )
    res.raise_for_status()
    return res.json()["config"]


class EagerDeepgram(deepgram.STT):
    """Deepgram's Telugu model, told to finish its text as soon as the caller goes quiet.

    Left to decide by itself, Deepgram sent its final text 0.4–1.2 s after the caller stopped.
    """

    _live: deepgram.stt.SpeechStream | None = None

    def stream(self, **kwargs) -> deepgram.stt.SpeechStream:
        self._live = super().stream(**kwargs)
        return self._live

    def finalize(self) -> None:
        try:
            if self._live is not None:
                self._live.flush()
        except RuntimeError:  # the stream already ended
            pass


class EagerSarvam(sarvam.STT):
    """Sarvam's Telugu model (servers in Mumbai), told to finish as soon as the caller goes quiet.

    Left to its own speech detector, Sarvam sent the final text ~0.8 s after the caller stopped;
    flushed at our 0.2 s of silence it came 0.2–0.4 s after.
    """

    _live: sarvam.stt.SpeechStream | None = None

    def stream(self, **kwargs) -> sarvam.stt.SpeechStream:
        self._live = super().stream(**kwargs)
        return self._live

    def finalize(self) -> None:
        # The plugin sends Sarvam {"type": "flush"} with its next audio chunk. Its flush() would
        # instead end the stream for the rest of the call.
        if self._live is not None:
            self._live._should_flush = True


class FirstClauseTokenizer(SentenceTokenizer):
    """Hands Cartesia the reply's first phrase as soon as Gemini writes it, then whole sentences.

    LiveKit's default passes a sentence on only once the next one starts, so a one-sentence reply
    was spoken only after Gemini had finished all of it.
    """

    def __init__(self) -> None:
        self._sentences = blingfire.SentenceTokenizer()

    def tokenize(self, text: str, *, language: str | None = None) -> list[str]:
        return self._sentences.tokenize(text, language=language)

    def stream(self, *, language: str | None = None) -> SentenceStream:
        first = True

        def split(text: str) -> list[str]:
            nonlocal first
            if not first:
                return self._sentences.tokenize(text)
            end = CLAUSE_END.search(text)
            if end is None or not text[end.end() :].strip():
                return [text]
            first = False
            return [text[: end.end()].strip(), text[end.end() :].strip()]

        return BufferedSentenceStream(tokenizer=split, min_token_len=1, min_ctx_len=1)


def trim_history(chat_ctx: ChatContext, keep_turns: int) -> int:
    """Drop all but the last `keep_turns` of back-and-forth, keeping Priya's script.

    Only plain caller and Priya turns are dropped; anything else (the system script, and tool
    calls, which would break Gemini if separated from their result) is always kept.
    """
    items = getattr(chat_ctx, "items", None)
    if keep_turns <= 0 or not items:
        return 0
    kept, recent, dropped = [], 0, 0
    for item in reversed(items):
        if getattr(item, "role", None) not in ("user", "assistant"):
            kept.append(item)
        elif recent < keep_turns:
            kept.append(item)
            recent += 1
        else:
            dropped += 1
    if dropped:
        items[:] = list(reversed(kept))
    return dropped


class Priya(Agent):
    """Priya's script with an early start: when the caller goes quiet, Gemini begins on the words
    heard so far. LiveKit keeps that answer if Deepgram's final text matches, so Gemini's time
    overlaps the wait for the caller to finish instead of following it.
    """

    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)
        self._inbox: asyncio.Queue[stt.SpeechEvent | str | None] | None = None
        self._latest_interim: stt.SpeechEvent | None = None
        # Set when the caller's voice first comes through, which shows the call's audio path is open.
        self.heard_caller = asyncio.Event()

    async def llm_node(self, chat_ctx: ChatContext, tools, model_settings: ModelSettings):
        """Trim the history before each reply, early ones included, then answer as usual."""
        dropped = trim_history(chat_ctx, HISTORY_TURNS)
        if dropped:
            logger.debug("dropped %d old turn(s) before asking Gemini", dropped)
        async for chunk in Agent.default.llm_node(self, chat_ctx, tools, model_settings):
            yield chunk

    async def stt_node(
        self, audio: AsyncIterable[rtc.AudioFrame], model_settings: ModelSettings
    ) -> AsyncIterable[stt.SpeechEvent | str]:
        inbox: asyncio.Queue[stt.SpeechEvent | str | None] = asyncio.Queue()

        async def metered() -> AsyncIterable[rtc.AudioFrame]:
            # The caller's loudest moment every 2 s, to tell a silent line from a recognizer
            # that isn't answering (a Sarvam test call got no text at all).
            peak, since = 0, time.time()
            async for frame in audio:
                frame_peak = int(np.abs(np.frombuffer(frame.data, dtype=np.int16)).max(initial=0))
                peak = max(peak, frame_peak)
                if frame_peak > CALLER_VOICE_PEAK and not self.heard_caller.is_set():
                    logger.info("caller's voice first heard")
                    self.heard_caller.set()
                if time.time() - since >= 2:
                    logger.debug("caller audio peak %.0f dBFS", 20 * np.log10(max(peak, 1) / 32768))
                    peak, since = 0, time.time()
                yield frame

        async def pump() -> None:
            try:
                async for ev in Agent.default.stt_node(self, metered(), model_settings):
                    if isinstance(ev, stt.SpeechEvent):
                        if ev.type == stt.SpeechEventType.INTERIM_TRANSCRIPT:
                            self._latest_interim = ev
                        elif ev.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                            self._latest_interim = None
                    inbox.put_nowait(ev)
            finally:
                inbox.put_nowait(None)

        self._inbox = inbox
        task = asyncio.create_task(pump())
        try:
            while (ev := await inbox.get()) is not None:
                yield ev
            await task  # surfaces a recognizer error
        finally:
            self._inbox = None
            await utils.aio.cancel_and_wait(task)

    def start_early(self) -> None:
        """Offer the words heard so far as a "preflight" transcript, which LiveKit answers early."""
        interim, inbox = self._latest_interim, self._inbox
        if interim is None or inbox is None or not interim.alternatives or not interim.alternatives[0].text.strip():
            return
        self._latest_interim = None
        logger.debug("early start on %r", interim.alternatives[0].text)
        inbox.put_nowait(replace(interim, type=stt.SpeechEventType.PREFLIGHT_TRANSCRIPT))


def build_stt():
    """Sarvam when its key is set, else Deepgram; VOICE_STT picks one explicitly.

    On test calls Sarvam (servers in Mumbai) sent its text 0.42 s after the caller stopped, against
    ~0.5 s for Deepgram (US), and heard every Telugu sentence right where Deepgram garbled some.
    """
    choice = env("VOICE_STT") or ("sarvam" if env("SARVAM_API_KEY") else "deepgram")
    if choice == "deepgram":
        return "deepgram nova-3 te", EagerDeepgram(
            model="nova-3",
            language="te",
            interim_results=True,
            # Product names callers say in English, so they come through spelled right.
            keyterm=["iPhone", "Samsung", "Pro Max", "case", "cover", "screen guard", "MagSafe", "charger", "AirPods"],
        )
    model = env("SARVAM_STT_MODEL", "saaras:v4")
    # Sarvam's default speech detector missed callers' first words for 10+ s on two real calls.
    # The high-sensitivity one caught everything, and its shorter pieces of text let LiveKit start
    # Gemini before the caller finished: replies took 1.00 s (median) against 1.29 s.
    # SARVAM_HIGH_VAD=0 turns it off.
    high_vad = True if env("SARVAM_HIGH_VAD", "1") == "1" else None
    return f"sarvam {model}{' high-vad' if high_vad else ''}", EagerSarvam(
        language="te-IN", model=model, mode=env("SARVAM_STT_MODE", "codemix"), high_vad_sensitivity=high_vad
    )


def build_llm():
    """Gemini on Google's Mumbai servers, thinking off.

    Gemini is over half the gap before Priya speaks: 0.58 s of the 1.09 s median in
    calls/priya-test-1792054036.json. Both the model and the region matter, and the region matters
    more -- measured on the real script, first-word times were:

        gemini-3.5-flash-lite @ asia-south1   398 ms   <- this, and what the live agent runs
        gemini-2.5-flash      @ asia-south1   528 ms
        gemini-2.5-flash-lite @ global        655 ms
        gemini-3.5-flash-lite @ global        665 ms
        gemini-2.5-flash-lite @ asia-south1   404, that one isn't served from Mumbai

    A lighter model is only worth it from Mumbai: the same Flash Lite costs 665 ms through
    `global`, so a model that isn't served from asia-south1 is slower however small it is. Check
    both together with bench_llm.py before switching. 3.5 Flash Lite is also what the live Cartesia
    agent uses, so the two setups now answer on the same model.
    """
    model = env("VOICE_LLM_MODEL", "gemini-3.5-flash-lite")
    location = env("VOICE_LLM_LOCATION", "asia-south1")
    credentials, project = vertex_account()
    thinking = {"thinking_budget": 0} if model.startswith("gemini-2.5") else {"thinking_level": "MINIMAL"}
    return f"{model} @ {location}", google.LLM(
        model=model,
        vertexai=True,
        project=project,
        location=location,
        credentials=credentials,
        temperature=0.1,
        thinking_config=thinking,
        # A reply is a sentence or two on the phone; this only stops a runaway one from holding
        # the turn, it doesn't change how soon the first word arrives.
        max_output_tokens=int(env("VOICE_MAX_REPLY_TOKENS", "120")),
    )


async def warm_up(llm: google.LLM, tts: cartesia.TTS, instructions: str, greeting: str) -> list[rtc.AudioFrame]:
    """Runs while the phone rings: opens the connections, has Google cache Priya's script (her
    first reply took 1.6 s without it), and voices the greeting so it plays the moment they answer."""
    tts.prewarm()
    chat = ChatContext()
    chat.add_message(role="system", content=instructions)
    chat.add_message(role="user", content="Hello")

    async def first_word() -> None:
        async with llm.chat(chat_ctx=chat) as stream:
            async for _ in stream:
                break

    async def voice_greeting() -> list[rtc.AudioFrame]:
        async with tts.synthesize(greeting) as stream:
            return [audio.frame async for audio in stream]

    _, frames = await asyncio.gather(first_word(), voice_greeting())
    return frames


async def replay(frames: list[rtc.AudioFrame]) -> AsyncIterable[rtc.AudioFrame]:
    for frame in frames:
        yield frame


def pin_resampler_tables() -> list[rtc.AudioResampler]:
    """Works around a crash in LiveKit's Windows audio library (soxr).

    Its resamplers share one table, set up by the first resampler and freed by the last. When a call
    ended, the last one freeing it could race the next one setting it up, which failed an assert
    ("LSX_FFT_BR == NULL") and froze the worker behind a Visual C++ Runtime dialog. Resamplers kept
    alive for the whole process mean the table is set up once and never freed.
    """
    pinned = []
    for quality in (rtc.AudioResamplerQuality.MEDIUM, rtc.AudioResamplerQuality.HIGH, rtc.AudioResamplerQuality.VERY_HIGH):
        for rate_in, rate_out in ((48000, 16000), (24000, 48000), (44100, 48000)):
            resampler = rtc.AudioResampler(rate_in, rate_out, quality=quality)
            resampler.push(rtc.AudioFrame.create(rate_in, 1, rate_in // 10))
            pinned.append(resampler)
    return pinned


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load(min_silence_duration=SILENCE_SECS)
    proc.userdata["pinned_resamplers"] = pin_resampler_tables()


server = AgentServer(setup_fnc=prewarm)


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    meta = json.loads(ctx.job.metadata or "{}")
    phone = meta.get("phone_number")
    config = await asyncio.to_thread(cartesia_agent)
    # Cartesia stores the greeting wrapped in quotes.
    greeting = str(config.get("initial_message") or "").strip().strip('"')
    instructions = call_rules() + config["instructions"]
    stt_name, recognizer = build_stt()
    llm_name, llm = build_llm()
    speed = voice_speed(config)
    tts = cartesia.TTS(
        model="sonic-3",
        voice=config["audio"]["output"]["voice_id"],
        language="te",
        tokenizer=FirstClauseTokenizer(),
        # Cartesia's own default when neither the live agent nor VOICE_SPEED names one.
        **({"speed": speed} if speed is not None else {}),
    )
    agent = Priya(instructions=instructions)

    session = AgentSession(
        stt=recognizer,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata["vad"],
        turn_handling={
            "turn_detection": "vad",
            "endpointing": {"min_delay": END_OF_TURN_SECS, "max_delay": 2.0},
            # Deepgram finishes pieces of a sentence at short pauses and each starts an early
            # answer, so allow more than LiveKit's 3 per turn or the one at the end is skipped.
            "preemptive_generation": {"enabled": True, "max_retries": 10},
        },
    )

    @session.on("user_state_changed")
    def _on_user_state(event: UserStateChangedEvent) -> None:
        if event.old_state == "speaking" and event.new_state == "listening":
            if isinstance(recognizer, (EagerDeepgram, EagerSarvam)):
                recognizer.finalize()
            agent.start_early()

    turns: list[dict] = []
    started = time.time()

    @session.on("conversation_item_added")
    def _on_item(event: ConversationItemAddedEvent) -> None:
        item = event.item
        if getattr(item, "role", None) not in ("user", "assistant"):
            return
        m = dict(item.metrics or {})
        turn = {"role": item.role, "at": round(time.time() - started, 1), "text": item.text_content or ""}
        for key in ("end_of_turn_delay", "transcription_delay", "llm_node_ttft", "tts_node_ttfb", "e2e_latency"):
            if m.get(key) is not None:
                turn[key] = round(float(m[key]), 3)
        turns.append(turn)
        if item.role == "assistant" and "e2e_latency" in turn:
            eot = turns[-2].get("end_of_turn_delay") if len(turns) > 1 else None
            # What the reply would have cost with the three steps strictly one after another.
            # Whatever the early start hid shows up as the difference; at 0 it hid nothing.
            serial = sum(
                v for v in (eot, turn.get("llm_node_ttft"), turn.get("tts_node_ttfb")) if v is not None
            )
            turn["hidden_by_early_start"] = round(max(serial - turn["e2e_latency"], 0.0), 3)
            logger.info(
                "reply after %.2fs (end of turn %.2fs, Gemini %.2fs, voice %.2fs, early start hid %.2fs): %s",
                turn["e2e_latency"],
                eot if eot is not None else float("nan"),
                turn.get("llm_node_ttft", float("nan")),
                turn.get("tts_node_ttfb", float("nan")),
                turn["hidden_by_early_start"],
                turn["text"][:80],
            )
        # Saved after every turn: on Windows the worker can abort when the caller hangs up,
        # before the shutdown callback runs.
        write_call()

    def write_call() -> tuple[Path, float | None, int]:
        CALLS_DIR.mkdir(exist_ok=True)
        gaps = [t["e2e_latency"] for t in turns if t["role"] == "assistant" and "e2e_latency" in t]
        summary = {
            "room": ctx.room.name,
            "to": phone,
            "stt": stt_name,
            "llm": llm_name,
            "silence_secs": SILENCE_SECS,
            "end_of_turn_secs": END_OF_TURN_SECS,
            "history_turns": HISTORY_TURNS,
            "script_chars": len(instructions),
            "median_gap_secs": round(statistics.median(gaps), 3) if gaps else None,
            "median_hidden_secs": (
                round(statistics.median(hidden), 3)
                if (hidden := [t["hidden_by_early_start"] for t in turns if "hidden_by_early_start" in t])
                else None
            ),
            "turns": turns,
        }
        path = CALLS_DIR / f"{ctx.room.name}.json"
        path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return path, summary["median_gap_secs"], len(gaps)

    async def save_call() -> None:
        name, median, replies = write_call()
        logger.info("saved %s: median gap %s s over %d replies", name.name, median, replies)

    ctx.add_shutdown_callback(save_call)

    await session.start(room=ctx.room, agent=agent)
    logger.info(
        "Priya test agent: STT %s, LLM %s, silence %.2fs + %.2fs, history %s turns, script %d chars",
        stt_name,
        llm_name,
        SILENCE_SECS,
        END_OF_TURN_SECS,
        HISTORY_TURNS or "all",
        len(instructions),
    )
    logger.info("voice speed: %s", speed if speed is not None else "the voice's own pace")

    if not phone:
        # Joined from the LiveKit playground or a browser: greet straight away.
        await session.say(greeting)
        return

    warming = asyncio.create_task(warm_up(llm, tts, instructions, greeting))
    try:
        await ctx.api.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                room_name=ctx.room.name,
                sip_trunk_id=await trunk_id(ctx.api),
                sip_call_to=phone,
                participant_identity=f"sip_{phone}",
                wait_until_answered=True,
            )
        )
    except api.TwirpError as err:
        logger.error("call to %s failed: %s (SIP status %s)", phone, err.message, err.metadata.get("sip_status_code"))
        await utils.aio.cancel_and_wait(warming)
        ctx.shutdown()
        return
    logger.info("call answered")
    # Priya speaks first, as on Cartesia, from the audio voiced while the phone rang, once the
    # call's audio is flowing. Sound before the answer (a caller tune) doesn't count.
    agent.heard_caller.clear()
    try:
        await asyncio.wait_for(agent.heard_caller.wait(), timeout=GREETING_WAIT_SECS)
    except asyncio.TimeoutError:
        pass
    try:
        frames = await asyncio.wait_for(warming, timeout=2)
    except Exception:  # noqa: BLE001 - a failed warm-up only costs speed; voice the greeting live
        logger.warning("warm-up didn't finish; voicing the greeting live", exc_info=True)
        frames = None
    if frames:
        await session.say(greeting, audio=replay(frames))
    else:
        await session.say(greeting)


if __name__ == "__main__":
    cli.run_app(server)
