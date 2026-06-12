"use strict";
// 验证 CreateToken 能正确签出短期 token
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
const envText = fs.readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/\s+#.*$/, "");
  }
}

const RPCClient = require("@alicloud/pop-core").RPCClient;

async function main() {
  const akid = process.env.ALIYUN_ACCESS_KEY_ID;
  const akkey = process.env.ALIYUN_ACCESS_KEY_SECRET;
  if (!akid || !akkey) {
    console.error("缺 ALIYUN_ACCESS_KEY_ID 或 ALIYUN_ACCESS_KEY_SECRET");
    process.exit(1);
  }
  console.log(`[diag] akid=${akid.slice(0, 8)}***`);

  const client = new RPCClient({
    accessKeyId: akid,
    accessKeySecret: akkey,
    endpoint: "http://nls-meta.cn-shanghai.aliyuncs.com",
    apiVersion: "2019-02-28",
  });

  const result = await client.request("CreateToken");
  console.log("[diag] result:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("[diag] FAILED:", e.message ?? e);
  process.exit(1);
});
