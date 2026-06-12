import type { AsrProvider, AsrTranscribeRequest, AsrTranscribeResult } from "./types";

const NOT_READY = new Error(
  "ASR_NOT_CONFIGURED: 未配置 ASR Provider，无法转写语音。请在 .env 中设置 ASR_PROVIDER。",
);

export const nullAsrProvider: AsrProvider = {
  id: "null",
  streamingSupport: false,
  async transcribe(_request: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    void _request;
    throw NOT_READY;
  },
};
