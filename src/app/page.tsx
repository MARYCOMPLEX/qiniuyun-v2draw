"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentConversationPanel } from "@/features/canvas/components/AgentConversationPanel";
import { useCanvasOrchestrator } from "@/features/canvas/hooks/useCanvasOrchestrator";
import { DrawIoStage } from "@/features/diagram/components/DrawIoStage";
import { DiagramProvider, useDiagram } from "@/features/diagram/contexts/DiagramContext";
import { CanvasMarquee } from "@/features/diagram/fx/CanvasMarquee";
import { StreamingOrbFx } from "@/features/diagram/fx/StreamingOrbFx";
import { SessionHistoryPanel } from "@/features/sessions/components/SessionHistoryPanel";
import { useSessionStore } from "@/features/sessions/hooks/useSessionStore";
import { usePlatformState } from "@/features/platform/usePlatformState";
import { CapabilitiesPanel } from "@/features/voice-control/components/CapabilitiesPanel";
import { ShaderOrb } from "@/features/voice-control/components/ShaderOrb";
import { StyleMarketPanel } from "@/features/voice-control/components/StyleMarketPanel";
import { useCapabilities } from "@/features/voice-control/hooks/useCapabilities";
import { useCapabilityToggles } from "@/features/voice-control/hooks/useCapabilityToggles";
import { useRealtimeAsr } from "@/features/voice-control/hooks/useRealtimeAsr";
import { useTtsStream } from "@/features/voice-control/hooks/useTtsStream";
import { useVoiceVAD } from "@/features/voice-control/hooks/useVoiceVAD";
import {
  DEFAULT_STYLE_ID,
  getStyleById,
  type StyleId,
} from "@/shared/constants/marketStyles";

/**
 * 主页面 — 多模态 AI 创作平台版。
 *
 * 数据流:
 *   VAD 检测开口 → 浏览器直连阿里云 ws → 边推 PCM 边收 changed (实时出字)
 *      → VAD 检测结束 → ws 收 final → useCanvasOrchestrator.run(utterance)
 *      → /api/generate-draw 流式 LLM commands
 *      → 三路分发: platform reducer / canvas 同步 / canvas 异步 → fetch /api/canvas/generate
 *      → SSE 收到 job-done → 替换 layer.imageUrl → 画布渲染
 *
 * 双层架构:
 *   - PlatformState (主题/面板/语音/TTS/网格/视口) 由 platformReducer 唯一处理
 *   - LayerMap (图像层) 由 useCanvasOrchestrator 维护
 */
/**
 * 主页面 — 用 DiagramProvider wrap, 子组件 HomeContent 用 useDiagram。
 */
export default function HomePage() {
  return (
    <DiagramProvider>
      <HomeContent />
    </DiagramProvider>
  );
}

