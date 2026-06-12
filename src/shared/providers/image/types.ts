export const IMAGE_PROVIDER_IDS = [
  "openai-dalle",
  "stability",
  "replicate",
  "aliyun-wanxiang",
  "null",
] as const;

export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

export interface ImageGenerateRequest {
  prompt: string;
  /** 风格市场配方注入：可指向具体 modelId 或 LoRA */
  recipe?: {
    modelId?: string;
    loraId?: string;
  };
  width?: number;
  height?: number;
}

export interface ImageGenerateResult {
  /** 远端 CDN URL 或 data:URL，前端直接喂给 <img> */
  url: string;
  width: number;
  height: number;
  providerId: ImageProviderId;
}

/**
 * 图像生成 Provider 抽象 (DIFFUSION_MELT 工具背后)。
 * Why: 不同 Provider 的输出尺寸、计费、模型 ID 命名差异极大，
 * 用 recipe 字段把"风格 → 模型/LoRA"的映射显式化。
 */
export interface ImageProvider {
  readonly id: ImageProviderId;
  generate(request: ImageGenerateRequest): Promise<ImageGenerateResult>;
}
