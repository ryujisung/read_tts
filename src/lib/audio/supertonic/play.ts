/**
 * 합성된 소리를 재생한다. speechSynthesis 와 같은 약속을 지킨다 —
 * 다 읽으면 resolve, 중간에 끊기면 조용히 resolve(reject 하지 않는다).
 */
import type { Synthesized } from "./engine";

let ctx: AudioContext | null = null;

/** iOS 는 사용자 제스처 안에서 한 번 열어 줘야 그 뒤 자동 재생이 된다. 버튼 핸들러에서 부른다. */
export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state === "suspended") void c.resume();
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function playSynthesized(audio: Synthesized, signal?: AbortSignal): Promise<void> {
  const c = getContext();
  if (!c || signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const buf = c.createBuffer(1, audio.samples.length, audio.sampleRate);
    // 채널에 직접 써 넣는다. copyToChannel 은 공유 버퍼를 받지 않으므로 채널 뷰에 set 한다.
    buf.getChannelData(0).set(audio.samples);

    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", onAbort);
      try {
        src.stop();
      } catch {
        // 이미 끝났으면 stop 이 던진다. 알릴 것이 없다.
      }
      src.disconnect();
      resolve();
    };
    const onAbort = () => finish();

    src.onended = finish;
    signal?.addEventListener("abort", onAbort);

    void c.resume().then(() => src.start());
  });
}
