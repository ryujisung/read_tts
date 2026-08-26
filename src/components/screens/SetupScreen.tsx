"use client";

import { useState } from "react";
import { micSupported } from "../../lib/audio/mic";
import { sttAvailable } from "../../lib/audio/stt";
import { assignVoices, getEngine, speak, ttsSupported, unlockTts, type Engine } from "../../lib/audio/tts";
import { VoiceSetup } from "../VoiceSetup";
import type { AdvanceMode, Mode, Setup, StoredScript } from "../../lib/storage";
import { Page } from "../Page";
import { ReviewList } from "../ReviewList";
import { Button, Card, CardTitle, Icon, SelectCard, StepsPill, TopBar } from "../ui";

export function SetupScreen({
  script,
  initialSetup,
  onStart,
  onBack,
  onReinput,
}: {
  script: StoredScript;
  initialSetup: Setup | null;
  onStart: (setup: Setup) => void;
  onBack: () => void;
  onReinput: () => void;
}) {
  const [myRole, setMyRole] = useState(initialSetup?.myRole ?? script.roles[0]);
  const [mode, setMode] = useState<Mode>(initialSetup?.mode ?? "read");
  const [advanceMode, setAdvanceMode] = useState<AdvanceMode>(initialSetup?.advanceMode ?? (micSupported() ? "silence" : "manual"));
  // 준비가 끝나면 VoiceSetup 이 알려 준다 — 읽어 주는 목소리 표시를 바꾸기 위해서다.
  const [engine, setEngineState] = useState<Engine>(getEngine);

  // 음성 준비·안내는 VoiceSetup 이 맡는다. 여기서는 아예 읽어 줄 수 없는 경우만 알린다.
  const voiceNote = ttsSupported()
    ? null
    : "이 브라우저는 음성 읽기를 지원하지 않아요. 상대 대사는 화면으로만 보여요.";

  const others = script.roles.filter((r) => r !== myRole);
  const dialogue = script.lines.filter((l) => l.type === "dialogue");
  const count = (r: string) => dialogue.filter((l) => l.role === r).length;

  function previewVoice() {
    unlockTts();
    const voices = assignVoices(others);
    others.forEach((r, i) => {
      setTimeout(() => void speak(`${r} 역이에요.`, voices[r]), i * 1400);
    });
  }

  const roleCard = (
    <Card>
      <CardTitle title="내 배역 고르기" sub="고른 배역은 기다리고, 나머지 배역을 소리로 읽어드려요." />
      <div className="flex gap-2">
        {script.roles.map((r) => (
          <SelectCard key={r} selected={r === myRole} onClick={() => setMyRole(r)} title={r} sub={`대사 ${count(r)}줄`} />
        ))}
      </div>
    </Card>
  );

  const modeCard = (
    <Card>
      <CardTitle title="리딩 방식" />
      <div className="flex gap-2">
        <SelectCard selected={mode === "read"} onClick={() => setMode("read")} icon="volume" title="읽어주기" sub="상대 대사를 소리로 듣고 내 차례에 읽어요" />
        <SelectCard selected={mode === "quiz"} onClick={() => setMode("quiz")} icon="eye-off" title="암기 대조" sub="내 대사를 가리고 말한 것을 원문과 맞춰요" />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <SettingRow
          icon="volume"
          title="읽어주는 목소리"
          value={`${engine === "supertonic" ? "자연스러운 음성" : "기기 음성"} · ${others.length > 0 ? others.join(", ") + (others.length > 1 ? "는 서로 다른 목소리" : "") : "상대 없음"}`}
          onClick={previewVoice}
          action="들어보기"
        />
        {mode === "read" ? (
          <SettingRow
            icon="timer"
            title="내 차례 넘기는 방식"
            value={advanceMode === "silence" ? "침묵 감지 · 1.8초 · 소리는 어디에도 안 나가요" : "버튼으로 직접 넘기기"}
            onClick={() => setAdvanceMode(advanceMode === "silence" ? "manual" : "silence")}
            action="바꾸기"
          />
        ) : (
          <SettingRow
            icon="mic"
            title="말한 것 알아듣기"
            value={sttAvailable() ? "브라우저 음성인식 · 말소리가 브라우저 음성 서비스로 가요" : "이 브라우저는 음성인식이 없어서 글자로 입력해요"}
          />
        )}
        {voiceNote && <p className="text-[11.5px] text-ink-4 px-1">{voiceNote}</p>}
        <VoiceSetup onEngineChange={setEngineState} />
      </div>
    </Card>
  );

  const start = () => onStart({ myRole, start: 0, end: script.lines.length - 1, mode, advanceMode });

  return (
    <Page>
      <div className="md:hidden">
        <TopBar title="배역 정하기" onBack={onBack} />
      </div>
      <div className="hidden md:block mb-4">
        <TopBar title={`상대역 리딩 · ${script.title ?? "대본"}`} onBack={onBack} hint={`배역 ${script.roles.length}명 · 대사 ${dialogue.length}줄`} />
      </div>
      <div className="flex-1 flex flex-col gap-4 p-4 md:p-0">
        <StepsPill states={["done", "on", "off"]} />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-4 items-start">
          <Card className="hidden md:block">
            <div className="flex items-center justify-between pb-2.5 border-b border-line-soft mb-1">
              <h2 className="text-[16px] font-black">대본 확인</h2>
              <button type="button" onClick={onReinput} className="text-[12.5px] font-bold text-blue">
                다시 넣기
              </button>
            </div>
            <ReviewList lines={script.lines} myRole={myRole} className="max-h-[560px] overflow-y-auto" />
          </Card>
          <div className="flex flex-col gap-4">
            {roleCard}
            {modeCard}
            <Button size="lg" className="w-full hidden md:flex" onClick={start}>
              연습 시작
            </Button>
          </div>
        </div>
      </div>
      <div className="md:hidden sticky bottom-0 p-4 bg-gray-bg-2/90 backdrop-blur">
        <Button size="lg" className="w-full" onClick={start}>
          연습 시작
        </Button>
      </div>
    </Page>
  );
}

function SettingRow({ icon, title, value, onClick, action }: { icon: "volume" | "timer" | "mic"; title: string; value: string; onClick?: () => void; action?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-gray-bg text-left active:bg-line disabled:active:bg-gray-bg">
      <Icon name={icon} size={18} className="text-ink-3" />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-extrabold">{title}</span>
        <span className="block text-[12px] text-ink-4">{value}</span>
      </span>
      {action && <span className="text-[12px] font-bold text-blue">{action}</span>}
    </button>
  );
}
