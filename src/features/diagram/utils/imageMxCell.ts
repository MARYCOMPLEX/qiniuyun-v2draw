/**
 * image mxCell builder — 把生图 imageUrl 包成 drawio image mxCell。
 *
 * 用法: SSE done event 拿到 imageUrl 后, 调本函数生成 mxCell XML,
 * 然后通过 applyEditDiagram add 操作注入到 drawio 画布。
 *
 * 见 docs/protocols/multimodal-canvas.md §3 "图像作为 mxCell"。
 */

interface BuildImageMxCellParams {
  /** 唯一 cell id (建议用 layerId 保持跟 LayerMap 一致) */
  readonly id: string;
  /** 图像 URL (生图返回) */
  readonly imageUrl: string;
  /** 图像位置 (画布坐标), 默认 stage 中心 */
  readonly position?: { x: number; y: number };
  /** 图像尺寸 默认 400x400 */
  readonly size?: { width: number; height: number };
  /** 是否锁定宽高比 (1=锁定, 0=允许拉伸) */
  readonly aspectLocked?: boolean;
}

const DEFAULT_POSITION = { x: 200, y: 100 };
const DEFAULT_SIZE = { width: 400, height: 400 };

/**
 * 把 imageUrl 包成 image mxCell XML 字符串。
 *
 * drawio image cell 必备:
 * - shape=image (告诉 drawio 渲染图像)
 * - image=<url> (实际图像 url)
 * - imageAspect=1 (锁宽高比) / 0 (允许拉伸)
 * - vertex="1" (是节点不是边)
 * - parent="1" (drawio 默认 root parent)
 * - mxGeometry 含 x/y/width/height
 */
export function buildImageMxCell({
  id,
  imageUrl,
  position = DEFAULT_POSITION,
  size = DEFAULT_SIZE,
  aspectLocked = true,
}: BuildImageMxCellParams): string {
  const escapedUrl = imageUrl.replace(/"/g, "&quot;");
  const aspect = aspectLocked ? 1 : 0;
  return `<mxCell id="${id}" style="shape=image;image=${escapedUrl};imageAspect=${aspect};" vertex="1" parent="1"><mxGeometry x="${position.x}" y="${position.y}" width="${size.width}" height="${size.height}" as="geometry"/></mxCell>`;
}
