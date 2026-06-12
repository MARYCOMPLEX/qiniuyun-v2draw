# CI/CD 部署指南

## 架构流程

```
git tag dev-xxx (或 GitHub Actions 手动触发)
         ↓
   GitHub Actions
         ↓
  Build Docker Image (Next.js standalone)
         ↓
  Push to Aliyun ACR
         ↓
  SSH 到部署服务器
         ↓
  docker pull + docker compose up -d
         ↓
  /api/health 健康检查 (20 次重试)
```

## 一、GitHub 仓库配置

进入 GitHub 仓库 → Settings → Secrets and variables → Actions

### Variables(可见)

| Name | Value 示例 |
|---|---|
| `ALIYUN_REGISTRY` | `registry.cn-hangzhou.aliyuncs.com` |
| `ALIYUN_NAMESPACE` | `voice-canvas` |

### Secrets(机密)

| Name | 说明 |
|---|---|
| `ALIYUN_USERNAME` | 阿里云 ACR 用户名 (例 `aliyun3607740566`) |
| `ALIYUN_PASSWORD` | ACR 访问密码 (在 ACR 控制台「访问凭证」设置) |
| `SSH_HOST` | 部署服务器公网 IP / 域名 |
| `SSH_KEY` | SSH 私钥完整内容 (`-----BEGIN ... PRIVATE KEY-----`) |

## 二、阿里云容器镜像服务 (ACR)

1. 登录 [ACR 控制台](https://cr.console.aliyun.com)
2. 创建命名空间 `voice-canvas`
3. 创建镜像仓库 `voice-canvas/app`(本地仓库,公开/私有都行)
4. 在「访问凭证」里设置固定密码,填入 `ALIYUN_PASSWORD`
5. 复制 ACR 域名(例 `registry.cn-hangzhou.aliyuncs.com`)填入 `ALIYUN_REGISTRY`

## 三、服务器初始化

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 2. 创建 deploy 用户

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/voice-canvas
sudo chown deploy:deploy /opt/voice-canvas
```

### 3. 配置 SSH 密钥

```bash
# 本地生成
ssh-keygen -t ed25519 -C "deploy@voice-canvas" -f ~/.ssh/voice_canvas_deploy

# 公钥上传到服务器
ssh-copy-id -i ~/.ssh/voice_canvas_deploy.pub deploy@<服务器IP>

# 私钥内容贴进 GitHub Secret SSH_KEY
cat ~/.ssh/voice_canvas_deploy
```

### 4. 配置环境变量

服务器登录 `deploy` 用户,在 `/opt/voice-canvas/` 创建 `.env.docker`:

```bash
cd /opt/voice-canvas
cat > .env.docker <<'EOF'
# LLM
LLM_DEFAULT_PROVIDER=openai-compatible
LLM_DEFAULT_MODEL=gemini-3-flash-preview
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://yunwu.ai/v1

# ASR (阿里云实时语音识别)
ASR_PROVIDER=aliyun-nls
ALIYUN_NLS_APP_KEY=xxx
ALIYUN_ACCESS_KEY_ID=LTAI...
ALIYUN_ACCESS_KEY_SECRET=...
EOF
chmod 600 .env.docker
```

## 四、触发部署

### 方法 A:打 tag(推荐)

```bash
git tag dev-001
git push origin dev-001
```

只要 tag 以 `dev-` 开头,workflow 自动触发,镜像 tag = `dev-001`。

### 方法 B:GitHub Actions 手动触发

进入仓库 → Actions → "Build & Deploy" → Run workflow:
- `skip_build = false`(默认):走完整 build + deploy
- `skip_build = true` + `tag = dev-001`:只重部署已存在的镜像(快速回滚 / 重启用)

## 五、首次部署 checklist

- [ ] ACR 命名空间和仓库已创建
- [ ] GitHub Secrets/Variables 全部填好
- [ ] 服务器已装 Docker 并创建 deploy 用户
- [ ] SSH 公钥已加到服务器,本地能 `ssh deploy@<IP>` 免密登录
- [ ] `/opt/voice-canvas/.env.docker` 已写好真实 secret
- [ ] `git push --tags` 触发首次 dev-* tag
- [ ] Actions 页面 build 阶段绿
- [ ] Actions 页面 deploy 阶段绿(含 health check)
- [ ] 浏览器访问 `http://<服务器IP>:3000` 验证

## 六、常见问题

### build 失败 "Permission denied (publickey)"

SSH_KEY secret 内容不全或缺换行。重新生成 + 复制完整私钥(含 `-----BEGIN/END-----` 行)。

### deploy 健康检查失败

```bash
ssh deploy@<IP>
cd /opt/voice-canvas
docker compose logs app
```

最常见: `.env.docker` 缺关键变量(LLM key / ASR appkey)。

### 镜像拉取失败 "denied: requested access denied"

ACR 用户名/密码错或镜像仓库不在指定命名空间下。

### 想回滚到上一版本

```
GitHub Actions → Run workflow → skip_build=true → tag=dev-上一版
```

或在服务器:

```bash
cd /opt/voice-canvas
sed -i 's|^TAG=.*|TAG=dev-上一版|' .env
docker compose up -d
```

## 七、本地开发

正常开发不走 Docker:

```bash
npm run dev
```

仅在改 Dockerfile / docker-compose.yml 后,本地验证镜像能编译过:

```bash
docker build -t voice-canvas-local .
docker run --rm -p 3000:3000 --env-file .env.local voice-canvas-local
curl http://localhost:3000/api/health
```
