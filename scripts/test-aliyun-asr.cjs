"use strict";
const fs = require("fs");
const path = require("path");

// 简易解析 .env.local
const envPath = path.join(__dirname, "../.env.local");
const envText = fs.readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/\s+#.*$/, "");
  }
}

const Nls = require("alibabacloud-nls");

async function main() {
  const URL = "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1";
  const APPKEY = process.env.ALIYUN_NLS_APP_KEY;
  const TOKEN = process.env.ALIYUN_NLS_TOKEN;
  if (!APPKEY || !TOKEN) {
    console.error("缺 ALIYUN_NLS_APP_KEY 或 ALIYUN_NLS_TOKEN");
    process.exit(1);
  }
  console.log(`[diag] appkey=${APPKEY.slice(0, 8)}*** token=${TOKEN.slice(0, 8)}***`);

  // 优先用命令行参数指定的 PCM, 否则用 SDK 自带样例
  const pcmArg = process.argv[2];
  const pcmPath = pcmArg
    ? path.resolve(pcmArg)
    : path.join(__dirname, "../node_modules/alibabacloud-nls/test/test1.pcm");
  const pcm = fs.readFileSync(pcmPath);
  console.log(`[diag] PCM file=${pcmPath} size=${pcm.length}`);

  // 先看 PCM 的前 20 个 Int16 LE 样本, 判断字节序/格式是否合理
  const head = [];
  for (let i = 0; i < Math.min(40, pcm.length); i += 2) {
    head.push(pcm.readInt16LE(i));
  }
  console.log(`[diag] first 20 Int16LE samples:`, head);
  let maxAbs = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const v = Math.abs(pcm.readInt16LE(i));
    if (v > maxAbs) maxAbs = v;
  }
  console.log(`[diag] peak amplitude: ${maxAbs}/32767 (${((maxAbs / 32767) * 100).toFixed(1)}%)`);

  const sr = new Nls.SpeechRecognition({ url: URL, appkey: APPKEY, token: TOKEN });

  sr.on("started", (m) => console.log("[evt] started:", m.slice(0, 100)));
  sr.on("changed", (m) => console.log("[evt] changed:", m));
  sr.on("completed", (m) => console.log("[evt] completed:", m));
  sr.on("closed", () => console.log("[evt] closed"));
  sr.on("failed", (m) => console.log("[evt] failed:", m));

  await sr.start(sr.defaultStartParams(), true, 6000);

  // 模拟流式发送, 每 1024 bytes / 20ms
  const chunkSize = 1024;
  for (let off = 0; off < pcm.length; off += chunkSize) {
    sr.sendAudio(pcm.subarray(off, off + chunkSize));
    await new Promise((r) => setTimeout(r, 20));
  }

  await sr.close();
  console.log("[diag] done");
}

main().catch((e) => {
  console.error("[diag] FAILED:", e);
  process.exit(1);
});
