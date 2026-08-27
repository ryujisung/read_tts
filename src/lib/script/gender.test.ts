import { describe, expect, it } from "vitest";
import { guessGender } from "./gender";

describe("guessGender — 호칭", () => {
  it("여성 호칭을 알아본다", () => {
    for (const n of ["엄마", "어머니", "할머니", "딸", "아내", "아주머니", "아가씨", "소녀", "여자", "누나", "언니", "며느리"]) {
      expect(guessGender(n), n).toBe("female");
    }
  });

  it("남성 호칭을 알아본다", () => {
    for (const n of ["아빠", "아버지", "할아버지", "아들", "남편", "아저씨", "소년", "남자", "사내", "총각", "오빠", "형"]) {
      expect(guessGender(n), n).toBe("male");
    }
  });

  it("긴 호칭이 짧은 호칭에 먹히지 않는다", () => {
    // '할아버지' 안에 '아버지'가 들어 있다 — 둘 다 남성이라 결과는 같아야 한다.
    expect(guessGender("할아버지")).toBe("male");
    // '시어머니' 안에 '어머니'가 있다.
    expect(guessGender("시어머니")).toBe("female");
    // '시아버지'는 남성이다.
    expect(guessGender("시아버지")).toBe("male");
  });

  it("호칭에 수식이 붙어도 알아본다", () => {
    expect(guessGender("막내딸")).toBe("female");
    expect(guessGender("큰아들")).toBe("male");
    expect(guessGender("외할머니")).toBe("female");
    expect(guessGender("새아빠")).toBe("male");
  });

  it("번호가 붙은 배역을 알아본다", () => {
    expect(guessGender("여자1")).toBe("female");
    expect(guessGender("남자2")).toBe("male");
    expect(guessGender("소년 A")).toBe("male");
  });
});

describe("guessGender — 이름", () => {
  it("끝 글자로 여성 이름을 짚는다", () => {
    for (const n of ["영자", "정숙", "순희", "말순", "금옥"]) {
      expect(guessGender(n), n).toBe("female");
    }
  });

  it("끝 글자로 남성 이름을 짚는다", () => {
    for (const n of ["영철", "정훈", "동석", "민준", "칠수"]) {
      expect(guessGender(n), n).toBe("male");
    }
  });

  it("'이'로 끝나면 그 앞 글자를 본다", () => {
    // 희곡에 흔한 꼴이다 — 순이, 철이.
    expect(guessGender("순이")).toBe("female");
    expect(guessGender("철이")).toBe("male");
  });
});

describe("guessGender — 모르는 것은 모른다고 한다", () => {
  it("성별이 드러나지 않는 배역은 unknown", () => {
    // 틀리게 찍는 것보다 모른다고 두는 편이 낫다 — 사람이 고칠 수 있게 남긴다.
    for (const n of ["선생", "사장", "노인", "학생", "의사", "손님", "주인", "목소리"]) {
      expect(guessGender(n), n).toBe("unknown");
    }
  });

  it("성별이 갈리는 호칭은 찍지 않는다", () => {
    expect(guessGender("신부")).toBe("unknown");
    expect(guessGender("동생")).toBe("unknown");
    expect(guessGender("아이")).toBe("unknown");
  });

  it("빈 값과 한글이 아닌 것은 unknown", () => {
    expect(guessGender("")).toBe("unknown");
    expect(guessGender("  ")).toBe("unknown");
    expect(guessGender("A")).toBe("unknown");
  });
});

describe("guessGender — 끝 글자가 엉뚱하게 갈리는 것들", () => {
  it("직업·역할을 가리키는 말은 끝 글자로 찍지 않는다", () => {
    // '기자'가 '자'로 끝난다고 여성이 되면 안 된다.
    expect(guessGender("기자")).toBe("unknown");
    expect(guessGender("형사")).toBe("unknown");
    expect(guessGender("교장")).toBe("unknown");
  });

  it("'선배'·'후배'를 남성으로 보지 않는다", () => {
    expect(guessGender("선배")).toBe("unknown");
    expect(guessGender("후배")).toBe("unknown");
  });

  it("'모두' 같은 말을 사람으로 보지 않는다", () => {
    expect(guessGender("모두")).toBe("unknown");
    expect(guessGender("일동")).toBe("unknown");
  });

  it("직업어 앞에 성별이 붙으면 그건 본다", () => {
    // '여기자'는 '기자'와 통째로 같지 않으므로 끝 글자를 본다.
    expect(guessGender("여기자")).toBe("female");
  });
});
