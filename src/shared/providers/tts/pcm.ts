/**
 * PCM s16le (16-bit signed little-endian) → Float32 [-1, 1]
 *
 * Why: AudioBuffer 只接受 Float32, 阿里云 Qwen-TTS Realtime 返回的是
 * 16-bit signed little-endian 整数 (pcm_24000hz_mono_16bit)。
 * 走 DataView 显式 little-endian 比 Int16Array 更安全 (不依赖宿主字节序)。
 *
 * 输入字节数若为奇数, 末尾半个采样会被丢弃 (调用方应缓存 leftover 字节)。
 */
export const decodePcm16leToFloat32 = (buffer: ArrayBuffer): Float32Array => {
  const view = new DataView(buffer);
  const sampleCount = Math.floor(buffer.byteLength / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
};
