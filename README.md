# rehearsal-web — 상대역 리허설

대본을 넣고 내 배역을 고르면, 나머지 배역의 대사를 기기 음성이 읽어 주고 내 차례엔 멈춰서 기다린다.
혼자 대본 연습용. 모바일 웹 우선, 최종 목표는 앱.

설계는 [docs/SPEC.md](docs/SPEC.md).

## 실행

```bash
pnpm install
pnpm dev          # http://localhost:3000 — onnxruntime wasm 을 public/ort 로 먼저 복사한다
pnpm test         # vitest — 파서·상태머신·침묵감지
pnpm typecheck
pnpm lint
pnpm build
```

## 흐름

입력(붙여넣기·PDF·샘플) → 배역·범위·넘김 방식 → 리허설 → 완료

## 지키는 것

- 대본은 브라우저 안(`sessionStorage`)에서만 다룬다. 서버로 보내지 않는다.
- 상대 대사는 브라우저 안에서 도는 Supertonic 3 로 읽는다. 서버가 없으므로 대사가 기기 밖으로 나가지 않는다.
  모델을 받지 않았거나 받을 수 없으면 기기 내장 TTS(`speechSynthesis`)로 읽는다. 유료 API는 쓰지 않는다.
- 내 차례 넘김은 마이크 음량 기반 침묵 감지 + 수동 버튼. 소리를 저장·전송하지 않는다.
- 연기를 평가·채점하지 않는다.
