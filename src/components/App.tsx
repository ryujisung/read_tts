"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { storage, type Setup, type StoredScript } from "../lib/storage";
import { DoneScreen, type RunStats } from "./screens/DoneScreen";
import { InputScreen } from "./screens/InputScreen";
import { RehearsalScreen } from "./screens/RehearsalScreen";
import { SetupScreen } from "./screens/SetupScreen";

type Phase = "input" | "setup" | "rehearsal" | "done";

const noop = () => () => {};
/** 서버·하이드레이션 렌더에서는 false, 그 뒤 클라이언트에서 true */
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const isClient = typeof window !== "undefined";

export function App() {
  const hydrated = useHydrated();
  // 새로고침해도 같은 탭이면 이어간다 (sessionStorage). 초기값을 여기서 읽어도
  // hydrated가 false인 동안은 빈 셸만 그리므로 서버 HTML과 어긋나지 않는다.
  const [script, setScript] = useState<StoredScript | null>(() => (isClient ? storage.loadScript() : null));
  const [setup, setSetup] = useState<Setup | null>(() => (isClient ? storage.loadSetup() : null));
  const [phase, setPhase] = useState<Phase>(() => (isClient && storage.loadScript() ? "setup" : "input"));
  const [stats, setStats] = useState<RunStats | null>(null);

  if (!hydrated) return <div className="shell" />;

  if (phase === "input" || !script) {
    return (
      <InputScreen
        initialRaw={script?.raw ?? ""}
        onParsed={(s) => {
          setScript(s);
          storage.saveScript(s);
          // 배역 목록이 바뀌었으면 이전 설정은 버린다
          const keep = setup && s.roles.includes(setup.myRole) ? setup : null;
          setSetup(keep);
          setPhase("setup");
        }}
      />
    );
  }

  if (phase === "setup") {
    return (
      <SetupScreen
        script={script}
        initialSetup={setup}
        onBack={() => setPhase("input")}
        onStart={(st) => {
          setSetup(st);
          storage.saveSetup(st);
          setPhase("rehearsal");
        }}
      />
    );
  }

  if (phase === "rehearsal" && setup) {
    return (
      <RehearsalScreen
        script={script}
        setup={setup}
        onExit={() => setPhase("setup")}
        onFinish={(st) => {
          setStats(st);
          setPhase("done");
        }}
      />
    );
  }

  if (phase === "done" && setup && stats) {
    return (
      <DoneScreen
        script={script}
        setup={setup}
        stats={stats}
        onRepeat={() => setPhase("rehearsal")}
        onRestartAll={() => {
          const st = { ...setup, start: 0, end: script.lines.length - 1 };
          setSetup(st);
          storage.saveSetup(st);
          setPhase("rehearsal");
        }}
        onChangeSetup={() => setPhase("setup")}
        onNewScript={() => {
          storage.saveScript(null);
          storage.saveSetup(null);
          setScript(null);
          setSetup(null);
          setPhase("input");
        }}
      />
    );
  }

  // 앞 단계 데이터가 없으면 앞 화면으로
  return <Redirect to={() => setPhase("setup")} />;
}

function Redirect({ to }: { to: () => void }) {
  useEffect(() => {
    to();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="shell" />;
}
