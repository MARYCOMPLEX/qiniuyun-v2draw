"use strict";
// 把 16k 单声道 Int16 PCM 包成 WAV, 方便用任何播放器听。
const fs = require("fs");
const path = require("path");

const input = process.argv[2];
if (!input) {
  console.error("usage: node pcm-to-wav.cjs <input.pcm>");
  process.exit(1);
}
const pcm = fs.readFileSync(input);
const sampleRate = 16000;
const numChannels = 1;
const bitsPerSample = 16;
const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
const blockAlign = (numChannels * bitsPerSample) / 8;
const dataSize = pcm.length;

const buf = Buffer.alloc(44 + dataSize);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(numChannels, 22);
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(byteRate, 28);
buf.writeUInt16LE(blockAlign, 32);
buf.writeUInt16LE(bitsPerSample, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataSize, 40);
pcm.copy(buf, 44);

const out = input.replace(/\.pcm$/i, "") + ".wav";
fs.writeFileSync(out, buf);
console.log(`written ${out} (${pcm.length} bytes PCM)`);
