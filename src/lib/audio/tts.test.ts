import { describe, expect, it } from "vitest";
import { assignVoices, rankKoreanVoices, type VoiceLike } from "./tts";

const v = (name: string, localService = true, lang = "ko-KR"): VoiceLike => ({ name, lang, localService });

describe("rankKoreanVoices", () => {
  it("한국어가 아닌 음성은 버린다", () => {
    const out = rankKoreanVoices([v("Microsoft Zira", true, "en-US"), v("Microsoft Heami")]);
    expect(out.map((x) => x.name)).toEqual(["Microsoft Heami"]);
  });

  it("lang 표기가 ko_KR 이든 ko 든 한국어로 본다", () => {
    const out = rankKoreanVoices([v("A", true, "ko_KR"), v("B", true, "ko")]);
    expect(out).toHaveLength(2);
  });

  it("Heami 는 다른 한국어 음성이 있으면 뒤로 민다", () => {
    // 이 저장소가 처음 부딪힌 문제 — localService 우선 정렬 때문에 Heami 만 골랐다.
    const out = rankKoreanVoices([v("Microsoft Heami"), v("Google 한국의", false)]);
    expect(out[0].name).toBe("Google 한국의");
  });

  it("Natural/Neural 음성을 가장 앞에 둔다", () => {
    const out = rankKoreanVoices([
      v("Google 한국의", false),
      v("Microsoft SunHi Online (Natural) - Korean", false),
      v("Microsoft Heami"),
    ]);
    expect(out[0].name).toContain("Natural");
    expect(out[1].name).toBe("Google 한국의");
    expect(out[2].name).toBe("Microsoft Heami");
  });

  it("점수가 같으면 기기 안에서 도는 것을 앞에 둔다", () => {
    // 안드로이드처럼 좋은 음성이 로컬에 깔린 경우가 있다. 같은 값이면 오프라인 쪽이 낫다.
    const out = rankKoreanVoices([v("Google 한국의", false), v("Google 한국의", true)]);
    expect(out[0].localService).toBe(true);
  });

  it("고를 것이 없으면 빈 배열", () => {
    expect(rankKoreanVoices([])).toEqual([]);
  });
});

describe("assignVoices", () => {
  it("배역마다 다른 프리셋을 준다", () => {
    const got = assignVoices(["윤서", "태오", "민재"]);
    const presets = Object.values(got).map((x) => x.preset);
    expect(new Set(presets).size).toBe(3);
  });

  it("같은 배역 목록이면 항상 같은 결과 — 다시 들어와도 목소리가 바뀌지 않는다", () => {
    expect(assignVoices(["윤서", "태오"])).toEqual(assignVoices(["윤서", "태오"]));
  });

  it("프리셋 수보다 배역이 많으면 돌려 쓴다", () => {
    const roles = Array.from({ length: 13 }, (_, i) => `역${i}`);
    const got = assignVoices(roles);
    expect(Object.keys(got)).toHaveLength(13);
    expect(Object.values(got).every((x) => x.preset)).toBe(true);
  });

  it("기기 음성 쪽 피치를 극단으로 벌리지 않는다", () => {
    // 포먼트 보정이 없는 엔진에서 피치를 크게 흔들면 기계 소리가 난다.
    const got = assignVoices(Array.from({ length: 8 }, (_, i) => `역${i}`));
    for (const { device } of Object.values(got)) {
      expect(device.pitch).toBeGreaterThanOrEqual(0.85);
      expect(device.pitch).toBeLessThanOrEqual(1.2);
      expect(device.rate).toBeGreaterThanOrEqual(0.9);
      expect(device.rate).toBeLessThanOrEqual(1.1);
    }
  });

  it("배역이 없으면 빈 것을 준다", () => {
    expect(assignVoices([])).toEqual({});
  });
});

describe("assignVoices — 성별에 맞춰 고른다", () => {
  const preset = (m: Record<string, { preset: string }>, role: string) => m[role].preset;

  it("여성 배역에는 여성 목소리를 준다", () => {
    const got = assignVoices(["엄마", "할머니", "딸"]);
    for (const r of ["엄마", "할머니", "딸"]) {
      expect(preset(got, r), r).toMatch(/^F/);
    }
  });

  it("남성 배역에는 남성 목소리를 준다", () => {
    const got = assignVoices(["아빠", "할아버지", "아들"]);
    for (const r of ["아빠", "할아버지", "아들"]) {
      expect(preset(got, r), r).toMatch(/^M/);
    }
  });

  it("섞여 있어도 각자 맞는 쪽을 받는다", () => {
    const got = assignVoices(["철수", "영자", "만수", "정숙"]);
    expect(preset(got, "철수")).toMatch(/^M/);
    expect(preset(got, "만수")).toMatch(/^M/);
    expect(preset(got, "영자")).toMatch(/^F/);
    expect(preset(got, "정숙")).toMatch(/^F/);
  });

  it("같은 성별끼리는 서로 다른 목소리를 받는다", () => {
    const got = assignVoices(["엄마", "할머니", "딸", "언니"]);
    const presets = Object.values(got).map((x) => x.preset);
    expect(new Set(presets).size).toBe(4);
  });

  it("성별을 모르는 배역도 목소리를 받는다", () => {
    const got = assignVoices(["선생", "사장", "학생"]);
    expect(Object.keys(got)).toHaveLength(3);
    expect(Object.values(got).every((x) => /^[FM][1-5]$/.test(x.preset))).toBe(true);
  });

  it("사람이 고른 목소리가 추정보다 우선한다", () => {
    const got = assignVoices(["엄마", "아빠"], { 엄마: "M3" });
    expect(preset(got, "엄마")).toBe("M3");
    expect(preset(got, "아빠")).toMatch(/^M/);
  });

  it("고른 목소리는 다른 배역이 가져가지 않는다", () => {
    const got = assignVoices(["영자", "정숙"], { 영자: "F2" });
    expect(preset(got, "영자")).toBe("F2");
    expect(preset(got, "정숙")).not.toBe("F2");
  });

  it("성별을 맞춰도 결과는 늘 같다", () => {
    const roles = ["엄마", "철수", "선생"];
    expect(assignVoices(roles)).toEqual(assignVoices(roles));
  });
});
