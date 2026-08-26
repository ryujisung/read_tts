/**
 * Supertonic 음성 엔진. 기기 내장 speechSynthesis 를 대신해 상대 대사를 읽는다.
 *
 * 모델은 브라우저 안에서 돈다 — 대본이 네트워크로 나가지 않는다는 원칙은 그대로다.
 * WebGPU 가 있으면 쓰고, 없으면 WebAssembly 로 떨어진다.
 */
import * as ort from "onnxruntime-web";
import { loadOnnx, loadVoiceStyle, UnicodeProcessor, TextToSpeech, type VoiceStyleTensors } from "./helper.js";
import { fetchModel, isCached } from "./cache";
import {
  CONFIG_URL,
  INDEXER_URL,
  MODEL_BYTES,
  MODEL_URLS,
  TOTAL_MODEL_BYTES,
  voiceStyleUrl,
  type VoicePreset,
} from "./models";

export type Backend = "webgpu" | "wasm";

export interface LoadProgress {
  /** 0~1 */
  ratio: number;
  loaded: number;
  total: number;
  /** 전부 캐시에서 나왔으면 true — 진행률 UI 를 띄울 필요가 없다 */
  cached: boolean;
}

interface Loaded {
  tts: TextToSpeech;
  backend: Backend;
}

let loading: Promise<Loaded> | null = null;
let loaded: Loaded | null = null;
const styleCache = new Map<VoicePreset, VoiceStyleTensors>();

/** onnxruntime 의 wasm 런타임 위치. public/ort 에 복사해 둔다(scripts/copy-ort.mjs). */
function configureOrt() {
  ort.env.wasm.wasmPaths = "/ort/";
  // 교차 출처 격리를 켜지 않아 SharedArrayBuffer 가 없다. 스레드는 1개로 고정한다.
  ort.env.wasm.numThreads = 1;
}

async function createSessions(
  bytes: Record<keyof typeof MODEL_URLS, Uint8Array>,
): Promise<{ sessions: ort.InferenceSession[]; backend: Backend }> {
  const order = ["durationPredictor", "textEncoder", "vectorEstimator", "vocoder"] as const;

  // WebGPU 를 먼저 시도한다. 어느 모델 하나라도 거부당하면 통째로 wasm 으로 간다 —
  // 섞어 쓰면 텐서가 장치를 오가며 오히려 느려진다.
  try {
    const sessions = [];
    for (const k of order) {
      sessions.push(await loadOnnx(bytes[k], { executionProviders: ["webgpu"] }));
    }
    return { sessions, backend: "webgpu" };
  } catch {
    const sessions = [];
    for (const k of order) {
      sessions.push(await loadOnnx(bytes[k], { executionProviders: ["wasm"] }));
    }
    return { sessions, backend: "wasm" };
  }
}

/** 모델을 받아 세션을 연다. 여러 번 불러도 실제 작업은 한 번만 한다. */
export function load(onProgress?: (p: LoadProgress) => void): Promise<Loaded> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;

  const started = (async () => {
    configureOrt();

    const keys = ["durationPredictor", "textEncoder", "vectorEstimator", "vocoder"] as const;
    const progress: Record<string, number> = {};
    let allCached = true;

    const report = () => {
      const done = Object.values(progress).reduce((a, b) => a + b, 0);
      onProgress?.({
        ratio: Math.min(1, done / TOTAL_MODEL_BYTES),
        loaded: done,
        total: TOTAL_MODEL_BYTES,
        cached: allCached,
      });
    };

    const parts = await Promise.all(
      keys.map(async (k) => {
        const buf = await fetchModel(MODEL_URLS[k], MODEL_BYTES[k], (p) => {
          if (!p.cached) allCached = false;
          progress[k] = p.loaded;
          report();
        });
        return [k, buf] as const;
      }),
    );
    const bytes = Object.fromEntries(parts) as Record<keyof typeof MODEL_URLS, Uint8Array>;

    const [cfgs, indexer] = await Promise.all([
      fetch(CONFIG_URL).then((r) => r.json()),
      fetch(INDEXER_URL).then((r) => r.json()),
    ]);

    const { sessions, backend } = await createSessions(bytes);
    const [dp, textEnc, vectorEst, vocoder] = sessions;
    const tts = new TextToSpeech(cfgs, new UnicodeProcessor(indexer), dp, textEnc, vectorEst, vocoder);

    const done: Loaded = { tts, backend };
    loaded = done;
    return done;
  })();

  started.catch(() => {
    // 실패한 시도를 붙잡고 있으면 재시도가 영영 같은 오류를 받는다.
    loading = null;
  });

  loading = started;
  return started;
}

async function styleFor(preset: VoicePreset): Promise<VoiceStyleTensors> {
  const hit = styleCache.get(preset);
  if (hit) return hit;
  const style = await loadVoiceStyle([voiceStyleUrl(preset)]);
  styleCache.set(preset, style);
  return style;
}

export interface SynthOptions {
  /** 0.9~1.5 사이가 쓸 만하다. 기본 1.0 */
  speed?: number;
  /** 되돌리기 단계. 높을수록 좋고 느리다. 기본 8 */
  steps?: number;
}

export interface Synthesized {
  samples: Float32Array;
  sampleRate: number;
  /** 초 */
  duration: number;
}

/** 대사 한 줄을 소리로 만든다. 재생은 하지 않는다 — 미리 만들어 두려면 이쪽을 쓴다. */
export async function synthesize(
  text: string,
  preset: VoicePreset,
  opts: SynthOptions = {},
): Promise<Synthesized> {
  const { tts } = await load();
  const style = await styleFor(preset);
  const { wav, duration } = await tts.call(text, "ko", style, opts.steps ?? 8, opts.speed ?? 1.0);
  const len = Math.min(wav.length, Math.floor(tts.sampleRate * duration[0]));
  return { samples: wav.slice(0, len), sampleRate: tts.sampleRate, duration: duration[0] };
}

/** 이미 받아 둔 모델이 있는지 — 다운로드 안내를 띄울지 정할 때 쓴다. */
export function hasCachedModels(): Promise<boolean> {
  return isCached(Object.values(MODEL_URLS));
}

export function currentBackend(): Backend | null {
  return loaded?.backend ?? null;
}

/** 테스트에서 상태를 되돌리기 위한 것. */
export function _reset() {
  loaded = null;
  loading = null;
  styleCache.clear();
}
