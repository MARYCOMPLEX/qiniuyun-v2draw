import { nullTtsProvider } from "./null";
import { TTS_PROVIDER_IDS, type TtsProvider, type TtsProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

export const getTtsProvider = (env: EnvLike = process.env): TtsProvider => {
  const id = env.TTS_PROVIDER;
  if (!id || !(TTS_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullTtsProvider;
  }
  switch (id as TtsProviderId) {
    case "openai":
    case "elevenlabs":
    case "aliyun-cosyvoice":
    case "azure":
    case "null":
    default:
      return nullTtsProvider;
  }
};
