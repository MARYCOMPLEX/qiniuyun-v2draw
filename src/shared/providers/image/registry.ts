import { nullImageProvider } from "./null";
import { IMAGE_PROVIDER_IDS, type ImageProvider, type ImageProviderId } from "./types";

type EnvLike = Record<string, string | undefined>;

export const getImageProvider = (env: EnvLike = process.env): ImageProvider => {
  const id = env.IMAGE_PROVIDER;
  if (!id || !(IMAGE_PROVIDER_IDS as readonly string[]).includes(id)) {
    return nullImageProvider;
  }
  switch (id as ImageProviderId) {
    case "openai-dalle":
    case "stability":
    case "replicate":
    case "aliyun-wanxiang":
    case "null":
    default:
      return nullImageProvider;
  }
};
