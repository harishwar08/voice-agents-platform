"use client";

import { useEffect, useRef, useState } from "react";

export type Demo = {
  category: string;
  title: string;
  description: string;
  /** Gradient for the card header. */
  gradient: string;
  /** Omitted when no recording exists yet. */
  src?: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function DemoCard({ demo }: { demo: Demo }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrent(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => setCurrent(0);
    const onError = () => setFailed(true);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Starting one recording stops any other already playing on the page.
  useEffect(() => {
    function onOtherPlay(event: Event) {
      const audio = audioRef.current;
      if (audio && event.target !== audio) audio.pause();
    }
    document.addEventListener("play", onOtherPlay, true);
    return () => document.removeEventListener("play", onOtherPlay, true);
  }, []);

  function seekTo(clientX: number) {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
    setCurrent(audio.currentTime);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) seekTo(event.clientX);
  }

  const progress = duration ? `${(current / duration) * 100}%` : "0%";
  const available = Boolean(demo.src) && !failed;

  const status = !demo.src
    ? "Recording soon"
    : failed
      ? "Unavailable"
      : duration
        ? `${formatTime(current)} / ${formatTime(duration)}`
        : "—";

  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border border-[oklch(0.91_0.01_75)] bg-white shadow-[0_1px_2px_oklch(0.2_0.01_60/0.04)]">
      <div
        className="flex h-[132px] items-end px-[22px] pb-[18px]"
        style={{ background: demo.gradient }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-white">
          {demo.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-[22px] pb-[22px] pt-6">
        <div>
          <h3 className="text-[19px] font-semibold tracking-[-0.015em] text-[oklch(0.2_0.012_60)]">
            {demo.title}
          </h3>
          <p className="mt-2 text-[14.5px] leading-[1.6] text-[oklch(0.44_0.012_60)]">
            {demo.description}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-[14px]">
          <div
            ref={trackRef}
            onPointerDown={available ? onPointerDown : undefined}
            onPointerMove={available ? onPointerMove : undefined}
            className={`relative -my-2.5 py-2.5 touch-none ${available ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="h-1 rounded-full bg-[oklch(0.93_0.008_75)]">
              <div
                className="h-1 rounded-full bg-[oklch(0.2_0.012_60)]"
                style={{ width: progress }}
              />
            </div>
            {available ? (
              <div
                className="pointer-events-none absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[oklch(0.2_0.012_60)] shadow-[0_0_0_3px_white,0_1px_3px_oklch(0.2_0.01_60/0.35)]"
                style={{ left: progress }}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 gap-y-2">
            <button
              type="button"
              disabled={!available}
              onClick={() => void audioRef.current?.play()}
              className="rounded-full bg-[oklch(0.18_0.01_60)] px-[22px] py-[11px] text-sm font-medium text-[oklch(0.99_0.004_85)] transition hover:bg-[oklch(0.28_0.02_55)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Play
            </button>
            <button
              type="button"
              disabled={!available}
              onClick={() => audioRef.current?.pause()}
              className="rounded-full border border-[oklch(0.88_0.01_75)] bg-white px-[22px] py-[11px] text-sm font-medium text-[oklch(0.24_0.012_60)] transition hover:bg-[oklch(0.96_0.008_75)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Pause
            </button>
            <span className="ml-auto font-mono text-xs text-[oklch(0.56_0.015_60)]">
              {status}
            </span>
          </div>
        </div>

        {demo.src ? <audio ref={audioRef} src={demo.src} preload="metadata" /> : null}
      </div>
    </article>
  );
}
