import { describe, expect, it } from "vitest";

import { decodePcm16leToFloat32 } from "@/shared/providers/tts/pcm";

describe("decodePcm16leToFloat32", () => {
  it("解码 0 / 正最大 / 负最大 三个边界采样", () => {
    // 三个 16-bit little-endian 采样: 0, +32767, -32768
    const bytes = new Uint8Array([
      0x00, 0x00, // 0
      0xff, 0x7f, // 32767  (max int16)
      0x00, 0x80, // -32768 (min int16)
    ]);
    const result = decodePcm16leToFloat32(bytes.buffer);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(32767 / 32768, 6);
    expect(result[2]).toBe(-1);
  });

  it("奇数字节: 末尾半采样静默丢弃, 不抛错", () => {
    const bytes = new Uint8Array([0x10, 0x20, 0x30]);
    const result = decodePcm16leToFloat32(bytes.buffer);
    expect(result).toHaveLength(1);
  });

  it("空 buffer 返回空 Float32Array", () => {
    const result = decodePcm16leToFloat32(new ArrayBuffer(0));
    expect(result).toHaveLength(0);
  });

  it("显式 little-endian 解码: 0x0102 字节序 → 0x0201 数值", () => {
    // 0x01, 0x02 little-endian → int16(0x0201) = 513
    const bytes = new Uint8Array([0x01, 0x02]);
    const result = decodePcm16leToFloat32(bytes.buffer);
    expect(result[0]).toBeCloseTo(513 / 32768, 6);
  });
});
