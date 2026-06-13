# AGENTS.md — Agent 开发规范

> 本文件是 AI Agent（Claude Code / Cursor / Copilot 等）在本仓库内进行任何代码改动时的强制约束。
> 所有 Agent 在执行任务前必须先读取本文件，并在 PR 描述中显式声明"已遵循 AGENTS.md"。
> 任何偏离本规范的行为，需在 PR 中说明原因并取得 Reviewer 同意。

---

## 0. 总则（Top Principles）

1. **小步快跑**：每次只做一件事，单 PR 单职责，单 commit 单意图。
2. **可解释性优先**：写不出 commit message / PR 描述的改动不要做。
3. **不破坏现状**：任何改动必须保证 `build / lint / test` 全绿，禁止 `--no-verify` 跳过校验。
4. **不臆造**：未读源码不下结论，未跑通的代码不提交，未验证的接口不调用。
5. **少即是多**：能复用不新增、能修改不重写、能删除不保留。

---

## 1. 项目架构规范（架构清晰度与合理性，权重 40%）

### 1.1 分层原则

按"自外向内、依赖倒置"组织代码，禁止跨层调用：

```
┌──────────────────────────────────────────┐
│ interfaces/    HTTP / CLI / 定时任务入口  │
├──────────────────────────────────────────┤
│ application/   用例编排、事务边界          │
├──────────────────────────────────────────┤
│ domain/        领域模型、业务规则（纯函数）│
├──────────────────────────────────────────┤
│ infrastructure/ DB / 缓存 / 外部 API     │
└──────────────────────────────────────────┘
```

- `domain` 不得 import `infrastructure`、`interfaces`。
- `application` 通过接口调用 `infrastructure`，禁止直接 `new` 具体实现。
- 跨模块通信走显式 API（函数 / 事件 / 接口），禁止共享全局可变状态。

### 1.2 模块划分

- 按**业务领域**划分目录，禁止按"技术分类"（如 `controllers/` `services/` `utils/` 一锅端）作为唯一组织方式。
- 单个模块对外暴露一个 `index.ts` / `__init__.py` 作为门面，内部细节不外泄。
- 出现循环依赖立即停手，先重构再继续。

### 1.3 依赖管理

- 三方库使用**精确版本号**（`1.2.3` 非 `^1.2.3`），由 lockfile 锁定。
- 引入新依赖必须在 PR 描述中说明：用途、替代方案、维护活跃度、License。
- 同类功能禁止引入两个库（如同时存在 `axios` 与 `node-fetch`）。

### 1.4 配置与密钥

- 任何 secret / token / 数据库连接串通过环境变量注入，禁止硬编码。
- 提供 `.env.example`，启动时校验必需变量缺失则 fail-fast。

---

## 2. 代码健壮性（逻辑、规范、可读性，权重 40%）

### 2.1 命名

| 对象 | 风格 | 示例 |
|---|---|---|
| 变量 / 函数 | camelCase，动词开头 | `fetchUserOrders` |
| 布尔值 | `is/has/should/can` 前缀 | `isReady` `hasPermission` |
| 类型 / 类 / 组件 | PascalCase | `OrderService` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 文件 | 与默认导出同名 | `OrderService.ts` |

禁止：`data` `info` `obj` `temp` `handle` `process` 等无信息量命名。

### 2.2 函数 / 文件体量

- 单函数 ≤ **50 行**，圈复杂度 ≤ **10**。
- 单文件 ≤ **400 行**（硬上限 800），超出立即拆分。
- 嵌套层级 ≤ **4**，多用 early-return 替代 if-else 金字塔。

### 2.3 错误处理

- **显式优于隐式**：禁止空 `catch`、禁止 `catch` 后只 `console.log`。
- 业务错误用领域异常类型（如 `OrderNotFoundError`），不用裸 `Error`。
- 系统边界（HTTP / RPC / DB）必须捕获并转换为统一响应结构：
  ```json
  { "success": false, "code": "ORDER_NOT_FOUND", "message": "...", "data": null }
  ```
- 不可恢复错误 fail-fast，可恢复错误带重试 + 退避策略。

### 2.4 输入校验

- 所有外部输入（HTTP body / query / 文件 / 第三方 API 响应）使用 schema 校验（zod / pydantic / joi 等），校验失败立即拒绝。
- 内部函数信任调用方，不做防御性重复校验。

### 2.5 不可变性

- 默认 `const` / `readonly` / `Final`，需要变更时返回新对象。
- 禁止直接 mutate 入参，禁止 `Array.prototype.sort` 之类的就地修改后返回原引用。

### 2.6 可读性

