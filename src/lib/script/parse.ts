/**
 * 대본 텍스트 → 배역·대사 구조.
 *
 * 지원 형식
 *  - 콜론:   `지수: 대사` (전각 콜론 `：`·`지수 : 대사`도 받음)
 *  - 블록:   `지수` 한 줄 + 다음 줄부터 빈 줄 전까지 대사
 *  - 공백:   `강호 대사` (한국 연극 대본식 — 콜론·블록이 하나도 없을 때만)
 *  - 지문:   `(…)`·`[…]`로 감싼 한 줄, `이름, 행동` 꼴
 *
 * 배역 판별은 빈도 기반이다 — 이름 꼴이고 2회 이상 나오면 배역. 한 번만 나온 이름은
 * 사용자가 힌트(roleHints)로 올려 줄 수 있다.
 */

export type DialogueLine = { type: "dialogue"; role: string; text: string };
export type DirectionLine = { type: "direction"; text: string };
export type ScriptLine = DialogueLine | DirectionLine;

export interface ParsedScript {
  title: string | undefined;
  roles: string[];
  lines: ScriptLine[];
}

export interface ParseOptions {
  /** 배역으로 취급할 이름. 본문에 한 번이라도 나와야 채택된다. */
  roleHints?: string[];
  /** true면 힌트에 있는 이름만 배역으로 쓴다. */
  onlyHints?: boolean;
  /**
   * 배역에서 빼기로 한 이름. 형식이 제각각이라 자동 판별이 늘 맞을 수는 없어서
   * 화면에서 직접 뺄 수 있게 한다. 뺀 이름의 줄은 지문으로 내려간다.
   */
  excludeRoles?: string[];
}

/** 배역별로 대사가 몇 줄인지 — 많이 말하는 순으로 보여 주기 위해 쓴다. */
export function countLinesByRole(lines: ScriptLine[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of lines) {
    if (l.type !== "dialogue") continue;
    counts.set(l.role, (counts.get(l.role) ?? 0) + 1);
  }
  return counts;
}

const NAME_RE = /^[가-힣A-Za-z0-9·]{1,6}$/;
/** `[지수] 대사` — 이름만 감싸고 뒤에 대사가 온다. 한글 파일 대본에 흔하다. */
const BRACKET_ROLE_RE = /^[[［【]\s*([가-힣A-Za-z0-9·]{1,6})\s*[\]］】]\s*(.+)$/;
/** 문서에서 딸려 오는 쪽 표시 — 본문이 아니다 */
const PAGE_MARK_RE = /^(?:[-–—]\s*\d+\s*[-–—]|[[［【]?\s*(?:페이지|쪽|면)\s*[\]］】]?\s*\S{0,6})$/;
/**
 * 한글 파일을 옮기면 문서 구조가 `[장] 제1장` 꼴로 남는다. 배역 형식과 똑같이 생겨서
 * 그냥 두면 "장"이 배역이 된다. 사람이 말하는 말이 아니므로 지문으로 내린다.
 */
const STRUCTURE_WORDS = new Set(["장", "막", "씬", "신", "화"]);
/**
 * 한글 파일에서 남는 `<<0>><<것>>` 꼴. 앞의 숫자는 표시일 뿐이고 뒤쪽은 진짜 글자를
 * 감싸고 있다 — 통째로 지우면 본문이 사라지므로 표시만 빼고 껍데기는 벗긴다.
 */
const MARKUP_INDEX_RE = /<<\d*>>/g;
const MARKUP_WRAP_RE = /<<([^>]*)>>/g;
const WRAPPED_DIRECTION_RE = /^[(\[（【].*[)\]）】]$/;
const NAME_COMMA_DIRECTION_RE = /^[가-힣A-Za-z0-9·]{1,6},\s*\S/;
const MIN_ROLE_COUNT = 2;

