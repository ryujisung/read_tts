/**
 * Supertonic 3 모델 자산의 출처.
 *
 * 큰 가중치는 int8 양자화본(합계 약 138MB)을 쓴다 — fp32 380MB 대비 64% 작고,
 * 귀로 구분되는 열화가 없었다. 발음을 담당하는 text_encoder / duration_predictor 는
 * 양자화 대상이 아니라 fp32 그대로라, 줄어든 건 음색 쪽 정밀도뿐이다.
 *
 * 파일은 저장소에 넣지 않고 HuggingFace CDN 에서 직접 받는다. CORS 가 열려 있고
 * range 요청도 되므로 우리 쪽 호스팅 비용이 0이다. 받은 뒤에는 Cache API 에 넣어
 * 두 번째 실행부터는 네트워크를 타지 않는다.
 */

/** 양자화된 가중치 — sherpa-onnx 가 재패키징한 것. tts.json 이 원본과 동일해 런타임 호환된다. */
const INT8 = "https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/main";
/** 설정·문자 인덱서·보이스 프리셋 — 원본 저장소. 전부 합쳐 400KB 남짓이라 양자화와 무관하다. */
const BASE = "https://huggingface.co/Supertone/supertonic-3/resolve/main";

export const MODEL_URLS = {
  durationPredictor: `${INT8}/duration_predictor.int8.onnx`,
  textEncoder: `${INT8}/text_encoder.int8.onnx`,
  vectorEstimator: `${INT8}/vector_estimator.int8.onnx`,
  vocoder: `${INT8}/vocoder.int8.onnx`,
} as const;

/** 진행률 표시용 — 실제 Content-Length 와 맞춰 둔 값이다. */
export const MODEL_BYTES: Record<keyof typeof MODEL_URLS, number> = {
  durationPredictor: 3_700_147,
  textEncoder: 36_416_150,
  vectorEstimator: 78_400_833,
  vocoder: 25_991_073,
};

export const TOTAL_MODEL_BYTES = Object.values(MODEL_BYTES).reduce((a, b) => a + b, 0);

export const CONFIG_URL = `${BASE}/onnx/tts.json`;
export const INDEXER_URL = `${BASE}/onnx/unicode_indexer.json`;

/** 프리셋 목소리. M=남성, F=여성. 배역마다 하나씩 배정한다. */
export const VOICE_PRESETS = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"] as const;
export type VoicePreset = (typeof VOICE_PRESETS)[number];

export const voiceStyleUrl = (preset: VoicePreset) => `${BASE}/voice_styles/${preset}.json`;

/** 모델 가중치는 OpenRAIL-M 이다. 배포물에 이 고지를 노출해야 한다. */
export const MODEL_ATTRIBUTION = {
  name: "Supertonic 3",
  author: "Supertone Inc.",
  license: "OpenRAIL-M",
  url: "https://huggingface.co/Supertone/supertonic-3",
} as const;
