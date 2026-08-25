/**
 * 기기 내장 음성(speechSynthesis) 래퍼. 대사 텍스트는 기기 안의 음성 엔진으로 간다 —
 * 원격 음성밖에 없는 기기에서는 브라우저 음성 서비스로 전달되므로 `isRemoteOnly()`로 알린다.
 */
import { speakableText } from "../script/parse";

export interface VoiceStyle {
  rate: number;
  pitch: number;
}

/** 배역 순서대로 돌려 쓰는 목소리 팔레트 (같은 엔진에서 서로 구분되게) */
export const ROLE_VOICE_PALETTE: VoiceStyle[] = [
  { rate: 1.0, pitch: 1.0 },
  { rate: 0.92, pitch: 1.3 },
  { rate: 1.08, pitch: 0.8 },
  { rate: 0.96, pitch: 1.5 },
  { rate: 1.15, pitch: 0.65 },
];

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function getKoreanVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().split(/[-_]/)[0] === "ko")
    .sort((a, b) => Number(b.localService) - Number(a.localService));
}

/** 한국어 음성이 있는데 전부 원격이면 true — 화면에서 알려 준다 */
export function isRemoteOnly(): boolean {
  const voices = getKoreanVoices();
  return voices.length > 0 && voices.every((v) => !v.localService);
}

/** Chrome은 getVoices()가 처음엔 빈 배열이라 voiceschanged를 기다린다 */
export function waitForVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = getKoreanVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(getKoreanVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/** iOS는 사용자 제스처 안에서 한 번 speak()해야 그 뒤 자동 재생이 된다. 버튼 핸들러에서 부른다. */
export function unlockTts() {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function cancelSpeech() {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
}

/**
 * 한 대사를 읽고 끝나면 resolve. signal이 abort되면 즉시 취소하고 reject 없이 resolve한다.
 * Chrome은 15초 넘는 발화를 조용히 끊으므로 pause/resume 핑을 돈다.
 */
export function speak(text: string, style: VoiceStyle, signal?: AbortSignal): Promise<void> {
  const body = speakableText(text);
  if (!ttsSupported() || !body) return Promise.resolve();
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(body);
    const voice = getKoreanVoices()[0];
    if (voice) u.voice = voice;
    u.lang = "ko-KR";
    u.rate = style.rate;
    u.pitch = style.pitch;

    let finished = false;
    let ping: ReturnType<typeof setInterval> | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (ping) clearInterval(ping);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      synth.cancel();
      finish();
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);

    u.onend = finish;
    u.onerror = finish;
    synth.cancel();
    synth.speak(u);
    ping = setInterval(() => {
      if (!synth.speaking) return;
      synth.pause();
      synth.resume();
    }, 10000);
  });
}
