# rehearsal-web — 상대역 리허설 v1 설계

> 대본을 넣고 내 배역을 고르면, 나머지 배역의 대사를 AI가 소리 내어 연기해 주고
> 내 차례에는 멈춰서 기다리는 혼자 연습용 도구. 최종 목표는 앱이고, v1은 모바일 웹.

참고 베이스: `acttub/read`(플로우·가드레일·침묵 감지), `coo001/rehearsal_app`(연기 지시 → TTS, 범위 반복).

## 결정 사항

- 스택: Next.js 16(App Router) + TypeScript + Tailwind v4. 순수 로직은 vitest.
- 폰 세로 기본, 데스크톱은 가운데 좁은 셸(max 480px). 앱 전환을 염두에 둔 SPA 구조(화면 = phase 상태).
- 대본 본문은 **브라우저 안에서만** 다루고 `sessionStorage`까지만 저장한다. 서버·로그에 대본이 남지 않는다.
- 상대 대사 음성은 **기기 내장 TTS(`speechSynthesis`)가 기본**. 유료 TTS/LLM은 서버에 키가 있을 때만 켜지는 선택 경로이고, 키가 없으면 조용히 기기 음성으로 폴백한다. 개발 중 유료 API를 호출하지 않는다.
- 내 차례 넘김은 **마이크 음량 기반 침묵 감지**(오디오가 밖으로 나가지 않음) + 수동 버튼. STT는 쓰지 않는다.
- 연기를 평가·채점하지 않는다. 화면 문구는 기능 설명에 한정한다.

## 화면 흐름 (phase)

| phase | 하는 일 |
|---|---|
| `input` | 대본 붙여넣기 / PDF 업로드 / 샘플 → 배역 추출. 배역이 2개 미만이면 이름을 직접 받아 재파싱 |
| `setup` | 내 배역 선택 · 연습 범위(전체/구간) · 넘김 방식(침묵 감지/수동) · 내 대사 가리기 |
| `rehearsal` | 리허설 실행. 상대 대사는 TTS로 재생, 내 차례엔 멈춰서 기다림. 일시정지 / 넘기기 / 나가기 |
| `done` | 완료. 같은 범위 다시 / 처음부터 / 다른 대본 |

앞 단계 데이터가 없으면 앞 화면으로 되돌린다.

## 모듈

- `src/lib/script/parse.ts` — 대본 텍스트 → `{ roles, lines }`. 지원 형식: `이름: 대사`, `이름 대사`(알려진 배역), 블록형(`이름` 한 줄 + 다음 줄 대사), `(지문)`·`[지문]`.
- `src/lib/rehearsal/machine.ts` — 순수 상태머신. `idle → ai | me → … → done`, `paused`. 지문은 화면에만 보이고 진행에서는 건너뛴다.
- `src/lib/audio/vad.ts` — RMS 샘플을 받아 `speech_start / speech_end / timeout`을 내는 순수 침묵 감지기.
- `src/lib/audio/tts.ts` — `speechSynthesis` 래퍼. 배역별 rate/pitch 팔레트, iOS 언락, 괄호 지문 제거.
- `src/lib/audio/mic.ts` — getUserMedia → AnalyserNode → RMS만 뽑아 감지기에 넣는다. 녹음·전송 없음.
- `src/lib/script/pdf.ts` — pdf.js로 브라우저 안에서 텍스트 추출(워커는 `public/pdf.worker.min.mjs`).
- `src/lib/storage.ts` — `sessionStorage` 저장/복원.
- `src/hooks/useRehearsalRunner.ts` — 상태머신 + TTS + 마이크를 잇는 러너. 상태가 바뀌면 진행 중인 TTS·마이크를 항상 정리한다.
- `src/components/App.tsx` — phase 라우터. `screens/`에 화면 4개.

유료 TTS/LLM 경로(`/api/tts` 등)는 v1에 넣지 않았다 — 키가 생기고 필요해지면 그때 붙인다.

## v2 후보 (v1에서 뺀 것)

파싱 결과 수동 교정 화면 · 배역별 목소리 수동 배정 · 암기 대조(STT) · 세션 목록 · LLM 연기 지시(rehearsal_app 방식) · 캐릭터/관계 카드.
