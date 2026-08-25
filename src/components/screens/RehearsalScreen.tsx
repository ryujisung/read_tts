"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRehearsalRunner } from "../../hooks/useRehearsalRunner";
import { ROLE_VOICE_PALETTE } from "../../lib/audio/tts";
import { progress, window as rehearsalWindow } from "../../lib/rehearsal/machine";
import type { Setup, StoredScript } from "../../lib/storage";
import { Button } from "../ui";
import type { RunStats } from "./DoneScreen";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function RehearsalScreen({
  script,
  setup,
  onFinish,
  onExit,
}: {
  script: StoredScript;
  setup: Setup;
  onFinish: (stats: RunStats) => void;
  onExit: () => void;
}) {
  const others = useMemo(() => script.roles.filter((r) => r !== setup.myRole), [script.roles, setup.myRole]);
  const runner = useRehearsalRunner(
    { lines: script.lines, myRole: setup.myRole, start: setup.start, end: setup.end },
    {
      advanceMode: setup.advanceMode,
      styleFor: (role) => ROLE_VOICE_PALETTE[Math.max(0, others.indexOf(role)) % ROLE_VOICE_PALETTE.length],
    },
  );
  const { state, level, micError, effectiveMode } = runner;
  const w = rehearsalWindow(state);
  const prog = progress(state);

  // 가리기 해제는 줄 단위 — 다음 줄로 넘어가면 자동으로 다시 가려진다
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const revealed = revealedIndex === state.index;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedAt === null || state.status === "done") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [startedAt, state.status]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: stageRef.current.scrollHeight, behavior: "smooth" });
  }, [state.index]);

  useEffect(() => {
    if (state.status !== "done") return;
    onFinish({ elapsedMs: startedAt ? Date.now() - startedAt : 0, lineCount: prog.total });
    // onFinish는 화면 전환만 하므로 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const isMe = state.status === "me";
  const isAi = state.status === "ai";
  const isPaused = state.status === "paused";
  const running = state.status !== "idle" && state.status !== "done";
  const hideNow = isMe && setup.hideMyLines && !revealed;
  // 현재 줄 바로 앞 지문은 따로 보여 주므로 지난 줄 목록에서는 뺀다
  const pastVisible = w.past.slice(0, w.past.length - w.leadingDirections.length).slice(-4);

  return (
    <div className="shell !pb-3">
      <header className="flex items-center justify-between h-10 -mx-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            runner.stop();
            onExit();
          }}
        >
          ✕ 나가기
        </Button>
        <span className="text-sm text-muted tabular-nums">
          {prog.done} / {prog.total}
        </span>
        <span className="text-sm text-muted tabular-nums w-16 text-right">{fmt(elapsed)}</span>
      </header>
      <div className="h-1 rounded-full bg-line mt-1 overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }}
        />
      </div>

      <div ref={stageRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-end gap-3 py-5">
        {pastVisible.map((l, i) => (
          <p key={`${state.index}-${i}`} className="script-text text-sm text-muted/70 leading-relaxed">
            {l.type === "dialogue" ? (
              <>
                <span className={l.role === setup.myRole ? "text-me/60" : "text-accent/60"}>{l.role}</span>{" "}
                {l.text}
              </>
            ) : (
              <span className="italic">— {l.text}</span>
            )}
          </p>
        ))}

        {w.leadingDirections.map((d, i) => (
          <p key={i} className="script-text text-sm italic text-muted">
            — {d}
          </p>
        ))}

        {w.current && (
          <div
            className={`rounded-3xl p-5 border transition-colors ${
              isMe ? "bg-me/10 border-me/40" : isPaused ? "bg-surface border-line" : "bg-accent/10 border-accent/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold ${isMe ? "text-me" : "text-accent"}`}>
                {isMe ? `${w.current.role} · 내 차례` : w.current.role}
              </span>
              {isAi && (
                <span className="flex items-end gap-0.5 h-4" aria-label="읽는 중">
                  <i className="bar" />
                  <i className="bar" />
                  <i className="bar" />
                  <i className="bar" />
                </span>
              )}
            </div>
            <p
              className={`script-text mt-3 text-[1.45rem] leading-[1.5] font-medium ${hideNow ? "blur-line" : ""}`}
              onClick={() => hideNow && setRevealedIndex(state.index)}
            >
              {w.current.text}
            </p>
            {hideNow && (
              <button type="button" onClick={() => setRevealedIndex(state.index)} className="mt-3 text-sm text-me underline underline-offset-4">
                원문 보기
              </button>
            )}
          </div>
        )}

        {w.next && state.status !== "done" && (
          <p className="script-text text-sm text-muted/60 truncate">
            다음 · <span className={w.next.role === setup.myRole ? "text-me/60" : ""}>{w.next.role}</span> {w.next.text}
          </p>
        )}
      </div>

      <footer className="pt-2">
        <div className="h-8 flex items-center justify-center text-sm text-muted">
          {state.status === "idle" && (effectiveMode === "silence" ? "시작하면 마이크 권한을 물어봐요" : "내 차례엔 넘기기를 눌러요")}
          {isAi && "상대가 말하는 중"}
          {isMe && effectiveMode === "silence" && (
            <span className="flex items-center gap-2">
              <span className="pulse-me inline-block w-2.5 h-2.5 rounded-full bg-me" />
              듣고 있어요
              <span className="inline-block w-16 h-1.5 rounded-full bg-line overflow-hidden">
                <span className="block h-full bg-me" style={{ width: `${Math.min(100, level * 900)}%` }} />
              </span>
            </span>
          )}
          {isMe && effectiveMode === "manual" && "다 말하면 넘기기"}
          {isPaused && "일시정지"}
        </div>
        {micError && <p className="text-xs text-danger text-center mb-2">{micError}</p>}

        {state.status === "idle" ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              setStartedAt(Date.now());
              void runner.start();
            }}
          >
            시작
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={runner.togglePause} disabled={!running && !isPaused}>
              {isPaused ? "이어가기" : "일시정지"}
            </Button>
            <Button className="flex-1" onClick={runner.next} disabled={state.status === "done"}>
              넘기기
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}
