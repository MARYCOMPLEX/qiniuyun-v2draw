import { nullAsrProvider } from "./null";
import { ASR_PROVIDER_IDS, type AsrProvider, type AsrProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

export const getAsrProvider = (env: EnvLike = process.env): AsrProvider => {
  const id = env.ASR_PROVIDER;
  if (!id || !(ASR_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullAsrProvider;
  }
  switch (id as AsrProviderId) {
    case "browser-webspeech":
    case "whisper-openai":
    case "deepgram":
    case "aliyun-nls":
    case "null":
    default:
      return nullAsrProvider;
  }
};
