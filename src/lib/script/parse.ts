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
}

const NAME_RE = /^[가-힣A-Za-z0-9·]{1,6}$/;
const WRAPPED_DIRECTION_RE = /^[(\[（【].*[)\]）】]$/;
const NAME_COMMA_DIRECTION_RE = /^[가-힣A-Za-z0-9·]{1,6},\s*\S/;
const MIN_ROLE_COUNT = 2;

function normalize(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/：/g, ":")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());
}

function splitColon(line: string): { name: string; text: string } | null {
  const idx = line.indexOf(":");
  if (idx <= 0) return null;
  const name = line.slice(0, idx).trim();
  const text = line.slice(idx + 1).trim();
  if (!NAME_RE.test(name) || !text) return null;
  return { name, text };
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

function resolveRoles(lines: string[], options: ParseOptions): { roles: string[]; spaceMode: boolean } {
  const { primary, space } = countCandidates(lines);
  const hints = (options.roleHints ?? []).map((h) => h.trim()).filter(Boolean);

  let detected = primary.atLeast(MIN_ROLE_COUNT);
  let spaceMode = false;
  if (detected.length < 2 && space.atLeast(MIN_ROLE_COUNT).length >= 2) {
    detected = space.atLeast(MIN_ROLE_COUNT);
    spaceMode = true;
  }

  const appears = (name: string) => primary.has(name) || space.has(name);
  const hintRoles = hints.filter(appears);
  if (hintRoles.some((h) => !primary.has(h) && space.has(h))) spaceMode = true;

  if (options.onlyHints) return { roles: orderByAppearance(hintRoles, lines), spaceMode };

  const merged = [...detected, ...hintRoles.filter((h) => !detected.includes(h))];
  return { roles: orderByAppearance(merged, lines), spaceMode };
}

function orderByAppearance(roles: string[], lines: string[]): string[] {
  const first = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const r of roles) {
      if (first.has(r)) continue;
      if (line === r || line.startsWith(r + ":") || line.startsWith(r + " ")) first.set(r, i);
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

  const { roles, spaceMode } = resolveRoles(lines, options);
  const roleSet = new Set(roles);

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
      const sp = splitSpace(line);
      if (sp && roleSet.has(sp.name)) {
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
