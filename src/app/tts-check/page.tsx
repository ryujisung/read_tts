"use client";

/**
 * 브라우저에서 만든 소리가 파형 단계에서 깨지는지 보는 화면.
 * Node(CPU)로 뽑은 기준값과 나란히 놓고 비교한다. 원인을 잡으면 지운다.
 */
import { useCallback, useRef, useState } from "react";
import { load, synthesize, currentBackend, currentVariant, _reset, type Backend } from "../../lib/audio/supertonic/engine";
import { playSynthesized, unlockAudio } from "../../lib/audio/supertonic/play";
import { startRecognition, type Listening } from "../../lib/audio/stt";
import { writeWavFile } from "../../lib/audio/supertonic/helper.js";

/** 한국어는 120자를 넘으면 조각으로 나뉘고 사이에 0.3초 무음이 들어간다 */
const CHUNK_AT = 120;

const LINES = [
  { name: "짧게", text: "여기 있을 줄 알았어." },
  { name: "보통", text: "달라지지. 나는 알잖아, 네가 그거 얼마나 준비했는지." },
  {
    name: "길게",
    text:
      "왜 말 안 했어. 오디션 떨어진 거. 말하면 뭐가 달라지냐고 했지만 나는 달라진다고 생각해. " +
      "네가 그거 얼마나 준비했는지 아니까, 그래서 더 묻고 싶었어.",
  },
  {
    name: "아주 길게 (조각 나뉨)",
    text:
      "왜 말 안 했어. 오디션 떨어진 거. 말하면 뭐가 달라지냐고 했지만 나는 달라진다고 생각해. " +
      "네가 그거 얼마나 준비했는지 아니까, 그래서 더 묻고 싶었어. 그럼 오늘은 그만 내려가자. " +
      "대본은 내가 상대역 해줄게. 나 연기 못하는 거 알아. 그래도 혼자 하는 것보단 낫잖아. 가자, 춥다.",
  },
];

/** Node(CPU) 기준: maxSlew 0.11 / 도약 0개 / 연속 0 최대 251 */
function metrics(a: Float32Array) {
  let maxSlew = 0;
  let jumps = 0;
  let zeroRun = 0;
  let maxZeroRun = 0;
  let bad = 0;
  for (let i = 1; i < a.length; i++) {
    if (!Number.isFinite(a[i])) bad++;
    const d = Math.abs(a[i] - a[i - 1]);
    if (d > maxSlew) maxSlew = d;
    if (d > 0.15) jumps++;
    if (a[i] === 0) {
      zeroRun++;
      if (zeroRun > maxZeroRun) maxZeroRun = zeroRun;
    } else zeroRun = 0;
  }
  return { maxSlew, jumps, maxZeroRun, bad, n: a.length };
}