- 一段代码读两遍才懂 = 需要重构或加注释（**说明 why，不说明 what**）。
- 删除注释而不是更新错误注释。
- 不写 `// TODO` 不带 issue 链接 / 责任人 / 截止时间。

### 2.7 禁止项（自动 reject）

- `console.log` / `print` 调试残留进 main 分支
- 注释掉的代码块
- `any` / `unknown` 滥用（TS）、`interface{}` 滥用（Go）
- 复制粘贴 ≥ 3 处的代码块未抽取
- 魔法数字（>1 处使用必须命名常量）

---

## 3. 测试规范

- 新增 / 修改业务代码必须配套测试，**行覆盖率 ≥ 80%、分支覆盖率 ≥ 70%**。
- 测试遵循 AAA（Arrange-Act-Assert）结构。
- 测试名描述行为而非实现：`returns 404 when order does not exist` 而非 `test1`。
- 单元测试不依赖网络 / 文件系统 / 真实数据库；集成测试使用容器化依赖（testcontainers）。
- TDD 流程：失败用例 → 最小实现 → 重构，三步分别 commit 更佳。

---

## 4. Commit 规范（commit 分布合理性）

### 4.1 格式（Conventional Commits）

```
<type>(<scope>): <subject>

<body：why & 影响面，可选>

<footer：BREAKING CHANGE / closes #123，可选>
```

`type`：`feat | fix | refactor | perf | docs | test | chore | ci | build | style`

### 4.2 粒度与分布

| 维度 | 要求 |
|---|---|
| 单 commit 改动行数 | 建议 ≤ 200 行，硬上限 500 行 |
| 单 commit 文件数 | 建议 ≤ 10 个 |
| 提交频率 | 每完成一个**可独立解释的逻辑单元**就 commit |
| 一天内 commit 分布 | 避免"一天一巨型 commit"或"50 个 wip" |
| 禁止 | `wip` / `update` / `fix bug` / `.` 这类无信息 message |

### 4.3 推荐拆分原则

> 一个 PR 内的 commit 应能独立 revert，每个 commit 单独 checkout 时仓库都应保持可编译。

- 重构 commit 与功能 commit 分开（`refactor:` 在前，`feat:` 在后）。
- 测试 commit 与实现 commit 可合可分，但禁止"先合并实现，下个 PR 再补测试"。
- 格式化 / rename / move 这类大面积变更单独成 commit。

---

## 5. PR 规范（PR 数量与质量）

### 5.0 核心原则（强制）

1. **基于 PR 添加新功能** — 所有功能变更通过 PR 流程合入主分支。
2. **每个 PR 只做一件事** — 单 PR 单职责；鼓励尽可能小、粒度尽可能细的 PR；大功能拆分为多个独立 PR 分步提交。
3. **PR 标题与描述清晰完整** — 必须包含：标题（一句话说明）/ 功能描述 / 实现思路 / 测试方式（详见 5.3）。
4. **合并后主分支保持可运行** — 任意时间 checkout `main` 评委都能复现演示效果，禁止合入"半成品"。

### 5.1 PR 大小

- **目标**：净变更 **≤ 400 行**（不含锁文件 / 自动生成代码）。
- 超过 800 行必须拆分，除非是首次脚手架 / 大版本依赖升级（PR 描述中说明）。
- 单 PR 文件数 ≤ 30 个。

### 5.2 PR 数量节奏

- 一个**功能特性**（feature）建议拆为 3–7 个 PR：架构骨架 → 核心逻辑 → 边界处理 → 文档/测试补全。
- 禁止"一周不提，提一个 5000 行的炸弹"。
- 禁止"为了刷数量把一个改动拆成 10 个 1 行 PR"。
- 评估标准：**每个 PR 都能独立讲清"做了什么 / 为什么 / 怎么验证"**。

### 5.3 PR 描述模板（必填）

```markdown
## 标题
一句话说明本 PR 新增/修改了什么

## 功能描述
该功能的作用与使用方式

## 实现思路
技术选型或核心实现逻辑

## 测试方式
如何验证该功能正常运行（手测步骤 / 自动化测试 / curl 示例等）
```

> 以上四项为最低要求。根据 PR 性质可追加以下补充信息：

**可选补充项：**

```markdown
## Screenshots / Logs
<UI 改动必附；接口改动附 curl 示例>

## Checklist
- [ ] 已遵循 AGENTS.md
- [ ] 已自测通过
- [ ] 已更新文档 / CHANGELOG
- [ ] 无 secret 泄漏
- [ ] 无 console.log / 调试代码残留
```

### 5.4 PR 流程

