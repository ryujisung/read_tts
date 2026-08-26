"use client";

/**
 * Supertonic 엔진 검증용 화면. Next.js 안에서 onnxruntime-web 이 실제로 도는지,
 * 한국어 대사가 제대로 나오는지, 얼마나 걸리는지를 눈으로 본다.
 * 통합이 끝나면 지운다.
 */
import { useCallback, useRef, useState } from "react";
import { load, synthesize, currentBackend, type LoadProgress } from "../../lib/audio/supertonic/engine";
import { playSynthesized, unlockAudio } from "../../lib/audio/supertonic/play";
import { VOICE_PRESETS, TOTAL_MODEL_BYTES, type VoicePreset } from "../../lib/audio/supertonic/models";

const LINES = [
  "여기 있을 줄 알았어.",
  "왜 말 안 했어. 오디션 떨어진 거.",
  "달라지지. 나는 알잖아, 네가 그거 얼마나 준비했는지.",
  "그럼 오늘은 내려가자. 대본은 내가 상대역 해줄게.",
];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)}MB`;

export default function TtsPoc() {
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [preset, setPreset] = useState<VoicePreset>("F1");
  const [text, setText] = useState(LINES[2]);
  const abort = useRef<AbortController | null>(null);

  const say = (m: string) => setLog((l) => [...l, m]);

  const handleLoad = useCallback(async () => {
    unlockAudio();
    setBusy(true);
    const t0 = performance.now();
    try {
      await load(setProgress);
      setReady(true);
      say(`모델 준비 완료 — ${((performance.now() - t0) / 1000).toFixed(1)}초, 백엔드 ${currentBackend()}`);
    } catch (e) {
      say(`실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSpeak = useCallback(async () => {
    unlockAudio();
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    try {
      const t0 = performance.now();
      const audio = await synthesize(text, preset);
      const gen = (performance.now() - t0) / 1000;
      say(`${preset} · 오디오 ${audio.duration.toFixed(2)}초 / 생성 ${gen.toFixed(2)}초 · RTF ${(gen / audio.duration).toFixed(3)}`);
      await playSynthesized(audio, ac.signal);
    } catch (e) {
      say(`실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [text, preset]);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 20 }}>Supertonic 엔진 검증</h1>

      {!ready && (
        <section style={{ margin: "16px 0" }}>
          <button onClick={handleLoad} disabled={busy} style={btn}>
            {busy ? "받는 중…" : `모델 받기 (${mb(TOTAL_MODEL_BYTES)})`}
          </button>
          {progress && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 6, background: "#e5e5e5", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress.ratio * 100}%`, background: "#b8532a" }} />
              </div>
              <small>
                {mb(progress.loaded)} / {mb(progress.total)} {progress.cached ? "(캐시)" : ""}
              </small>
            </div>
          )}
        </section>
      )}

      {ready && (
        <section style={{ margin: "16px 0", display: "grid", gap: 10 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={{ padding: 8, fontSize: 15, fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LINES.map((l) => (
              <button key={l} onClick={() => setText(l)} style={{ ...btn, padding: "4px 8px", fontSize: 12 }}>
                {l.slice(0, 12)}…
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VOICE_PRESETS.map((p) => (
              <button key={p} onClick={() => setPreset(p)} style={{ ...btn, padding: "4px 10px", fontWeight: p === preset ? 700 : 400 }}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={handleSpeak} disabled={busy} style={{ ...btn, padding: "10px 16px" }}>
            {busy ? "만드는 중…" : "읽기"}
          </button>
        </section>
      )}

      <pre style={{ background: "#f5f4f2", padding: 12, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", minHeight: 60 }}>
        {log.join("\n") || "여기에 결과가 쌓인다."}
      </pre>
    </main>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  font: "inherit",
};
