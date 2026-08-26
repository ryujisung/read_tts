"use client";

import { useMemo, useRef, useState } from "react";
import { parseScript } from "../../lib/script/parse";
import { extractPdfText } from "../../lib/script/pdf";
import { SAMPLE_SCRIPT } from "../../lib/script/sample";
import type { StoredScript } from "../../lib/storage";
import { Page } from "../Page";
import { Button, Card, CardTitle, Icon, OptionRow, StepsPill } from "../ui";

type Entry = "paste" | "write" | null;

export function InputScreen({ initialRaw, onParsed }: { initialRaw: string; onParsed: (script: StoredScript) => void }) {
  const [raw, setRaw] = useState(initialRaw);
  const [entry, setEntry] = useState<Entry>(initialRaw ? "write" : null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hints = useMemo(() => hint.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean), [hint]);
  const parsed = useMemo(() => parseScript(raw, { roleHints: hints }), [raw, hints]);
  const dialogueCount = parsed.lines.filter((l) => l.type === "dialogue").length;
  const directionCount = parsed.lines.length - dialogueCount;
  const hasText = raw.trim().length > 0;
  const ready = parsed.roles.length >= 2 && dialogueCount >= 2;

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setFileError(null);
    try {
      const text = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? await extractPdfText(file) : await file.text();
      if (!text.trim()) setFileError("파일에서 글자를 못 읽었어요. 스캔본이면 텍스트를 붙여넣어 주세요.");
      else {
        setRaw(text);
        setEntry("write");
      }
    } catch {
      setFileError("파일을 여는 데 실패했어요.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onPaste() {
    setEntry("paste");
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setRaw(text);
    } catch {
      /* 권한 없으면 아래 입력칸에 직접 붙여넣는다 */
    }
  }

  const rolesCard = (
    <Card>
      <CardTitle title="배역 정하기" sub="찾은 배역을 확인한 뒤 다음 단계에서 내 배역을 고릅니다." />
      {!hasText ? (
        <div className="rounded-[14px] border border-dashed border-line min-h-[200px] md:min-h-[300px] flex flex-col items-center justify-center gap-2.5 text-center px-6">
          <span className="w-7 h-7 rounded-full border-2 border-dashed border-ink-5" />
          <p className="text-[13px] text-ink-4 leading-relaxed">대본을 넣으면 배역과 대사 수가<br />여기에 나타나요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {parsed.title && <p className="script-text text-[17px] font-black">{parsed.title}</p>}
          <p className="text-[12.5px] text-ink-sub">
            배역 {parsed.roles.length}명 · 대사 {dialogueCount}줄 · 지문 {directionCount}개
          </p>
          <div className="flex flex-wrap gap-2">
            {parsed.roles.map((r, i) => (
              <span key={r} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-bg text-[13px] font-extrabold">
                <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-blue" : "bg-partner-soft"}`} />
                {r}
                <span className="text-ink-4 font-semibold">{parsed.lines.filter((l) => l.type === "dialogue" && l.role === r).length}줄</span>
              </span>
            ))}
          </div>
          {!ready && (
            <div className="rounded-xl bg-warn-bg p-3.5">
              <p className="text-[13px] text-warn font-bold">배역을 충분히 못 찾았어요. 이름을 쉼표로 적어 주세요.</p>
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="예: 지수, 민준"
                className="mt-2 w-full h-10 rounded-lg bg-surface border border-line px-3 text-[14px] focus:outline-none focus:border-blue"
              />
            </div>
          )}
          <Button size="lg" disabled={!ready} onClick={() => onParsed({ ...parsed, raw })}>
            배역 정하러 가기
          </Button>
        </div>
      )}
    </Card>
  );

  return (
    <Page>
      <div className="px-5 pt-5 md:px-0 md:pt-0 flex flex-col gap-4">
        <header>
          <p className="text-[13px] font-bold text-blue md:hidden">상대역 리딩</p>
          <h1 className="text-[21px] md:text-[22px] font-black mt-1">대본과 배역</h1>
          <p className="text-[13px] text-ink-sub mt-1">대사를 넣고 내가 읽을 배역을 고르세요.</p>
        </header>
        <StepsPill states={["on", "off", "off"]} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <Card>
            <CardTitle title="대본 넣기" sub="파일을 열거나 복사한 대본을 붙여넣으세요." />
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="rounded-[14px] bg-blue-mist border border-[#cfe0f5] py-5 flex flex-col items-center gap-1 active:bg-blue-soft"
              >
                <Icon name="upload" size={22} className="text-blue" />
                <span className="text-[14px] font-extrabold">{busy ? "읽는 중…" : "파일에서 열기"}</span>
                <span className="text-[11.5px] text-ink-4">txt · pdf</span>
              </button>
              <input ref={fileRef} type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0])} />
              {fileError && <p className="text-[12.5px] text-red">{fileError}</p>}
              <OptionRow icon="clipboard" title="붙여넣기" sub="복사해둔 대본을 바로 넣어요" active={entry === "paste"} onClick={onPaste} />
              <OptionRow icon="pencil" title="직접 쓰기" sub="빈 칸에서 대본을 입력해요" active={entry === "write"} onClick={() => setEntry("write")} />
              <OptionRow
                icon="sparkles"
                title="예시 대본 불러오기"
                sub="두 배역의 대사를 바로 펼쳐봐요"
                onClick={() => {
                  setRaw(SAMPLE_SCRIPT);
                  setEntry("write");
                }}
              />
              {entry && (
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={"지수: 오래 기다렸어?\n민준: 아니, 나도 방금 왔어.\n\n(지문은 괄호로)"}
                  spellCheck={false}
                  autoFocus={!raw}
                  className="script-text w-full min-h-[200px] rounded-[14px] bg-surface border border-line p-3.5 text-[14px] leading-relaxed placeholder:text-ink-5 focus:outline-none focus:border-blue resize-y"
                />
              )}
              <p className="text-[11.5px] text-ink-4 leading-relaxed">배역 찾기는 이 기기 안에서 해요. 대본은 서버로 보내지 않아요.</p>
            </div>
          </Card>
          {rolesCard}
        </div>

        <div className="flex items-center justify-between text-[11.5px] text-ink-4 pb-6">
          <span>대본은 이 기기에만 저장돼요.</span>
          <span className="underline underline-offset-2 font-bold text-ink-3">대본은 어디로 가나요</span>
        </div>
      </div>
    </Page>
  );
}
