/**
 * 阿里云 NLS 临时 Token 签发器。
 * Why: 浏览器直连 ws 流式识别需要 token, AccessKey 不能漏到前端,
 * 后端拿 AccessKey 调 CreateToken RPC 现签发, 把 token 单独返给前端。
 *
 * Note: 进程内做轻量缓存 — token 24h 有效, 短时间内多次请求不必每次都签。
 * 缓存到剩余 ≤5 分钟时主动刷新, 客户端拿到的总是有效 token。
 */

const NLS_TOKEN_ENDPOINT = "http://nls-meta.cn-shanghai.aliyuncs.com";
const NLS_TOKEN_API_VERSION = "2019-02-28";
const NLS_WS_URL = "wss://nls-gateway.cn-shanghai.aliyuncs.com/ws/v1";
const REFRESH_LEAD_SECONDS = 300;
const CREATE_TOKEN_TIMEOUT_MS = 8_000;

interface AliyunTokenResult {
  readonly token: string;
  readonly expireAt: number;
  readonly appkey: string;
  readonly wsUrl: string;
}

interface CachedToken {
  token: string;
  expireAt: number;
}

// 挂到 globalThis 抗 dev 环境 HMR — 模块热重载时不丢 token cache,
// 避免短时间内反复调 CreateToken 触发阿里云端限流。
const globalCache = globalThis as unknown as { __aliyunNlsToken?: CachedToken | null };
if (globalCache.__aliyunNlsToken === undefined) {
  globalCache.__aliyunNlsToken = null;
}

const readEnv = (): { akid: string; akkey: string; appkey: string } => {
  const akid = process.env.ALIYUN_ACCESS_KEY_ID;
  const akkey = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const appkey = process.env.ALIYUN_NLS_APP_KEY;
  if (!akid || !akkey || !appkey) {
    throw new Error(
      "ALIYUN_TOKEN_NOT_CONFIGURED: 缺 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET / ALIYUN_NLS_APP_KEY",
    );
  }
  return { akid, akkey, appkey };
};

interface PopCoreModule {
  default?: { RPCClient?: new (cfg: object) => { request: (action: string) => Promise<unknown> } };
  RPCClient?: new (cfg: object) => { request: (action: string) => Promise<unknown> };
}

const loadRpcClient = async (): Promise<
  new (cfg: object) => { request: (action: string) => Promise<unknown> }
> => {
  const mod = (await import("@alicloud/pop-core")) as unknown as PopCoreModule;
  const RpcClient = mod.RPCClient ?? mod.default?.RPCClient;
  if (!RpcClient) throw new Error("ALIYUN_POP_CORE_LOAD_FAILED");
  return RpcClient;
};

interface CreateTokenResponse {
  ErrMsg?: string;
  Token?: {
    Id?: string;
    ExpireTime?: number;
  };
}

export async function issueAliyunNlsToken(): Promise<AliyunTokenResult> {
  const { akid, akkey, appkey } = readEnv();
  const now = Math.floor(Date.now() / 1000);
  const cached = globalCache.__aliyunNlsToken;

  if (cached && cached.expireAt - now > REFRESH_LEAD_SECONDS) {
    console.warn(`[asr-token] cache hit, expireAt=${cached.expireAt}`);
    return {
      token: cached.token,
      expireAt: cached.expireAt,
      appkey,
      wsUrl: NLS_WS_URL,
    };
  }

  console.warn(`[asr-token] cache miss, calling CreateToken...`);
  const RpcClient = await loadRpcClient();
  const client = new RpcClient({
    accessKeyId: akid,
    accessKeySecret: akkey,
    endpoint: NLS_TOKEN_ENDPOINT,
    apiVersion: NLS_TOKEN_API_VERSION,
  });

  const startedAt = Date.now();
  const result = (await Promise.race([
    client.request("CreateToken"),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`CreateToken 超时 ${CREATE_TOKEN_TIMEOUT_MS}ms`)),
        CREATE_TOKEN_TIMEOUT_MS,
      ),
    ),
  ])) as CreateTokenResponse;
  console.warn(`[asr-token] CreateToken done in ${Date.now() - startedAt}ms`);

  if (result.ErrMsg) {
    throw new Error(`ALIYUN_CREATE_TOKEN_ERROR: ${result.ErrMsg}`);
  }
  if (!result.Token?.Id || !result.Token.ExpireTime) {
    throw new Error("ALIYUN_CREATE_TOKEN_MALFORMED: 响应缺少 Token.Id / ExpireTime");
  }

  const fresh: CachedToken = {
    token: result.Token.Id,
    expireAt: result.Token.ExpireTime,
  };
  globalCache.__aliyunNlsToken = fresh;
  return {
    token: fresh.token,
    expireAt: fresh.expireAt,
    appkey,
    wsUrl: NLS_WS_URL,
  };
}
