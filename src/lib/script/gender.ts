/**
 * 배역 이름에서 성별을 짚어 본다. 목소리를 고르는 데만 쓴다.
 *
 * 지금까지는 등장 순서대로 남녀 목소리를 번갈아 찍었다. 그래서 '엄마'가 남자
 * 목소리로, '철수'가 여자 목소리로 나왔다 — 기준이 아예 없었던 셈이다.
 *
 * 여기서 하는 것은 통계적 추정이라 반드시 틀리는 이름이 나온다.
 * 그래서 애매하면 찍지 않고 unknown 을 준다. 틀리게 찍어 놓는 것보다
 * 모른다고 두고 사람이 고르게 하는 편이 낫다.
 */

export type Gender = "female" | "male" | "unknown";

/** 두 글자 이상인 호칭. 이름 안에 들어 있어도 인정한다 — 막내딸, 외할머니. */
const FEMALE_WORDS = [
  "시어머니", "어머니", "어머님", "할머니", "할멈", "엄마", "모친",
  "아주머니", "아줌마", "아가씨", "며느리", "새댁", "색시", "마누라",
  "노파", "여자", "여인", "여성", "여사", "여왕", "소녀", "처녀",
  "누나", "누이", "언니", "이모", "고모", "장모", "공주", "마님",
  "유모", "무녀", "기생", "계집", "부인", "아내", "딸",
];

/** 두 글자 이상인 남성 호칭. */
const MALE_WORDS = [
  "시아버지", "할아버지", "할아범", "아버지", "아버님", "아빠", "부친",
  "아저씨", "아드님", "총각", "사내", "남자", "남성", "소년", "청년",
  "오빠", "삼촌", "장인", "왕자", "도령", "영감", "머슴", "서방",
  "남편", "사위", "아들",
];

/**
 * 한 글자 호칭. 이름 안에 흔히 섞이므로 통째로 같을 때만 인정한다 —
 * '형'을 이름 안에서 찾으면 '형사'·'형준'까지 남성이 되어 버린다.
 */
const FEMALE_EXACT = new Set(["딸", "처", "첩", "년"]);
const MALE_EXACT = new Set(["형", "왕", "놈", "군"]);

/**
 * 이름 끝 글자. 한국 이름에서 성별이 뚜렷하게 갈리는 것만 골랐다.
 * '수'처럼 갈리는 글자를 넣을지가 애매한데, 희곡에 나오는 이름(철수·만수·칠수)은
 * 남성 쪽이 크게 우세해서 넣었다.
 */
const FEMALE_END = new Set(["자", "숙", "순", "희", "옥", "례", "임", "실", "란", "녀", "애", "분", "연", "미", "화"]);
// '배'(선배·후배)와 '두'(모두)는 이름이 아닌 말을 남성으로 만들어서 뺐다.
const MALE_END = new Set(["철", "훈", "규", "석", "준", "호", "웅", "봉", "갑", "식", "환", "섭", "수", "기"]);

/**
 * 직업·역할을 가리키는 말. 끝 글자만 보면 엉뚱하게 갈린다 —
 * '기자'가 '자'로 끝난다고 여성이 되면 안 된다. 통째로 같을 때만 본다.
 */
const NEUTRAL_EXACT = new Set([
  "기자", "의사", "판사", "검사", "형사", "교사", "목사", "변호사", "간호사", "운전사",
  "학생", "선생", "교장", "사장", "부장", "과장", "반장", "대장", "점원", "직원", "사원",
  "주인", "손님", "하인", "노인", "어른", "아이", "아기", "사람", "부모", "자녀", "동생",
  "경찰", "군인", "배우", "신부", "선배", "후배", "동료", "친구",
  "소리", "무대", "조명", "음향", "해설", "모두", "다들", "일동",
]);

const HANGUL_RE = /^[가-힣]+$/;

/** '여자1', '소년 A' 처럼 뒤에 붙은 번호를 뗀다 — 같은 배역이 여럿일 때 쓰는 꼴이다. */
function stripIndex(name: string): string {
  return name.replace(/[\s·\-_]*[0-9A-Za-z]+$/, "").trim();
}

/** 긴 것부터 본다 — '할아버지'가 '아버지'에 먹히지 않게 한다. */
function findWord(name: string, words: string[]): boolean {
  return words.some((w) => name.includes(w));
}

export function guessGender(rawName: string): Gender {
  const name = stripIndex((rawName ?? "").trim());
  if (!name || !HANGUL_RE.test(name)) return "unknown";

  if (name.length === 1) {
    if (FEMALE_EXACT.has(name)) return "female";
    if (MALE_EXACT.has(name)) return "male";
    return "unknown";
  }

  // 호칭이 이름보다 확실하다. 먼저 본다.
  const f = findWord(name, FEMALE_WORDS);
  const m = findWord(name, MALE_WORDS);
  // 둘 다 걸리면 어느 쪽인지 알 수 없다 — 찍지 않는다.
  if (f && !m) return "female";
  if (m && !f) return "male";
  if (f && m) return "unknown";

  // 직업·역할을 가리키는 말은 끝 글자를 보면 엉뚱하게 갈린다. 여기서 끊는다.
  if (NEUTRAL_EXACT.has(name)) return "unknown";

  // 이름으로 본다. 넉 자가 넘으면 사람 이름이 아닐 가능성이 커서 그만둔다.
  if (name.length > 4) return "unknown";

  let last = name[name.length - 1];
  // '순이'·'철이'처럼 '이'가 붙는 꼴이 희곡에 흔하다. 그 앞 글자를 본다.
  if (last === "이" && name.length >= 2) last = name[name.length - 2];

  if (FEMALE_END.has(last)) return "female";
  if (MALE_END.has(last)) return "male";
  return "unknown";
}
