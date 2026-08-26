"use client";

/**
 * 상태머신 + TTS + 마이크를 잇는 러너.
 *  ai  → 상대 대사를 읽고 끝나면 advance
 *  me  → myTurn이 "silence"면 마이크를 켜고 말이 끝나면 advance,
 *        "manual"이면 버튼을, "wait"(암기 대조)면 화면이 next()를 부를 때까지 기다린다
 * 상태가 바뀌면 진행 중이던 TTS·마이크는 항상 정리한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { startListening, type MicListener } from "../lib/audio/mic";
import { cancelSpeech, speak, unlockTts, type VoiceStyle } from "../lib/audio/tts";
import { DEFAULT_VAD } from "../lib/audio/vad";
import {
  advance,
  begin,
  createRehearsal,
  pause,
  resume,
  type RehearsalConfig,
  type RehearsalState,
} from "../lib/rehearsal/machine";
import type { DialogueLine } from "../lib/script/parse";

export type MyTurnMode = "silence" | "manual" | "wait";

export interface RunnerOptions {
  myTurn: MyTurnMode;
  styleFor: (role: string) => VoiceStyle;
}

const GAP_BEFORE_AI_MS = 350;
const GAP_BEFORE_MIC_MS = 250;

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export function useRehearsalRunner(cfg: RehearsalConfig, opts: RunnerOptions) {
  const [state, setState] = useState<RehearsalState>(() => createRehearsal(cfg));
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [myTurn, setMyTurn] = useState<MyTurnMode>(opts.myTurn);
  const abortRef = useRef<AbortController | null>(null);
  const micRef = useRef<MicListener | null>(null);
  const styleForRef = useRef(opts.styleFor);
  useEffect(() => {
    styleForRef.current = opts.styleFor;
  });

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    cancelSpeech();
  }, []);

  useEffect(() => {
    cleanup();
    if (state.status === "ai") {
      const line = state.lines[state.index] as DialogueLine;
      const ac = new AbortController();
      abortRef.current = ac;
      (async () => {
        await delay(GAP_BEFORE_AI_MS, ac.signal);
        if (ac.signal.aborted) return;
        await speak(line.text, styleForRef.current(line.role), ac.signal);
        if (ac.signal.aborted) return;
        setState((s) => (s.status === "ai" ? advance(s) : s));
      })();
    } else if (state.status === "me" && myTurn === "silence") {
      const ac = new AbortController();
      abortRef.current = ac;
      (async () => {
        await delay(GAP_BEFORE_MIC_MS, ac.signal);
        if (ac.signal.aborted) return;
        try {
          const mic = await startListening(DEFAULT_VAD, {
            onLevel: setLevel,
            onEvent: (ev) => {
              if (ev === "speech_end" || ev === "timeout") {
                setState((s) => (s.status === "me" ? advance(s) : s));
              }
            },
          });
          if (ac.signal.aborted) {
            mic.stop();
            return;
          }
          micRef.current = mic;
        } catch {
          setMicError("마이크를 쓸 수 없어서 버튼으로 넘기는 방식으로 진행해요.");
          setMyTurn("manual");
        }
      })();
    }
    return cleanup;
  }, [state, myTurn, cleanup]);

  const start = useCallback(async () => {
    unlockTts();
    if (myTurn === "silence") {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        setMicError("마이크 권한이 없어서 버튼으로 넘기는 방식으로 진행해요.");
        setMyTurn("manual");
      }
    }
    setState((s) => begin(s));
  }, [myTurn]);

  const togglePause = useCallback(() => {
    setState((s) => (s.status === "paused" ? resume(s) : pause(s)));
  }, []);

  const next = useCallback(() => {
    setState((s) => (s.status === "paused" ? advance({ ...s, status: s.resumeTo ?? "ai" }) : advance(s)));
  }, []);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { state, level, micError, myTurn, start, togglePause, next, stop };
}
