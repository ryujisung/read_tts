import { describe, expect, it } from "vitest";
import { detectRoles, parseScript, type ScriptLine } from "./parse";

const dialogues = (lines: ScriptLine[]) =>
  lines.filter((l) => l.type === "dialogue") as Extract<ScriptLine, { type: "dialogue" }>[];

describe("parseScript — 콜론 형식", () => {
  const raw = `지수: 오래 기다렸어?
민준: 아니, 나도 방금 왔어.
지수: 다행이다. (웃으며) 오늘 많이 떨려?
민준: 조금.`;

  it("배역과 대사를 뽑는다", () => {
    const s = parseScript(raw);
    expect(s.roles).toEqual(["지수", "민준"]);
    expect(dialogues(s.lines).map((l) => l.role)).toEqual(["지수", "민준", "지수", "민준"]);
    expect(dialogues(s.lines)[0].text).toBe("오래 기다렸어?");
  });

  it("괄호 지문은 대사 안에 남긴다", () => {
    const s = parseScript(raw);
    expect(dialogues(s.lines)[2].text).toBe("다행이다. (웃으며) 오늘 많이 떨려?");
  });

  it("전각 콜론과 공백 콜론도 받는다", () => {
    const s = parseScript("지수 ： 안녕\n민준 : 응\n지수: 또 봐\n민준: 응");
    expect(s.roles).toEqual(["지수", "민준"]);
    expect(dialogues(s.lines)[1].text).toBe("응");
  });

  it("이름 없는 다음 줄은 앞 대사에 이어 붙는다", () => {
    const s = parseScript("지수: 안녕\n잘 지냈어?\n민준: 응\n지수: 다행\n민준: 응");
    expect(dialogues(s.lines)[0].text).toBe("안녕 잘 지냈어?");
  });
});

describe("parseScript — 블록 형식", () => {
  const raw = `첫 만남

지수
오래 기다렸어?
진짜 오래.

민준
(고개를 저으며) 아니, 나도 방금 왔어.

[암전]

지수
다행이다.

민준
응.`;

  it("이름 한 줄 + 다음 줄 대사를 한 대사로 합친다", () => {
    const s = parseScript(raw);
    expect(s.roles).toEqual(["지수", "민준"]);
    const d = dialogues(s.lines);
    expect(d[0]).toMatchObject({ role: "지수", text: "오래 기다렸어? 진짜 오래." });
    expect(d[1].role).toBe("민준");
    expect(d).toHaveLength(4);
  });

  it("대괄호 한 줄은 지문이다", () => {
    const s = parseScript(raw);
    const dir = s.lines.filter((l) => l.type === "direction");
    expect(dir.some((l) => l.text === "암전")).toBe(true);
  });

  it("배역으로 안 잡힌 첫 줄은 제목 후보다", () => {
    expect(parseScript(raw).title).toBe("첫 만남");
    expect(parseScript(raw).lines[0].type).toBe("dialogue");
  });
});

describe("parseScript — 공백 형식(한국 연극 대본)", () => {
  const raw = `강호 깨진 찻잔. 울리지 않는 자명종 시계.
지혜 탐정님, 도대체 무슨 일로.
강호 별일 아니야.
기태, 어딘가로 뛰쳐나간다.
지혜 어디 가요?`;

  it("이름+공백으로 시작하는 줄을 대사로 잡고, 이름 뒤 쉼표는 지문으로 본다", () => {
    const s = parseScript(raw);
    expect(s.roles).toEqual(["강호", "지혜"]);
    expect(dialogues(s.lines)).toHaveLength(4);
    expect(s.lines.find((l) => l.type === "direction")?.text).toBe("기태, 어딘가로 뛰쳐나간다.");
  });
});

describe("parseScript — 배역 힌트", () => {
  const raw = `엄마: 밥 먹어.\n나: 싫어.\n엄마: 왜.\n나: 그냥.\n동생: 나도 싫어.`;

  it("한 번만 나온 이름은 기본으로 빠지고, 힌트로 주면 배역이 된다", () => {
    expect(parseScript(raw).roles).toEqual(["엄마", "나"]);
    expect(parseScript(raw, { roleHints: ["동생"] }).roles).toEqual(["엄마", "나", "동생"]);
  });

  it("힌트만 쓰면 나머지는 지문이 된다", () => {
    const s = parseScript(`엄마: 밥 먹어.\n나: 싫어.\n주석: 이건 메모.\n주석: 또 메모.`, {
      roleHints: ["엄마", "나"],
      onlyHints: true,
    });
    expect(s.roles).toEqual(["엄마", "나"]);
    expect(s.lines.at(-1)?.type).toBe("direction");
  });

  it("본문에 없는 힌트는 무시한다", () => {
    expect(parseScript(raw, { roleHints: ["아빠"] }).roles).toEqual(["엄마", "나"]);
  });
});

describe("detectRoles", () => {
  it("한 번만 등장하는 이름은 걸러진다", () => {
    const raw = `지수: 안녕\n민준: 안녕\n지수: 잘 가\n민준: 응\n행인: 실례합니다`;
    expect(detectRoles(raw)).toEqual(["지수", "민준"]);
  });

  it("긴 문장은 이름으로 오인하지 않는다", () => {
    const raw = `지수: 안녕\n이건 정말 긴 문장인데 콜론이 있다: 그렇다\n지수: 응`;
    expect(detectRoles(raw)).toEqual(["지수"]);
  });
});

describe("parseScript — 비어 있음", () => {
  it("빈 입력은 빈 결과", () => {
    expect(parseScript("   \n\n")).toEqual({ title: undefined, roles: [], lines: [] });
  });
});
