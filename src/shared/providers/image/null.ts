import type { ImageProvider, ImageGenerateRequest, ImageGenerateResult } from "./types";

const NOT_READY = new Error(
  "IMAGE_NOT_CONFIGURED: 未配置图像 Provider，DIFFUSION_MELT 工具应在前端层降级为占位提示。",
);

export const nullImageProvider: ImageProvider = {
  id: "null",
  async generate(_request: ImageGenerateRequest): Promise<ImageGenerateResult> {
    void _request;
    throw NOT_READY;
  },
};
