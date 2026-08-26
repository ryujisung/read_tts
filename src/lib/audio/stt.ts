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

export function startRecognition(cb: SttCallbacks): Listening {
  const C = ctor();
  if (!C) {
    cb.onError("unavailable");
    return { stop() {}, abort() {} };
  }
  const r = new C();
  r.lang = "ko-KR";
  r.interimResults = true;
  r.continuous = true;
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
