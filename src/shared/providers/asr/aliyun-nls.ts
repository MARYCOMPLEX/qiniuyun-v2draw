import type { AsrProvider, AsrTranscribeRequest, AsrTranscribeResult } from "./types";

const NLS_URL = "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1";
const POOL_CAPACITY = 2;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 200;
const START_TIMEOUT_MS = 6000;
const CHUNK_SIZE = 1024;
const CHUNK_DELAY_MS = 20;

interface Credentials {
  url: string;
  appkey: string;
  token: string;
}

interface NlsPayload {
  payload?: { result?: string };
  header?: { name?: string };
}

interface NlsClient {
  on(event: string, cb: (msg: string) => void): void;
  defaultStartParams(): Record<string, unknown>;
  start(params: Record<string, unknown>, ping: boolean, timeoutMs: number): Promise<void>;
  sendAudio(chunk: Buffer): boolean;
  close(): Promise<void>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 异步信号量 — Pool 容量 = 阿里云并发配额 2。
 * Why: 阿里云 ST 每个 task 必新建 ws + close 必关 ws, 真"持久 ws 池"在协议层不可行。
 * 改成 worker 池: 同时进行的 task 不超过 2 个, 第 3 个进入 FIFO 等待队列,
 * 前一个释放才进位。匹配阿里云配额, 不会触发 ConcurrentLimit 错误。
 */
class Semaphore {
  private permits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

const pool = new Semaphore(POOL_CAPACITY);

let srClassPromise: Promise<unknown> | null = null;
const loadSpeechRecognition = (): Promise<new (cfg: Credentials) => NlsClient> => {
  if (!srClassPromise) {
    srClassPromise = import("alibabacloud-nls").then((mod) => {
      const m = mod as unknown as {
        default?: { SpeechRecognition?: unknown };
        SpeechRecognition?: unknown;
      };
      const Class = m.SpeechRecognition ?? m.default?.SpeechRecognition;
      if (!Class) throw new Error("ALIYUN_NLS_SDK_LOAD_FAILED");
      return Class;
    });
  }
  return srClassPromise as Promise<new (cfg: Credentials) => NlsClient>;
};

const readCredentials = (): Credentials => {
  const appkey = process.env.ALIYUN_NLS_APP_KEY;
  const token = process.env.ALIYUN_NLS_TOKEN;
  if (!appkey || !token) {
    throw new Error("ALIYUN_NLS_NOT_CONFIGURED: 缺少 ALIYUN_NLS_APP_KEY 或 ALIYUN_NLS_TOKEN");
  }
  return { url: NLS_URL, appkey, token };
};

const splitChunks = (buf: Buffer): readonly Buffer[] => {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    chunks.push(buf.subarray(offset, Math.min(offset + CHUNK_SIZE, buf.length)));
  }
  return chunks;
};

const tryParseResult = (msg: string): string | null => {
  try {
    const parsed = JSON.parse(msg) as NlsPayload;
    return parsed.payload?.result ?? null;
  } catch {
    return null;
  }
};

const isRetryableError = (err: Error): boolean =>
  /TLS|socket|disconnect|ECONN|ETIMEDOUT|EPIPE|network|reset|hang up/i.test(err.message);

async function transcribeOnce(buffer: Buffer, creds: Credentials): Promise<string> {
  const SpeechRecognition = await loadSpeechRecognition();
  const sr = new SpeechRecognition(creds);

  let maxAbs = 0;
  let nonZeroCount = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i);
    const abs = Math.abs(sample);
    if (abs > maxAbs) maxAbs = abs;
    if (abs > 100) nonZeroCount++;
  }
  const sampleCount = buffer.length / 2;
  const durationSec = sampleCount / 16000;
  const audioStats = `bytes=${buffer.length} dur=${durationSec.toFixed(2)}s peak=${maxAbs}/32767 voiced=${((nonZeroCount / sampleCount) * 100).toFixed(1)}%`;

  let finalText = "";
  let failureReason: string | null = null;
  const eventLog: string[] = [];

  sr.on("started", () => eventLog.push("started"));
  sr.on("changed", (msg) => {
    const r = tryParseResult(msg);
    eventLog.push(`changed:${r ?? "(empty)"}`);
    if (r) finalText = r;
  });
  sr.on("completed", (msg) => {
    const r = tryParseResult(msg);
    eventLog.push(`completed:${r ?? "(empty)"}`);
    if (r) finalText = r;
  });
  sr.on("closed", () => eventLog.push("closed"));
  sr.on("failed", (msg) => {
    eventLog.push(`failed:${msg.slice(0, 80)}`);
    failureReason = msg;
  });

  const params = sr.defaultStartParams();
  await sr.start(params, true, START_TIMEOUT_MS);

  for (const chunk of splitChunks(buffer)) {
    if (!sr.sendAudio(chunk)) {
      throw new Error("ALIYUN_NLS_SEND_FAILED: sendAudio 返回 false");
    }
    await sleep(CHUNK_DELAY_MS);
  }

  await sr.close();

  console.warn(
    `[aliyun-nls SR] ${audioStats} events=[${eventLog.join(" | ")}] finalText="${finalText}"`,
  );

  if (failureReason) {
    throw new Error(`ALIYUN_NLS_RECOGNITION_FAILED: ${failureReason}`);
  }
  return finalText.trim();
}

async function transcribeWithRetry(buffer: Buffer, creds: Credentials): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await transcribeOnce(buffer, creds);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = isRetryableError(lastError);
      const isLast = attempt === MAX_RETRIES - 1;
      if (!retryable || isLast) break;
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError ?? new Error("ALIYUN_NLS_UNKNOWN");
}

/**
 * 阿里云一句话识别 (SpeechRecognition) Provider。
 * Why: SR 简单直观——音频整段送过去, 阿里云返回完整 transcript。
 * 比 SpeechTranscription 实时流更适合"VAD 断句一句话→识别一句话"的语义。
 * 一句一连接, worker pool 控并发 2 防止超配额, TLS 抖动自动 retry 3 次。
 */
export const aliyunNlsAsrProvider: AsrProvider = {
  id: "aliyun-nls",
  streamingSupport: false,

  async transcribe(request: AsrTranscribeRequest): Promise<AsrTranscribeResult> {
    const start = Date.now();
    const creds = readCredentials();
    const arrayBuf = await request.audio.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length === 0) {
      throw new Error("ALIYUN_NLS_EMPTY_AUDIO: 音频为空");
    }

    await pool.acquire();
    try {
      const transcript = await transcribeWithRetry(buffer, creds);
      return { transcript, durationMs: Date.now() - start };
    } finally {
      pool.release();
    }
  },
};