/**
 * `1막`·`제2장`·`1막 1장`·`2막 3장 - 어느 여름날`·`1막 끝` 꼴의 구조 표시.
 *
 * '장'과 '부'는 종이나 서류를 세는 말이기도 해서(`2장 주세요`) 숫자 뒤에 말이
 * 그냥 이어지는 것까지 표시로 보면 대사를 먹는다. 표시가 한 번 더 오거나,
 * 줄표로 소제목이 붙거나, `끝`·`시작`으로 닫힐 때만 인정한다.
 */
const ACT_MARK = String.raw`제?\s*\d+\s*(?:막|장|씬|신|화|부|마당|장면)`;
const STANDALONE_STRUCTURE_RE = new RegExp(
  `^${ACT_MARK}(?:\\s*${ACT_MARK})?\\s*(?:[-–—:·]\\s*.{0,40}|끝|시작)?$`,
);

/**
 * 조사. 긴 것부터 본다 — '에게서'가 '서'에 먼저 걸리면 줄기를 잘못 자른다.
 */
const PARTICLES = [
  "에게서", "으로서", "으로써", "에서는", "에게는", "으로는", "이라고",
  "에서", "에게", "한테", "으로", "부터", "까지", "처럼", "보다", "마다",
  "조차", "마저", "밖에", "께서", "이랑", "하고", "라고", "이나", "만큼", "대로",
  "는", "은", "이", "가", "을", "를", "의", "에", "도", "만", "과", "와", "로", "께",
];

/**
 * 조사·어미만으로 된 이름. 줄머리에 자주 걸리지만 사람이 아니다.
 * `로`·`이`·`고`·`는`·`과` 가 배역으로 올라오던 것을 여기서 끊는다.
 * '나'는 뺐다 — `나: 싫어` 처럼 진짜 배역으로 쓰인다.
 */
const PARTICLE_ONLY = new Set([
  "는", "은", "이", "가", "을", "를", "의", "에", "도", "만", "과", "와", "로", "고",
  "며", "서", "라", "지", "게", "든", "야", "요", "께", "랑", "제", "듯", "며는",
]);

/** 사람을 가리키는 말. 뒤에 조사가 붙으면 그 줄은 서술이다 — '그는 …', '그녀는 …'. */
const PRONOUNS = new Set(["그", "그녀", "그들", "저", "당신", "우리", "둘", "모두"]);

/**
 * 배역 이름 뒤에 조사가 붙은 줄은 그 배역이 하는 말이 아니라
 * 그 배역을 두고 하는 서술이다 — '마르타는 천천히 고개를 든다'.
 *
 * 줄기가 이미 배역이거나 사람을 가리키는 말일 때만 인정한다.
 * 조사로 끝나는 이름을 무조건 자르면 진짜 배역이 무너진다 —
 * '극작가'는 극작+가, '아버지'는 아버+지 로 잘려 사라진다.
 */
function narrationStem(name: string, isRole: (n: string) => boolean): string | null {
  for (const p of PARTICLES) {
    if (name.length > p.length && name.endsWith(p)) {
      const stem = name.slice(0, -p.length);
      if (isRole(stem) || PRONOUNS.has(stem)) return stem;
    }
  }
  return null;
}

/** 뒷말이 낱말인지 — `무대감독 : 대사` 처럼 부호가 뒤따르는 것을 거른다. */
const FOLLOWER_RE = /^[가-힣A-Za-z0-9]{1,6}$/;
const MERGE_MIN_LINES = 10;
const MERGE_MIN_RATIO = 0.85;
const MAX_MERGED_LEN = 12;

/**
 * 공백 형식에서 두 어절짜리 배역 이름을 되찾는다.
 *
 * `8번 배심원 그건 …` 은 첫 칸에서 잘려 배역이 `8번`, 대사가 `배심원 그건 …` 이 됐다.
 * 구분자가 없어 이름의 끝을 알 방법이 없어 보이지만 실제 대본에는 신호가 뚜렷하다 —
 * `8번` 뒤에는 209줄 가운데 208줄에서 `배심원` 이 온다. 진짜 한 어절 배역은
 * 뒷말이 제각각이라 걸리지 않는다.
 *
 * 표본이 적으면 우연히 같은 말로 시작한 것과 구별할 수 없으므로 줄 수를 요구한다.
 */