export default function TtsCheck() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const held = useRef<Map<string, Awaited<ReturnType<typeof synthesize>>>>(new Map());
  const [pick, setPick] = useState(1);
  const line = LINES[pick];
  const micRef = useRef<Listening | null>(null);

  const say = (m: string) => setLog((l) => [...l, m]);

  const run = useCallback(async (prefer: Backend) => {
    unlockAudio();
    setBusy(true);
    try {
      _reset();
      say(`--- ${prefer} 준비 중…`);
      await load(undefined, prefer);
      const chunks = Math.max(1, Math.ceil(line.text.length / CHUNK_AT));
      say(
        `준비됨 ${currentBackend()} + ${currentVariant()} · 대사 ${line.text.length}자` +
          (chunks > 1 ? ` → ${chunks}조각으로 나뉨 (사이에 0.3초 무음이 들어간다)` : " → 한 조각"),
      );
      const a = await synthesize(line.text, "F1");
      held.current.set(prefer, a);
      const m = metrics(a.samples);
      say(
        `${prefer}  n=${m.n} sr=${a.sampleRate}\n` +
          `   maxSlew=${m.maxSlew.toFixed(4)} (기준 0.11)  급격한도약=${m.jumps} (기준 0)  연속0최대=${m.maxZeroRun} (기준 251)  비정상=${m.bad}`,
      );
    } catch (e) {
      say(`실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [line]);

  /** AudioContext 로 재생 — 지금 앱이 쓰는 길 */
  const play = (k: string) => {
    const a = held.current.get(k);
    if (a) void playSynthesized(a);
  };

  /**
   * 같은 소리를 WAV 로 묶어 보통 오디오 재생기로 들려준다.
   * 이쪽이 멀쩡하고 위쪽만 끊기면 범인은 합성이 아니라 AudioContext 다.
   */
  const playAsWav = (k: string) => {
    const a = held.current.get(k);
    if (!a) return;
    const buf = writeWavFile(a.samples, a.sampleRate);
    const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    const el = new Audio(url);
    el.onended = () => URL.revokeObjectURL(url);
    void el.play();
    say(`${k}: WAV 로 재생`);
  };

  /** 마이크를 연 채로 재생해 본다 — 앱에서 실제로 벌어지는 상황이다 */
  const playWithMic = (k: string) => {
    const a = held.current.get(k);
    if (!a) return;
    say("마이크 여는 중…");
    micRef.current?.abort();
    micRef.current = startRecognition({
      onStart: () => {
        say("마이크 열림 — 0.6초 뒤 재생");
        setTimeout(() => void playSynthesized(a), 600);
      },
      onText: () => {},
      onError: (r) => say(`마이크 오류 ${r}`),
    });
    // 재생이 끝날 즈음 마이크를 닫는다 — 닫는 순간이 겹치는 것도 같이 본다
    setTimeout(() => {
      micRef.current?.abort();
      micRef.current = null;
      say("마이크 닫음");
    }, 600 + a.duration * 1000 + 400);
  };

  const btn: React.CSSProperties = {
    padding: "9px 14px",
    border: "1px solid #ccc",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    font: "inherit",
    fontSize: 14,
  };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 19 }}>파형 점검</h1>
      <p style={{ fontSize: 14, color: "#666" }}>같은 대사를 두 방식으로 만들어 파형을 재고, 각각 들어 봅니다.</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 4px" }}>
        {LINES.map((l, i) => (
          <button
            key={l.name}
            onClick={() => setPick(i)}
            style={{
              padding: "6px 11px",
              border: "1px solid",
              borderColor: i === pick ? "#0a79fb" : "#ccc",
              color: i === pick ? "#0a79fb" : "inherit",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
              font: "inherit",
              fontSize: 13,
            }}
          >
            {l.name} · {l.text.length}자
          </button>
        ))}
      </div>
      <p style={{ fontSize: 13, color: "#888", margin: "6px 0 0" }}>“{line.text}”</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <button style={btn} disabled={busy} onClick={() => void run("webgpu")}>
          ① WebGPU 로 만들기
        </button>
        <button style={btn} disabled={busy} onClick={() => play("webgpu")}>
          ①-A 지금 방식으로 듣기
        </button>
        <button style={btn} disabled={busy} onClick={() => playAsWav("webgpu")}>
          ①-B WAV 로 듣기
        </button>
        <button style={btn} disabled={busy} onClick={() => void run("wasm")}>
          ② WASM 으로 만들기
        </button>
        <button style={btn} disabled={busy} onClick={() => play("wasm")}>
          ②-A 지금 방식으로 듣기
        </button>
        <button style={btn} disabled={busy} onClick={() => playAsWav("wasm")}>
          ②-B WAV 로 듣기
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 16px" }}>
        <button style={{ ...btn, borderColor: "#0a79fb", color: "#0a79fb" }} disabled={busy} onClick={() => playWithMic("webgpu")}>
          ①-C 마이크 켠 채로 듣기
        </button>
        <button
          style={{ ...btn, borderColor: "#b8532a", color: "#b8532a" }}
          disabled={busy}
          onClick={() => {
            const a = held.current.get("webgpu");
            if (!a) return;
            say("재생하면서 동시에 다른 대사를 합성한다 — 앱에서 실제로 겹치는 상황");
            void playSynthesized(a);
            void synthesize(LINES[3].text, "M1").then(() => say("동시 합성 끝"));
          }}
        >
          ①-D 재생 중에 합성 겹치기
        </button>
      </div>
      <pre style={{ background: "#f5f4f2", padding: 12, borderRadius: 8, fontSize: 12.5, whiteSpace: "pre-wrap", minHeight: 200 }}>
        {log.join("\n") || "①을 먼저 눌러 만들고 들어보세요. 그다음 ②."}
      </pre>
    </main>
  );
}