function HomeContent() {
  const diagram = useDiagram();
  const platform = usePlatformState(DEFAULT_STYLE_ID);
  const activeStyleId = platform.state.activeStyleId as StyleId;
  const activeStyle = getStyleById(activeStyleId);

  const canvas = useCanvasOrchestrator({
    activeStyleId,
    platformDispatch: platform.dispatch,
    diagramDispatch: {
      chartXML: diagram.chartXML,
      loadDiagram: diagram.loadDiagram,
    },
  });

  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const diagramRef = useRef(diagram);
  diagramRef.current = diagram;

  /**
   * 会话持久化 — 启动拉列表 / 切换 / 新建 / 删除 / autosave。
   * 切换会话时调 onActivate 灌 chartXML 到 DiagramContext + 灌 turns 到 orchestrator。
   */
  const sessionStore = useSessionStore({
    onActivate: (snapshot) => {
      // 灌历史 turns 到 orchestrator (重置当前进行中的状态)
      canvasRef.current.hydrate(snapshot.turns as never);
      // 灌 chartXML 到 DiagramContext (空字符串 = 清空画布)
      if (snapshot.chartXML && snapshot.chartXML.trim()) {
        diagramRef.current.loadDiagram(snapshot.chartXML);
      } else {
        diagramRef.current.clearDiagram();
      }
    },
  });
  const tts = useTtsStream();
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { toggles, setToggle } = useCapabilityToggles();
  const [livePartial, setLivePartial] = useState<string>("");
  const [finalUtterance, setFinalUtterance] = useState<string>("");

  // narration 播报 (TTS 在 toggles.tts && capabilities.tts.ready 时启用)
  const ttsActiveRef = useRef<boolean>(false);
  ttsActiveRef.current = toggles.tts && capabilities.tts.ready;
  const ttsSpeakRef = useRef(tts.speak);
  ttsSpeakRef.current = tts.speak;
  const lastSpokenRef = useRef<string | null>(null);
  // 当 narration 落定 (streaming 结束) 且 TTS 启用, 朗读最终 narration。
  // Why: 之前在 render 里直接判断会被流式中间帧 N 次触发, 每次 abort 上一次 fetch,
  // 导致 /api/tts 全是 canceled。改用 useEffect 监听 streaming 跃迁 + 只读最新 narration。
  useEffect(() => {
    if (canvas.streaming) return; // 还在流式中, 等落定
    if (!ttsActiveRef.current) return;
    const narration = canvas.latestNarration;
    if (!narration || narration === lastSpokenRef.current) return;
    lastSpokenRef.current = narration;
    void ttsSpeakRef.current(narration);
  }, [canvas.streaming, canvas.latestNarration]);

  const asrEvents = useMemo(
    () => ({
      onPartial: (text: string) => setLivePartial(text),
      onFinal: (text: string) => {
        setLivePartial("");
        setFinalUtterance(text);
        const trimmed = text.trim();
        if (trimmed) {
          void canvasRef.current.run(trimmed);
        }
      },
      onError: (err: string) => console.warn("[asr] error:", err),
    }),
    [],
  );

  const asr = useRealtimeAsr(asrEvents);
  const asrRef = useRef(asr);
  asrRef.current = asr;

  const vadOptions = useMemo(
    () => ({
      onUtteranceStart: () => {
        setLivePartial("");
        setFinalUtterance("");
        asrRef.current.start().catch((e) => {
          console.warn("[asr] start failed:", e);
        });
      },
      onAudioFrame: (pcm: Uint8Array) => {
        asrRef.current.sendAudio(pcm);
      },
      onUtteranceEnd: () => {
        asrRef.current.stop().catch((e) => {
          console.warn("[asr] stop failed:", e);
        });
      },
    }),
    [],
  );

  const vad = useVoiceVAD(vadOptions);

  const onToggleOrb = useCallback((): void => {
    if (vad.listening) {
      vad.stop();
      asr.disconnect();
      return;
    }
    void vad.start();
  }, [vad, asr]);

  // (移除旧 hudLogs — 改用 canvas.turns 直接喂给 AgentConversationPanel)

  /**
   * Autosave chartXML — diagram.chartXML 变化时 PATCH 到当前会话。
   * 节流: 仅在落定 (非 streaming) 时回写, 流式中间帧不持久化。
   */
  const sessionStoreRef = useRef(sessionStore);
  sessionStoreRef.current = sessionStore;
  useEffect(() => {
    if (canvas.streaming) return;
    if (!sessionStoreRef.current.activeSessionId) return;
    if (!diagram.chartXML.trim()) return;
    void sessionStoreRef.current.syncChartXML(diagram.chartXML);
  }, [canvas.streaming, diagram.chartXML]);

  /**
   * Autosave turns — turn 状态变化时 upsert 到当前会话。
   * 落定 (done/failed) 时回写一次, 保证刷新后能看到完整 conversation。
   */
  useEffect(() => {
    if (!sessionStoreRef.current.activeSessionId) return;
    const turns = canvas.turns;
    if (turns.length === 0) return;
    const last = turns[turns.length - 1];
    if (!last) return;
    if (last.status === "streaming" || last.status === "executing") return;
    void sessionStoreRef.current.syncTurn({
      id: last.id,
      sessionId: sessionStoreRef.current.activeSessionId,
      turnIndex: last.turnIndex,
      userUtterance: last.userUtterance,
      narration: last.narration,
      actions: last.actions,
      status: last.status,
      createdAt: last.timestamp,
    });
  }, [canvas.turns]);

  const transcriptToShow = livePartial || finalUtterance;

  /**
   * 任意 turn 里仍有 running 异步任务 (生图等待 SSE done) — 跑马灯/呼吸特效跟此联动,
   * streaming 也算 (LLM 还在吐 token 时画布也算 "进行中")。
   */
  const hasRunningAction = canvas.turns.some((t) =>
    t.actions.some((a) => a.status === "running"),
  );
  const fxActive = canvas.streaming || hasRunningAction;

  return (
    <main
      className="grid h-screen w-screen grid-cols-[360px_1fr_420px] gap-5 p-5 transition-colors"
      style={{ backgroundColor: activeStyle.ui.canvasBg }}
    >
      <section className="flex flex-col gap-5">
        <StyleMarketPanel
          activeStyleId={activeStyleId}
          onActivate={platform.setTheme}
          activeStyle={activeStyle}
        />
        <CapabilitiesPanel
          capabilities={capabilities}
          toggles={toggles}
          isLoading={capabilitiesLoading}
          onToggle={setToggle}
          activeStyle={activeStyle}
        />
        <SessionHistoryPanel
          sessions={sessionStore.sessions}
          activeSessionId={sessionStore.activeSessionId}
          loading={sessionStore.loading}
          error={sessionStore.error}
          activeStyle={activeStyle}
          onActivate={(id) => void sessionStore.activateSession(id)}
          onCreate={() => void sessionStore.createNewSession()}
          onDelete={(id) => void sessionStore.deleteSession(id)}
          onRename={(id, title) => void sessionStore.renameSession(id, title)}
        />
        {vad.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            麦克风错误: {vad.error}
          </p>
        ) : null}
        {asr.error && !/IDLE_TIMEOUT/i.test(asr.error) ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            ASR: {asr.error}
          </p>
        ) : null}
        {canvas.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
            画布: {canvas.error}
          </p>
        ) : null}
        {tts.error ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            TTS: {tts.error}
          </p>
        ) : null}
      </section>

      <section
        aria-label="canvas-stage"
        className="relative h-full w-full overflow-hidden rounded-2xl"
      >
        <DrawIoStage darkMode={activeStyle.ui.mode !== "light"} />
        <CanvasMarquee active={fxActive} />
        <StreamingOrbFx active={canvas.streaming} />
        <p
          className="pointer-events-none absolute left-5 top-5 flex items-center gap-2 text-xs uppercase tracking-[0.3em]"
          style={{ color: activeStyle.ui.textMuted }}
        >
          <span
            aria-label={asr.connected ? "ASR online" : "ASR offline"}
            className="inline-block h-2 w-2 rounded-full transition-colors"
            style={{
              backgroundColor: asr.connected ? "#22c55e" : "#f59e0b",
              boxShadow: asr.connected
                ? "0 0 6px rgba(34, 197, 94, 0.6)"
                : "0 0 6px rgba(245, 158, 11, 0.6)",
            }}
          />
          <span>ACTIVE STYLE · {activeStyle.id}</span>
        </p>
        <button
          onClick={() => platform.toggleGrid()}
          className="absolute right-5 top-5 rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.2em] transition-colors"
          style={{
            borderColor: activeStyle.ui.panelBorder,
            color: platform.state.showGrid ? activeStyle.accent : activeStyle.ui.textMuted,
            backgroundColor: platform.state.showGrid
              ? `${activeStyle.accent}10`
              : "transparent",
          }}
          title="切换坐标网格 (50px)"
        >
          {platform.state.showGrid ? "GRID ON" : "GRID OFF"}
        </button>
        <p
          className="pointer-events-none absolute bottom-5 left-5 text-xs"
          style={{ color: activeStyle.ui.textMuted }}
        >
          {canvas.streaming ? "STREAMING…" : `LAYERS · ${canvas.layers.size}`}
        </p>
        {transcriptToShow ? (
          <div
            className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 text-sm backdrop-blur-md"
            style={{
              backgroundColor: activeStyle.ui.panelBg,
              borderColor: activeStyle.ui.panelBorder,
              borderWidth: 1,
              color: activeStyle.ui.textPrimary,
              opacity: livePartial ? 1 : 0.7,
            }}
          >
            {livePartial ? "✦ " : ""}
            {transcriptToShow}
          </div>
        ) : null}
      </section>

      <section className="flex h-full flex-col gap-5 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentConversationPanel
            style={activeStyle}
            turns={canvas.turns}
            livePartial={livePartial}
            streaming={canvas.streaming}
            volume={vad.volume}
            listening={vad.listening || asr.recognizing || canvas.streaming}
          />
        </div>
        <div
          className="grid place-items-center rounded-2xl border p-6 backdrop-blur-md"
          style={{
            backgroundColor: activeStyle.ui.panelBg,
            borderColor: activeStyle.ui.panelBorder,
          }}
        >
          <ShaderOrb
            style={activeStyle}
            volume={vad.volume}
            listening={vad.listening}
            onToggle={onToggleOrb}
          />
        </div>
      </section>
    </main>
  );
}
