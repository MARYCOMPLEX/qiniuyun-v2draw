import type { TtsProvider, TtsSynthesizeRequest, TtsSynthesizeResult } from "./types";

const NOT_READY = new Error(
  "TTS_NOT_CONFIGURED: 未配置 TTS Provider，无法合成语音。TTS 是可选能力，前端开关应已置灰。",
);

export const nullTtsProvider: TtsProvider = {
  id: "null",
  async synthesize(_request: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    void _request;
    throw NOT_READY;
  },
};
