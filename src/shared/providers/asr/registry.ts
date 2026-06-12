import { nullAsrProvider } from "./null";
import { ASR_PROVIDER_IDS, type AsrProvider, type AsrProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

/**
 * ASR Provider 解析器。
 * Why: 实时识别走浏览器直连阿里云 ws + /api/asr-token 现签发, 不再需要服务端
 * AsrProvider 整段转写。这里保留抽象给未来 batch 场景 (whisper-openai / deepgram)
 * 留扩展点, 当前所有 id 都回落到 null。
 */
export const getAsrProvider = (env: EnvLike = process.env): AsrProvider => {
  const id = env.ASR_PROVIDER;
  if (!id || !(ASR_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullAsrProvider;
  }
  void (id as AsrProviderId);
  return nullAsrProvider;
};
