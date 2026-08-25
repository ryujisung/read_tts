"use client";

import { useEffect, useMemo, useState } from "react";
import { getKoreanVoices, isRemoteOnly, ROLE_VOICE_PALETTE, speak, ttsSupported, unlockTts, waitForVoices } from "../../lib/audio/tts";
import { micSupported } from "../../lib/audio/mic";
import type { AdvanceMode, Setup, StoredScript } from "../../lib/storage";
import { Button, Chip, Section, Segmented, Toggle } from "../ui";

type Range = "all" | "part";

export function SetupScreen({
  script,
  initialSetup,
  onStart,
  onBack,
}: {
  script: StoredScript;
  initialSetup: Setup | null;
  onStart: (setup: Setup) => void;
  onBack: () => void;
}) {
  const last = script.lines.length - 1;
  const [myRole, setMyRole] = useState(initialSetup?.myRole ?? script.roles[0]);
  const [range, setRange] = useState<Range>(
    initialSetup && (initialSetup.start > 0 || initialSetup.end < last) ? "part" : "all",
  );
  const [start, setStart] = useState(initialSetup?.start ?? 0);
  const [end, setEnd] = useState(initialSetup?.end ?? last);
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode>(
    initialSetup?.advanceMode ?? (micSupported() ? "silence" : "manual"),
  );
  const [hideMyLines, setHideMyLines] = useState(initialSetup?.hideMyLines ?? false);
  const [voiceNote, setVoiceNote] = useState<string | null>(() =>
    ttsSupported() ? null : "이 브라우저는 음성 읽기를 지원하지 않아요. 상대 대사는 화면으로만 보여요.",
  );

  useEffect(() => {
    if (!ttsSupported()) return;
    waitForVoices().then((v) => {
      if (v.length === 0) setVoiceNote("한국어 음성이 없어서 기본 음성으로 읽어요.");
      else if (isRemoteOnly()) setVoiceNote("이 기기엔 원격 음성만 있어서 대사가 브라우저 음성 서비스로 전달돼요.");
    });
  }, []);

  const dialogueOptions = useMemo(
    () =>
      script.lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.type === "dialogue")
        .map(({ l, i }) => ({
          index: i,
          label: `${l.type === "dialogue" ? l.role : ""}: ${l.text.slice(0, 22)}${l.text.length > 22 ? "…" : ""}`,
        })),
    [script.lines],
  );

  const others = script.roles.filter((r) => r !== myRole);
  const rangeStart = range === "all" ? 0 : start;
  const rangeEnd = range === "all" ? last : end;
  const dialogueCount = script.lines.slice(rangeStart, rangeEnd + 1).filter((l) => l.type === "dialogue").length;
  const rangeOk = rangeStart <= rangeEnd && dialogueCount > 0;

  function previewVoice(role: string) {
    unlockTts();
    const style = ROLE_VOICE_PALETTE[others.indexOf(role) % ROLE_VOICE_PALETTE.length];
    void speak(`${role} 역이에요. 이런 목소리로 읽을게요.`, style);
  }

  return (
    <div className="shell">
      <header className="pt-2 pb-2 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3">
          ← 대본
        </Button>
      </header>
      <h1 className="text-2xl font-bold script-text">{script.title ?? "대본"}</h1>
      <p className="text-muted text-sm mt-1">
        배역 {script.roles.length}명 · 대사 {script.lines.filter((l) => l.type === "dialogue").length}줄
      </p>

      <Section title="내 배역">
        <div className="flex flex-wrap gap-2">
          {script.roles.map((r) => (
            <Chip key={r} color="me" selected={r === myRole} onClick={() => setMyRole(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="상대 배역 목소리">
        <div className="flex flex-wrap gap-2">
          {others.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => previewVoice(r)}
              className="h-10 px-3 rounded-full bg-surface border border-line text-sm active:bg-surface-2"
            >
              🔈 {r}
            </button>
          ))}
        </div>
        {voiceNote && <p className="text-xs text-muted mt-2">{voiceNote}</p>}
        {!voiceNote && getKoreanVoices().length > 0 && (
          <p className="text-xs text-muted mt-2">기기 음성으로 읽어요. 배역마다 톤을 다르게 배정했어요.</p>
        )}
      </Section>

      <Section title="연습 범위">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "all", label: "전체" },
            { value: "part", label: "구간" },
          ]}
        />
        {range === "part" && (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <label className="text-xs text-muted">
              시작
              <select
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="script-text mt-1 w-full h-11 rounded-xl bg-surface border border-line px-3 text-base text-fg"
              >
                {dialogueOptions.map((o) => (
                  <option key={o.index} value={o.index}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              끝
              <select
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="script-text mt-1 w-full h-11 rounded-xl bg-surface border border-line px-3 text-base text-fg"
              >
                {dialogueOptions.map((o) => (
                  <option key={o.index} value={o.index}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className={`text-xs ${rangeOk ? "text-muted" : "text-danger"}`}>
              {rangeOk ? `대사 ${dialogueCount}줄` : "시작이 끝보다 뒤에 있어요"}
            </p>
          </div>
        )}
      </Section>

      <Section title="내 차례 넘기기">
        <Segmented
          value={advanceMode}
          onChange={setAdvanceMode}
          options={[
            { value: "silence", label: "말이 끝나면 자동" },
            { value: "manual", label: "버튼으로 직접" },
          ]}
        />
        <p className="text-xs text-muted mt-2">
          {advanceMode === "silence"
            ? "마이크 음량만 보고 넘겨요. 소리는 어디에도 저장·전송되지 않아요."
            : "다 말한 뒤 넘기기를 누르면 돼요."}
        </p>
      </Section>

      <Section title="옵션">
        <Toggle
          checked={hideMyLines}
          onChange={setHideMyLines}
          label="내 대사 가리기"
          hint="내 차례에 대사를 흐리게 보여요. 필요하면 눌러서 볼 수 있어요."
        />
      </Section>

      <div className="mt-auto pt-6">
        <Button
          size="lg"
          className="w-full"
          disabled={!rangeOk}
          onClick={() => onStart({ myRole, start: rangeStart, end: rangeEnd, advanceMode, hideMyLines })}
        >
          리허설 시작
        </Button>
      </div>
    </div>
  );
}
