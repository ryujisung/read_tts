import { describe, expect, it, vi } from "vitest";
import { startAutoRecognition, type AutoDeps } from "./stt";
import type { VadEvent } from "./vad";

/** 마이크와 음성인식을 가짜로 세워 두고, 말이 끝났을 때의 흐름만 본다. */
function harness(opts: { micFails?: boolean } = {}) {
  let emit: ((e: VadEvent) => void) | null = null;
  let level: ((n: number) => void) | undefined;
  const micStop = vi.fn();
  const recStop = vi.fn();
  const recAbort = vi.fn();
  let finishRec: ((text: string) => void) | null = null;
  let failRec: ((r: "unavailable" | "denied" | "no-speech" | "failed") => void) | null = null;
  let continuousUsed: boolean | null = null;
  let opened = 0;

  const deps: AutoDeps = {
    startMic: async (_vad, cb) => {
      if (opts.micFails) throw new Error("마이크 없음");
      emit = cb.onEvent;
      level = cb.onLevel;
      return { stop: micStop };
    },
    startRec: (cb, continuous) => {
      opened++;
      continuousUsed = continuous;
      finishRec = (t) => cb.onText(t);
      failRec = (r) => cb.onError(r);
      queueMicrotask(() => cb.onStart?.());
      return { stop: recStop, abort: recAbort };
    },
  };

  return {
    deps,
    micStop,
    recStop,
    recAbort,
    get continuousUsed() {
      return continuousUsed;
    },
    get opened() {
      return opened;
    },
    speechEnd: () => emit?.("speech_end"),
    timeout: () => emit?.("timeout"),
    feedLevel: (n: number) => level?.(n),
    finishRec: (t: string) => finishRec?.(t),
    failRec: (r: "unavailable" | "denied" | "no-speech" | "failed") => failRec?.(r),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("startAutoRecognition", () => {
  it("말이 끝나면 알아서 인식을 멈추고 텍스트를 넘긴다", async () => {
    const h = harness();
    const onText = vi.fn();
    startAutoRecognition({ onText, onError: vi.fn() }, h.deps);
    await tick();

    h.speechEnd();
    expect(h.recStop).toHaveBeenCalled();

    h.finishRec("여기 있을 줄 알았어");
    expect(onText).toHaveBeenCalledWith("여기 있을 줄 알았어");
  });

  it("말이 끝나면 마이크를 닫는다 — 내 차례가 아닌데 켜져 있으면 안 된다", async () => {
    const h = harness();
    startAutoRecognition({ onText: vi.fn(), onError: vi.fn() }, h.deps);
    await tick();
    h.speechEnd();
    h.finishRec("어떻게 알았어");
    expect(h.micStop).toHaveBeenCalled();
  });

  it("아무 말도 없이 시간이 지나면 못 알아들은 것으로 알린다", async () => {
    const h = harness();
    const onError = vi.fn();
    startAutoRecognition({ onText: vi.fn(), onError }, h.deps);
    await tick();
    h.timeout();
    h.finishRec("");
    expect(onError).toHaveBeenCalledWith("no-speech");
  });

  it("빈 텍스트가 오면 성공으로 넘기지 않는다", async () => {
    const h = harness();
    const onText = vi.fn();
    const onError = vi.fn();
    startAutoRecognition({ onText, onError }, h.deps);
    await tick();
    h.speechEnd();
    h.finishRec("   ");
    expect(onText).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("no-speech");
  });

  it("마이크를 못 열면 브라우저가 알아서 끊는 방식으로 떨어진다", async () => {
    const h = harness({ micFails: true });
    const onText = vi.fn();
    startAutoRecognition({ onText, onError: vi.fn() }, h.deps);
    await tick();

    // 이 경우엔 우리가 끊지 않는다 — 인식기가 스스로 끝낸다
    expect(h.continuousUsed).toBe(false);
    h.finishRec("모레");
    expect(onText).toHaveBeenCalledWith("모레");
  });

  it("마이크가 열렸을 때는 우리가 끊으므로 계속 듣기로 연다", async () => {
    const h = harness();
    startAutoRecognition({ onText: vi.fn(), onError: vi.fn() }, h.deps);
    await tick();
    expect(h.continuousUsed).toBe(true);
  });

  it("직접 확정하면 그 자리에서 인식을 멈춘다", async () => {
    const h = harness();
    const onText = vi.fn();
    const handle = startAutoRecognition({ onText, onError: vi.fn() }, h.deps);
    await tick();
    handle.finish();
    expect(h.recStop).toHaveBeenCalled();
    h.finishRec("고마워");
    expect(onText).toHaveBeenCalledWith("고마워");
  });

  it("줄이 바뀌어 중단하면 마이크를 닫고 아무것도 알리지 않는다", async () => {
    const h = harness();
    const onText = vi.fn();
    const onError = vi.fn();
    const handle = startAutoRecognition({ onText, onError }, h.deps);
    await tick();
    handle.abort();
    expect(h.micStop).toHaveBeenCalled();
    expect(h.recAbort).toHaveBeenCalled();

    h.finishRec("늦게 온 결과");
    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("인식이 거부되면 그대로 알리고 마이크를 닫는다", async () => {
    const h = harness();
    const onError = vi.fn();
    startAutoRecognition({ onText: vi.fn(), onError }, h.deps);
    await tick();
    h.failRec("denied");
    expect(onError).toHaveBeenCalledWith("denied");
    expect(h.micStop).toHaveBeenCalled();
  });

  it("음량을 그대로 흘려보낸다 — 듣고 있다는 표시에 쓴다", async () => {
    const h = harness();
    const onLevel = vi.fn();
    startAutoRecognition({ onText: vi.fn(), onError: vi.fn(), onLevel }, h.deps);
    await tick();
    h.feedLevel(0.42);
    expect(onLevel).toHaveBeenCalledWith(0.42);
  });
});

describe("인식기가 조급하게 끊을 때", () => {
  it("아직 말도 안 했는데 no-speech 가 오면 조용히 다시 연다", async () => {
    // 크롬은 5초쯤 조용하면 스스로 no-speech 를 던진다. 말할 시간을 뺏으면 안 된다.
    const h = harness();
    const onError = vi.fn();
    const onText = vi.fn();
    startAutoRecognition({ onText, onError }, h.deps);
    await tick();
    expect(h.opened).toBe(1);

    h.failRec("no-speech");
    await tick();

    expect(onError).not.toHaveBeenCalled();
    expect(h.opened).toBe(2);
  });

  it("다시 연 뒤에도 말이 끝나면 그대로 판정한다", async () => {
    const h = harness();
    const onText = vi.fn();
    startAutoRecognition({ onText, onError: vi.fn() }, h.deps);
    await tick();
    h.failRec("no-speech");
    await tick();

    h.speechEnd();
    h.finishRec("여기 있을 줄 알았어");
    expect(onText).toHaveBeenCalledWith("여기 있을 줄 알았어");
  });

  it("우리가 시간 초과로 끝낼 때는 못 알아들은 것으로 알린다", async () => {
    const h = harness();
    const onError = vi.fn();
    startAutoRecognition({ onText: vi.fn(), onError }, h.deps);
    await tick();
    h.timeout();
    h.finishRec("");
    expect(onError).toHaveBeenCalledWith("no-speech");
  });

  it("마이크가 없어 브라우저에 맡긴 경우엔 다시 열지 않는다", async () => {
    // 이때는 인식기의 판단이 곧 말 끝이라 되살리면 끝나지 않는다.
    const h = harness({ micFails: true });
    const onError = vi.fn();
    startAutoRecognition({ onText: vi.fn(), onError }, h.deps);
    await tick();
    h.failRec("no-speech");
    await tick();
    expect(h.opened).toBe(1);
    expect(onError).toHaveBeenCalledWith("no-speech");
  });

  it("중단한 뒤에는 다시 열지 않는다", async () => {
    const h = harness();
    const handle = startAutoRecognition({ onText: vi.fn(), onError: vi.fn() }, h.deps);
    await tick();
    handle.abort();
    h.failRec("no-speech");
    await tick();
    expect(h.opened).toBe(1);
  });
});
