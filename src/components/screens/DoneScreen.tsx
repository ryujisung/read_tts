"use client";

import type { Setup, StoredScript } from "../../lib/storage";
import { Button } from "../ui";

export interface RunStats {
  elapsedMs: number;
  lineCount: number;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

export function DoneScreen({
  script,
  setup,
  stats,
  onRepeat,
  onRestartAll,
  onChangeSetup,
  onNewScript,
}: {
  script: StoredScript;
  setup: Setup;
  stats: RunStats;
  onRepeat: () => void;
  onRestartAll: () => void;
  onChangeSetup: () => void;
  onNewScript: () => void;
}) {
  const last = script.lines.length - 1;
  const partial = setup.start > 0 || setup.end < last;

  return (
    <div className="shell">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="text-sm text-accent font-semibold tracking-wide">끝까지 갔어요</p>
        <h1 className="script-text text-2xl font-bold mt-2">{script.title ?? "대본"}</h1>
        <p className="text-muted mt-3">
          {setup.myRole} 역 · 대사 {stats.lineCount}줄 · {fmt(stats.elapsedMs)}
        </p>
      </div>

      <div className="flex flex-col gap-2 pb-2">
        <Button size="lg" onClick={onRepeat}>
          {partial ? "같은 구간 다시" : "처음부터 다시"}
        </Button>
        {partial && (
          <Button variant="secondary" onClick={onRestartAll}>
            전체 처음부터
          </Button>
        )}
        <Button variant="secondary" onClick={onChangeSetup}>
          배역·범위 바꾸기
        </Button>
        <Button variant="ghost" onClick={onNewScript}>
          다른 대본 넣기
        </Button>
      </div>
    </div>
  );
}