function mergeTwoWordRoles(roles: string[], lines: string[]): string[] {
  const roleSet = new Set(roles);
  const followers = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const line of lines) {
    const i = line.indexOf(" ");
    if (i <= 0) continue;
    const head = line.slice(0, i);
    if (!roleSet.has(head)) continue;
    totals.set(head, (totals.get(head) ?? 0) + 1);
    const rest = line.slice(i + 1);
    const j = rest.indexOf(" ");
    const w = j > 0 ? rest.slice(0, j) : rest;
    // 부호가 뒤따르는 줄도 전체 수에는 넣는다 — 그래야 콜론 대본이 묶이지 않는다.
    if (!FOLLOWER_RE.test(w)) continue;
    if (!followers.has(head)) followers.set(head, new Map());
    const m = followers.get(head)!;
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return roles.map((r) => {
    const m = followers.get(r);
    const total = totals.get(r) ?? 0;
    if (!m || total < MERGE_MIN_LINES) return r;
    let top = 0;
    let topWord = "";
    for (const [w, c] of m) if (c > top) { top = c; topWord = w; }
    if (top / total < MERGE_MIN_RATIO) return r;
    const merged = `${r} ${topWord}`;
    return merged.length <= MAX_MERGED_LEN ? merged : r;
  });
}

/**
 * 자간이 벌어져 잘린 이름을 걷어낸다.
 *
 * PDF 에서 같은 대본이 `3번 배심원` 과 `3 번 배심원` 두 꼴로 섞여 나온다. 뒤엣것은
 * 앞 두 글자만 묶여 `3 번` 으로 남아 같은 인물이 배역 둘로 쪼개진다.
 * 공백이 든 이름이 다른 배역의 앞토막이면 그 흔적으로 보고 버린다.
 * 공백이 없는 이름은 건드리지 않는다 — `철수` 가 `철수엄마` 때문에 사라지면 안 된다.
 */
function dropSpacedPrefixes(roles: string[]): string[] {
  const bare = (s: string) => s.replace(/ /g, "");
  return roles.filter((r) => {
    if (!r.includes(" ")) return true;
    const a = bare(r);
    return !roles.some((other) => other !== r && bare(other) !== a && bare(other).startsWith(a));
  });
}

/** 공백 형식에서 배역을 떼어 낸다. 두 어절 이름을 먼저 맞춰 본다. */
function splitSpaceRole(line: string, roleSet: Set<string>): { name: string; text: string } | null {
  const first = line.indexOf(" ");
  if (first <= 0) return null;
  const second = line.indexOf(" ", first + 1);
  if (second > 0) {
    const two = line.slice(0, second);
    if (roleSet.has(two)) return { name: two, text: line.slice(second + 1).trim() };
  }
  const one = line.slice(0, first);
  if (roleSet.has(one)) return { name: one, text: line.slice(first + 1).trim() };
  return null;
}

/** 이름+조사 후보를 배역에서 덜어 낸다. 덜어 낸 것은 서술 표시로 따로 넘긴다. */
function splitNarrators(names: string[]): { roles: string[]; narrators: Set<string> } {
  const set = new Set(names);
  const narrators = new Set<string>();
  for (const n of names) {
    if (PARTICLE_ONLY.has(n)) {
      narrators.add(n);
      continue;
    }
    if (narrationStem(n, (s) => set.has(s))) narrators.add(n);
  }
  return { roles: names.filter((n) => !narrators.has(n)), narrators };
}

function normalize(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/：/g, ":")
    .split("\n")
    .map((l) => l.replace(MARKUP_INDEX_RE, "").replace(MARKUP_WRAP_RE, "$1").replace(/\s+/g, " ").trim())
    // 쪽 표시는 대사 사이에 끼어 흐름을 끊는다. 빈 줄로 만들어 없던 것으로 둔다.
    .map((l) => (PAGE_MARK_RE.test(l) ? "" : l));
}