1. 从 `main` 切出 `feat/xxx` `fix/xxx` `refactor/xxx` 分支。
2. 推送前本地必须跑通：`lint && typecheck && test && build`。
3. CI 全绿后请求 Review，至少 **1 名人类 Reviewer + 1 次 code-reviewer agent 复审**。
4. CRITICAL / HIGH 级问题必须解决，MEDIUM 视情况，LOW 可记 issue 后置。
5. 合并方式优先 **Squash**（保留 PR title 作为 squash message），需要保留 commit 历史时使用 **Rebase**，禁止 Merge commit。

### 5.5 项目阶段适用范围（强制 PR 的触发线）

为避免规范脱离实际，PR 流程的强度按项目阶段递进：

| 阶段 | 状态 | 流程要求 |
|---|---|---|
| **早期单人原型** | 仅一名贡献者 + 未部署生产 + 无外部用户 | 允许直推 `main`，但仍遵守 `4. Commit 规范`（Conventional Commits / 单意图 / 中文 subject） |
| **多人协作 / 触发线之后** | 出现以下任一即切换 | 强制 PR 流程（`5.1 ~ 5.4` 全量生效） |

**触发线**（命中任一即从下一次改动起强制 PR）：

- 出现第二位贡献者（无论人类还是 AI Agent 长期参与）
- 部署到生产环境（即使是 staging/preview 公网可访问）
- 有外部 review / 客户验收需求
- 引入 CI/CD 自动化部署

**生效约定**：

- 触发线之前已直推到 `main` 的 commit 视为既成事实，不回头补 PR / revert / 重写历史。
- 触发线之后任何新改动必须走 `feat/* | fix/* | refactor/* | chore/* | docs/*` 分支提 PR，不再容忍直推 `main`。
- 在 PR 描述里 reference 历史直推工作时使用 `(包含早期阶段直推改动)` 标注，让阅读者了解上下文。

### 5.6 安全敏感 PR

涉及鉴权 / 支付 / 用户数据 / 加密 / 文件上传 / SQL 拼接的改动，必须额外触发 `security-reviewer` agent，并在 PR 中附审查结论。

---

## 6. Agent 协作规范

### 6.1 Agent 职责边界

| Agent | 触发时机 |
|---|---|
| `planner` | 复杂特性 / 跨模块重构启动前 |
| `architect` | 涉及分层、模块边界、技术选型决策 |
| `tdd-guide` | 新功能 / Bug 修复（强制先写测试）|
| `code-reviewer` | 写完代码、提 PR 前 |
| `security-reviewer` | 安全敏感 PR、提交前 |
| `build-error-resolver` | CI / 本地构建失败时 |
| `refactor-cleaner` | 删除死代码、统一风格 |

### 6.2 强制并行

独立任务（多文件审查、多维度评估）必须并行调用 Agent，禁止顺序串行浪费 token。

### 6.3 Agent 不可越权

- Agent 禁止执行：`git push --force` / `rm -rf` / `DROP TABLE` / 修改 `.git` 配置 / 调用付费第三方 API（除非任务明确要求）。
- 涉及生产环境、共享资源、不可逆操作必须由人类二次确认。

---

## 7. 文档规范

- 公共 API（HTTP / SDK 导出）必须有 JSDoc / docstring，包含参数、返回、异常、示例。
- 架构级决策记录到 `docs/adr/NNNN-title.md`（ADR 格式）。
- 用户可见行为变更必须更新 `CHANGELOG.md`（Keep a Changelog 格式）。
- README 至少包含：项目简介、技术栈、本地启动、目录结构、贡献指南。

---

## 8. Definition of Done（任务完成判定）

一个任务被视为完成，当且仅当：

- [ ] 功能按需求实现，边界场景覆盖
- [ ] 单元 + 集成测试通过，覆盖率达标
- [ ] `lint` / `typecheck` / `build` 全绿
- [ ] 自测通过（UI 改动有截图 / 录屏）
- [ ] code-reviewer agent 无 CRITICAL / HIGH 反馈
- [ ] 文档 / CHANGELOG / ADR 已同步
- [ ] commit 拆分合理、message 可读
- [ ] PR 描述完整、CI 全绿、Reviewer Approved

任一项未达成，**不得合并主分支**。

---

## 9. 违规处理

- 单次违规：Reviewer 在 PR 中指出，Agent 立即修正。
- 重复违规：将该规则写入 `feedback_*.md` 长期记忆，后续强校验。
- 严重违规（绕过安全 / 直接 push main / 提交 secret）：立即 revert + 复盘。

---

> 最后更新：2026-06-12
> 维护者：架构组
> 反馈：在 `docs/agents-feedback.md` 提交建议
