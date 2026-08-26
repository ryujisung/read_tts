/**
 * 브라우저 음성인식(SpeechRecognition) 래퍼 — 암기 대조 전용.
 * ⚠ 말소리가 브라우저 벤더 서버로 간다. 화면에서 그 사실을 알린다.
 * 결과 텍스트는 판정에 쓰고 즉시 버린다 — 저장하지 않는다.
 *
 * 인앱 브라우저(iOS WKWebView)는 객체만 있고 동작하지 않으므로
 * 기능 감지가 아니라 실제 start()와 타임아웃으로 판정한다.
 */

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function sttAvailable(): boolean {
  return ctor() !== null;
}

export interface Listening {
  /** 멈추고 지금까지 인식된 텍스트를 받는다 */
  stop(): void;
  abort(): void;
}

export interface SttCallbacks {
  onStart?: () => void;
  onText: (text: string) => void;
  onError: (reason: "unavailable" | "denied" | "no-speech" | "failed") => void;
}

const START_TIMEOUT_MS = 2500;

export function startRecognition(cb: SttCallbacks, continuous = true): Listening {
  const C = ctor();
  if (!C) {
    cb.onError("unavailable");
    return { stop() {}, abort() {} };
  }
  const r = new C();
  r.lang = "ko-KR";
  r.interimResults = true;
  // 우리가 말 끝을 판단할 때는 계속 듣고, 브라우저에 맡길 때는 스스로 끊게 둔다.
  r.continuous = continuous;
  r.maxAlternatives = 1;
  let text = "";
  let started = false;
  let finished = false;
  const timer = setTimeout(() => {
    if (!started && !finished) {
      finished = true;
      try {
        r.abort();
      } catch {}
      cb.onError("unavailable");
    }
  }, START_TIMEOUT_MS);
  r.onstart = () => {
    started = true;
    clearTimeout(timer);
    cb.onStart?.();
  };
  r.onresult = (e) => {
    let s = "";
    for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
    text = s;
  };
  r.onerror = (e) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    const reason = e.error === "not-allowed" || e.error === "service-not-allowed" ? "denied" : e.error === "no-speech" ? "no-speech" : "failed";
    cb.onError(reason);
  };
  r.onend = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cb.onText(text.trim());
    text = "";
  };
  try {
    r.start();
  } catch {
    finished = true;
    clearTimeout(timer);
    cb.onError("failed");
  }
  return {
    stop() {
      try {
        r.stop();
      } catch {}
    },
    abort() {
      finished = true;
      clearTimeout(timer);
      try {
        r.abort();
      } catch {}
    },
  };
}


// ─── 말이 끝나면 알아서 판정하기 ──────────────────────────────────

import { startListening, type MicListener } from "./mic";
import { DEFAULT_VAD, type VadEvent, type VadOptions } from "./vad";

export interface AutoListening {
  /** 다 말했는데 기다리기 싫을 때 — 지금까지 말한 것으로 확정한다 */
  finish(): void;
  abort(): void;
}

export interface AutoSttCallbacks {
  onListening?: () => void;
  /** 0~1 음량. 듣고 있다는 표시에 쓴다 */
  onLevel?: (rms: number) => void;
  onText: (text: string) => void;
  onError: (reason: "unavailable" | "denied" | "no-speech" | "failed") => void;
}

/** 테스트에서 마이크와 인식기를 갈아 끼우기 위한 자리. */
export interface AutoDeps {
  startMic: (
    opts: VadOptions,
    cb: { onEvent: (e: VadEvent) => void; onLevel?: (n: number) => void },
  ) => Promise<MicListener>;
  startRec: (cb: SttCallbacks, continuous: boolean) => Listening;
}

const REAL_DEPS: AutoDeps = { startMic: startListening, startRec: startRecognition };

/**
 * 누르고 있지 않아도 된다 — 말이 끝나면 알아서 맞춰본다.
 *
 * 말 끝은 음량으로 본다(침묵 1.8초). 브라우저 인식기에 맡기면 끊는 시점을 정할 수
 * 없어서, 대사 중간의 호흡에서 잘린다. 마이크를 따로 열 수 없는 기기에서는
 * 어쩔 수 없이 인식기가 스스로 끊게 둔다.
 *
 * 마이크는 판정이 끝나면 바로 닫는다. 내 차례가 아닌데 켜져 있으면 안 된다.
 */
export function startAutoRecognition(cb: AutoSttCallbacks, deps: AutoDeps = REAL_DEPS): AutoListening {
  let mic: MicListener | null = null;
  let rec: Listening | null = null;
  let done = false;

  const closeMic = () => {
    mic?.stop();
    mic = null;
  };

  const settleText = (text: string) => {
    if (done) return;
    done = true;
    closeMic();
    const t = text.trim();
    // 빈 결과를 성공으로 넘기면 대사를 말하지 않았는데 통과한 것이 된다.
    if (t) cb.onText(t);
    else cb.onError("no-speech");
  };

  const settleError = (reason: Parameters<AutoSttCallbacks["onError"]>[0]) => {
    if (done) return;
    done = true;
    closeMic();
    cb.onError(reason);
  };

  /**
   * 우리가 말 끝을 판단하는 동안 인식기가 먼저 포기하면 조용히 다시 연다.
   *
   * 크롬은 5초쯤 조용하면 스스로 no-speech 를 던진다. 대사를 떠올리는 사이에
   * 세션이 죽으면 말할 기회를 뺏는 셈이다. 진짜 끝은 침묵 감지가 정한다.
   */
  const openRec = (continuous: boolean) => {
    rec = deps.startRec(
      {
        onStart: () => {
          if (!done) cb.onListening?.();
        },
        onText: settleText,
        onError: (reason) => {
          if (done) return;
          if (reason === "no-speech" && continuous) {
            openRec(true);
            return;
          }
          settleError(reason);
        },
      },
      continuous,
    );
  };

  void (async () => {
    try {
      mic = await deps.startMic(DEFAULT_VAD, {
        onEvent: (e) => {
          if (done) return;
          // 말이 끝났거나 아무 말도 없었다 — 어느 쪽이든 인식기를 멈춰 결과를 받는다.
          if (e === "speech_end" || e === "timeout") rec?.stop();
        },
        onLevel: (n) => {
          if (!done) cb.onLevel?.(n);
        },
      });
      if (done) {
        closeMic();
        return;
      }
      openRec(true);
    } catch {
      // 마이크를 따로 못 열면 인식기가 스스로 끊게 둔다.
      if (!done) openRec(false);
    }
  })();

  return {
    finish() {
      rec?.stop();
    },
    abort() {
      done = true;
      closeMic();
      rec?.abort();
      rec = null;
    },
  };
}