function splitColon(line: string): { name: string; text: string } | null {
  const idx = line.indexOf(":");
  if (idx <= 0) return null;
  const name = line.slice(0, idx).trim();
  const text = line.slice(idx + 1).trim();
  if (!NAME_RE.test(name) || !text) return null;
  return { name, text };
}

function splitBracket(line: string): { name: string; text: string } | null {
  const m = BRACKET_ROLE_RE.exec(line);
  if (!m) return null;
  const name = m[1];
  // 문서 구조 표시와 숫자뿐인 이름은 사람이 아니다.
  if (STRUCTURE_WORDS.has(name) || /^\d+$/.test(name)) return null;
  return { name, text: m[2].trim() };
}

/** `[장] 제1장` 처럼 구조를 알려 주는 줄인지 */
function isStructureMark(line: string): boolean {
  const m = BRACKET_ROLE_RE.exec(line);
  return m !== null && STRUCTURE_WORDS.has(m[1]);
}

function splitSpace(line: string): { name: string; text: string } | null {
  const idx = line.indexOf(" ");
  if (idx <= 0) return null;
  const name = line.slice(0, idx);
  const text = line.slice(idx + 1).trim();
  if (!NAME_RE.test(name) || !text) return null;
  return { name, text };
}

function isSoloName(line: string): boolean {
  return NAME_RE.test(line);
}

function isWrappedDirection(line: string): boolean {
  return WRAPPED_DIRECTION_RE.test(line);
}

function stripWrap(line: string): string {
  return line.replace(/^[(\[（【]\s*/, "").replace(/\s*[)\]）】]$/, "");
}

/** 등장 순서를 지키면서 빈도를 센다. */
class Counter {
  private counts = new Map<string, number>();
  add(name: string) {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }
  atLeast(n: number): string[] {
    return [...this.counts.entries()].filter(([, c]) => c >= n).map(([name]) => name);
  }
  has(name: string) {
    return this.counts.has(name);
  }
  countOf(name: string): number {
    return this.counts.get(name) ?? 0;
  }
  total(): number {
    let t = 0;
    for (const c of this.counts.values()) t += c;
    return t;
  }
}

/**
 * 한두 줄만 걸린 이름을 걷어낸다.
 *
 * 실물 대본에서 배역이 87명, 145명씩 잡히는 일이 있었다. 대부분은 줄머리에 두 번
 * 나온 조사나 부사였다. 진짜 배역은 대사를 여러 번 말하므로, 가장 많이 말하는
 * 배역에 견주어 너무 적게 말하는 이름은 뺀다.
 *
 * 세게 자르지는 않는다. 대사 두어 줄짜리 조연은 진짜 배역이고, 그런 배역과
 * 연습하고 싶을 수도 있다. 여기서는 "압도적으로 적은" 것만 걷어내고, 나머지 판단은
 * 사람에게 맡긴다 — 화면에서 배역을 빼고 더할 수 있다.
 */
function pruneRare(names: string[], counter: Counter): string[] {
  if (names.length <= 2) return names;
  const top = Math.max(...names.map((n) => counter.countOf(n)));
  const floor = Math.max(MIN_ROLE_COUNT, top * 0.02);
  return names.filter((n) => counter.countOf(n) >= floor);
}

/**
 * 배역 후보를 센다. 콜론·블록 형식이 우선이고, 둘 다 없을 때만 공백 형식을 본다 —
 * 공백 형식은 평범한 문장의 첫 어절("오늘 날씨…")도 이름처럼 보여서 오탐이 많다.
 */
