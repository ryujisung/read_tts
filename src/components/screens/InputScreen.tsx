"use client";

import { useMemo, useRef, useState } from "react";
import { parseScript } from "../../lib/script/parse";
import { extractPdfText } from "../../lib/script/pdf";
import { SAMPLE_SCRIPT } from "../../lib/script/sample";
import type { StoredScript } from "../../lib/storage";
import { Button } from "../ui";

export function InputScreen({
  initialRaw,
  onParsed,
}: {
  initialRaw: string;
  onParsed: (script: StoredScript) => void;
}) {
  const [raw, setRaw] = useState(initialRaw);
  const [hint, setHint] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hints = useMemo(
    () =>
      hint
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [hint],
  );
  const parsed = useMemo(() => parseScript(raw, { roleHints: hints }), [raw, hints]);
  const dialogueCount = parsed.lines.filter((l) => l.type === "dialogue").length;
  const hasText = raw.trim().length > 0;
  const ready = parsed.roles.length >= 2 && dialogueCount >= 2;
  const needHint = hasText && !ready;

  async function onPickPdf(file: File | undefined) {
    if (!file) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) setPdfError("PDF에서 글자를 못 읽었어요. 스캔본이면 텍스트를 붙여넣어 주세요.");
      else setRaw(text);
    } catch {
      setPdfError("PDF를 여는 데 실패했어요.");
    } finally {
      setPdfBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="shell">
      <header className="pt-4 pb-5">
        <p className="text-sm text-accent font-semibold tracking-wide">상대역</p>
        <h1 className="text-2xl font-bold mt-1">대본을 넣어 주세요</h1>
        <p className="text-muted mt-2 leading-relaxed">
          내 배역을 고르면 나머지 배역을 소리 내어 연기해 드려요. 내 차례엔 기다릴게요.
        </p>
      </header>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={"지수: 오래 기다렸어?\n민준: 아니, 나도 방금 왔어.\n\n(지문은 괄호로)"}
        spellCheck={false}
        className="script-text w-full flex-1 min-h-[38svh] rounded-2xl bg-surface border border-line p-4 text-base leading-relaxed placeholder:text-muted/60 focus:outline-none focus:border-accent/60 resize-none"
      />

      <div className="flex gap-2 mt-3">
        <Button variant="secondary" className="flex-1" disabled={pdfBusy} onClick={() => fileRef.current?.click()}>
          {pdfBusy ? "읽는 중…" : "PDF 올리기"}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setRaw(SAMPLE_SCRIPT)}>
          샘플 넣기
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => onPickPdf(e.target.files?.[0])}
        />
      </div>
      {pdfError && <p className="text-sm text-danger mt-2">{pdfError}</p>}

      <div className="mt-4 min-h-6 text-sm">
        {hasText && ready && (
          <p className="text-muted">
            배역 <span className="text-fg font-medium">{parsed.roles.join(" · ")}</span> · 대사{" "}
            <span className="text-fg font-medium">{dialogueCount}</span>줄
            {parsed.title && (
              <>
                {" "}
                · <span className="text-fg">{parsed.title}</span>
              </>
            )}
          </p>
        )}
        {needHint && (
          <div className="rounded-2xl bg-surface border border-line p-4">
            <p className="text-fg">배역을 충분히 못 찾았어요. 배역 이름을 쉼표로 적어 주세요.</p>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="예: 지수, 민준"
              className="mt-3 w-full h-11 rounded-xl bg-surface-2 border border-line px-3 text-base focus:outline-none focus:border-accent/60"
            />
            {parsed.roles.length > 0 && (
              <p className="text-muted text-xs mt-2">지금 잡힌 배역: {parsed.roles.join(", ")}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto pt-5">
        <Button
          size="lg"
          className="w-full"
          disabled={!ready}
          onClick={() => onParsed({ ...parsed, raw })}
        >
          배역 고르러 가기
        </Button>
        <p className="text-xs text-muted text-center mt-3">
          대본은 이 기기에만 저장돼요. 탭을 닫으면 사라져요.
        </p>
      </div>
    </div>
  );
}
