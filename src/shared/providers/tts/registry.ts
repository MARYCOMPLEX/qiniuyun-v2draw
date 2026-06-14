import { createAliyunQwenRealtimeTts } from "./aliyun-qwen-realtime";
import { nullTtsProvider } from "./null";
import { TTS_PROVIDER_IDS, type TtsProvider, type TtsProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

export const getTtsProvider = (env: EnvLike = process.env): TtsProvider => {
  const id = env.TTS_PROVIDER;
  if (!id || !(TTS_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullTtsProvider;
  }
  switch (id as TtsProviderId) {
    case "aliyun-qwen-realtime": {
      // Qwen TTS 走 DashScope wss, 优先用独立 DASHSCOPE_API_KEY,
      // 兼容历史: 如果没设, 退到 OPENAI_API_KEY (旧版本 OPENAI_API_KEY 直连 DashScope)。
      // 当用户切换 LLM provider 后 OPENAI_API_KEY 不再是 DashScope key, 这时必须配 DASHSCOPE_API_KEY。
      const apiKey = env.DASHSCOPE_API_KEY ?? env.OPENAI_API_KEY;
      if (!apiKey) return nullTtsProvider;
      return createAliyunQwenRealtimeTts({
        apiKey,
        voice: env.TTS_VOICE,
      });
    }
    case "null":
    default:
      return nullTtsProvider;
  }
};