function countCandidates(lines: string[]): { primary: Counter; space: Counter } {
  const primary = new Counter();
  const space = new Counter();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || isWrappedDirection(line)) continue;
    if (STANDALONE_STRUCTURE_RE.test(line)) continue;
    const bracket = splitBracket(line);
    if (bracket) {
      primary.add(bracket.name);
      continue;
    }
    const colon = splitColon(line);
    if (colon) {
      primary.add(colon.name);
      continue;
    }
    if (isSoloName(line)) {
      const next = lines.slice(i + 1).find((l) => l !== "");
      if (next && !isSoloName(next) && !isWrappedDirection(next)) primary.add(line);
      continue;
    }
    if (NAME_COMMA_DIRECTION_RE.test(line)) continue;
    const sp = splitSpace(line);
    if (sp) space.add(sp.name);
  }
  return { primary, space };
}

function resolveRoles(lines: string[], options: ParseOptions): { roles: string[]; spaceMode: boolean; narrators: Set<string> } {
  const { primary, space } = countCandidates(lines);
  const hints = (options.roleHints ?? []).map((h) => h.trim()).filter(Boolean);

  let detected = pruneRare(primary.atLeast(MIN_ROLE_COUNT), primary);
  let spaceMode = false;
  if (detected.length < 2) {
    const fromSpace = pruneRare(space.atLeast(MIN_ROLE_COUNT), space);
    if (fromSpace.length >= 2) {
      detected = fromSpace;
      spaceMode = true;
    }
  }

  const appears = (name: string) => primary.has(name) || space.has(name);
  const hintRoles = hints.filter(appears);
  if (hintRoles.some((h) => !primary.has(h) && space.has(h))) spaceMode = true;

  // 뺀 이름은 힌트로 들어와도 되살리지 않는다 — 사람이 내린 판단이 먼저다.
  const excluded = new Set(options.excludeRoles ?? []);
  const keep = (names: string[]) => names.filter((n) => !excluded.has(n));

  if (options.onlyHints) {
    return { roles: orderByAppearance(keep(hintRoles), lines), spaceMode, narrators: new Set() };
  }

  // 공백 형식에서 첫 칸에 잘린 두 어절 이름을 되찾는다 — `8번` → `8번 배심원`.
  const restored = spaceMode ? dropSpacedPrefixes(mergeTwoWordRoles(detected, lines)) : detected;

  const merged = [...restored, ...hintRoles.filter((h) => !restored.includes(h))];
  // 이름 뒤에 조사가 붙은 후보는 배역이 아니라 그 배역을 두고 하는 서술이다.
  // 사람이 힌트로 직접 올린 이름은 건드리지 않는다 — 사람의 판단이 먼저다.
  const { roles: real, narrators } = splitNarrators(merged.filter((n) => !hintRoles.includes(n)));
  const withHints = [...real, ...hintRoles.filter((h) => !real.includes(h))];
  return { roles: orderByAppearance(keep(withHints), lines), spaceMode, narrators };
}

function orderByAppearance(roles: string[], lines: string[]): string[] {
  const first = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const r of roles) {
      if (first.has(r)) continue;
      if (line === r || line.startsWith(r + ":") || line.startsWith(r + " ") || splitBracket(line)?.name === r) first.set(r, i);
    }
  }
  return [...roles].sort((a, b) => (first.get(a) ?? Infinity) - (first.get(b) ?? Infinity));
}

export function detectRoles(raw: string, options: ParseOptions = {}): string[] {
  return resolveRoles(normalize(raw), options).roles;
}

export function parseScript(raw: string, options: ParseOptions = {}): ParsedScript {
  const lines = normalize(raw);
  if (lines.every((l) => l === "")) return { title: undefined, roles: [], lines: [] };

  const { roles, spaceMode, narrators } = resolveRoles(lines, options);
  const roleSet = new Set(roles);
  /**
   * `마르타는 …` 처럼 배역 이름에 조사가 붙어 시작하는 줄인지.
   *
   * 후보 목록을 쓰지 않고 배역 목록에 곧바로 대 본다 — 서술하는 줄은 대개
   * 한 번씩만 나와서 "두 번 이상" 문턱을 넘지 못한다. 빈도에 기대면 놓친다.
   */
  const leadsWithNarration = (line: string): boolean => {
    const i = line.indexOf(" ");
    if (i <= 0) return false;
    const lead = line.slice(0, i);
    if (PARTICLE_ONLY.has(lead)) return true;
    return narrators.has(lead) || narrationStem(lead, (s) => roleSet.has(s)) !== null;
  };

  const out: ScriptLine[] = [];
  let prev: DialogueLine | null = null;
  let pendingRole: string | null = null;

  for (const line of lines) {
    if (line === "") {
      prev = null;
      pendingRole = null;
      continue;
    }
    if (isWrappedDirection(line)) {
      out.push({ type: "direction", text: stripWrap(line) });
      prev = null;
      pendingRole = null;
      continue;
    }
    if (isStructureMark(line)) {
      out.push({ type: "direction", text: BRACKET_ROLE_RE.exec(line)![2].trim() });
      prev = null;
      pendingRole = null;
      continue;
    }
    // `1막`·`제2장` — 배역도 대사도 아니다. 앞 대사에 붙지 않게 여기서 끊는다.
    if (STANDALONE_STRUCTURE_RE.test(line)) {
      out.push({ type: "direction", text: line });
      prev = null;
      pendingRole = null;
      continue;
    }
    // 배역 이름에 조사가 붙어 시작하면 그 배역이 하는 말이 아니라 서술이다.
    if (leadsWithNarration(line)) {
      out.push({ type: "direction", text: line });
      prev = null;
      pendingRole = null;
      continue;
    }
    const bracket = splitBracket(line);
    if (bracket && roleSet.has(bracket.name)) {
      prev = { type: "dialogue", role: bracket.name, text: bracket.text };
      out.push(prev);
      pendingRole = null;
      continue;
    }
    const colon = splitColon(line);
    if (colon && roleSet.has(colon.name)) {
      prev = { type: "dialogue", role: colon.name, text: colon.text };
      out.push(prev);
      pendingRole = null;
      continue;
    }
    if (colon) {
      // `이름: …` 꼴인데 배역이 아니다 — 앞 대사에 붙이지 않고 지문으로 둔다
      out.push({ type: "direction", text: line });
      prev = null;
      pendingRole = null;
      continue;
    }
    if (isSoloName(line) && roleSet.has(line)) {
      pendingRole = line;
      prev = null;
      continue;
    }
    if (pendingRole) {
      prev = { type: "dialogue", role: pendingRole, text: line };
      out.push(prev);
      pendingRole = null;
      continue;
    }
    if (spaceMode) {
      // 두 어절 이름을 먼저 맞춰 본다 — `8번 배심원` 이 `8번` 으로 잘리지 않게 한다.
      const sp = splitSpaceRole(line, roleSet);
      if (sp) {
        prev = { type: "dialogue", role: sp.name, text: sp.text };
        out.push(prev);
        continue;
      }
    }
    if (NAME_COMMA_DIRECTION_RE.test(line)) {
      out.push({ type: "direction", text: line });
      prev = null;
      continue;
    }
    if (prev) {
      prev.text = `${prev.text} ${line}`;
      continue;
    }
    out.push({ type: "direction", text: line });
  }

  // 제목: 첫 줄이 대사·배역·지문이 아니고 바로 뒤가 빈 줄이면 제목으로 뺀다.
  let title: string | undefined;
  const firstIdx = lines.findIndex((l) => l !== "");
  const first = lines[firstIdx];
  if (
    first &&
    lines[firstIdx + 1] === "" &&
    first.length <= 30 &&
    out[0]?.type === "direction" &&
    out[0].text === first
  ) {
    title = first;
    out.shift();
  }

  return { title, roles, lines: out };
}

/** TTS로 읽을 때 괄호 지문·따옴표를 뺀 본문. */
export function speakableText(text: string): string {
  return text
    .replace(/[(（\[【][^)）\]】]*[)）\]】]/g, " ")
    .replace(/["“”'‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
