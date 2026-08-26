# 小赖电商工作台 · LaiCommerce Studio

[![Cross-platform CI](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/macos-ci.yml/badge.svg)](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/macos-ci.yml)
[![CodeQL](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/codeql.yml/badge.svg)](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f855a.svg)](LICENSE)

[在 GitHub Codespaces 中打开](https://codespaces.new/xiezhen0503-cell/lai-commerce-studio?quickstart=1)，无需先在个人电脑安装项目依赖。Codespaces 创建完成后运行 `pnpm dev`。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/xiezhen0503-cell/lai-commerce-studio)

“Deploy to Render”会创建可直接分享的云端测试页面。免费测试时把 `OPENROUTER_API_KEY` 和自定义的 `WORKBENCH_ACCESS_TOKEN` 填入 Render 的 Secret 表单，不要写进 GitHub；如需 Codex，再配置 `OPENAI_API_KEY` 并把 `LAI_TEXT_PROVIDER` 改为 `openai`。部署完成后，把 `https://你的站点.onrender.com/access/你的测试Token` 发给小赖；首次点击会写入 7 天 HttpOnly 测试凭证并自动跳转到工作台。

一个新手可以直接上手、专业团队可以继续深入的中文电商 AI 工作台。默认首页只要求用户选内容类型、平台，再用一句话说明目标；商品资料、事实快照、提示词结构、风险检查和输出格式由系统自动整理。品牌、商品、来源、物料、版本、任务、评审与智能体权限仍完整保留，可通过 Web、REST、MCP 和 A2A 使用。

本仓库采用 MIT 许可证开放源代码。第三方 Provider、Remotion、Dify、n8n、ComfyUI 等仍受各自许可证约束，详见[第三方许可证评估](docs/third-party-licenses.md)。

## macOS 5 分钟启动

macOS（Apple Silicon 与 Intel）为正式支持平台。支持 Node.js 22–24 与 pnpm 11.x，推荐使用 CI 同款 Node 22；仓库提供 `.nvmrc` 和 `.node-version`。

```bash
nvm use
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm run app:setup
pnpm run app:doctor
pnpm dev
```

打开 `http://127.0.0.1:3000`。MCP 服务位于 `http://127.0.0.1:3101/mcp`，A2A 服务位于 `http://127.0.0.1:3102`。文本 Provider 默认使用 `auto`：优先使用 Codex，其次使用 OpenRouter 免费模型，均未配置时保留 Mock 演示链路。

`pnpm run app:setup` 会跨平台创建 `.env`、上传目录和演示数据库，不依赖 PowerShell。若只运行 Web，执行 `pnpm --filter @lai/web dev`。完整 Mac 安装、Apple Silicon 排错和 Windows→Mac 迁移见 [macOS 安装指南](docs/macos-setup.md)。

## 第一次使用

1. 打开首页“新手 AI 工作台”，选择活动方案、短视频脚本、商品主图、视频分镜或整套活动。
2. 勾选发布平台，用一句话说清楚想做什么，然后点击“帮我生成第一版”。
3. 在结果旁查看 AI 使用了多少份资料、多少条已确认事实，以及还有哪些内容不能擅自补写。
4. 需要精细控制时再进入“专业模式”；提示词工坊、任务、审核、智能体和接口能力都收在高级功能里。

首页预置虚构商品，不需要 API key 就能体验 Mock 交互。免费真实模型测试可配置 `OPENROUTER_API_KEY`，使用 `openrouter/free`；要启用 Codex，则配置 `OPENAI_API_KEY`，默认模型为 `gpt-5.6-sol`。所有密钥只放在服务端环境变量或秘密管理服务中，不得写进网页、`.env.example` 或提交到 GitHub。

> Codespaces 只用于运行个人开发环境。端口保持默认的 **Private**；在接入 Session/OIDC 等生产鉴权之前，不要把工作台端口改成 Public。

## 项目结构

```text
apps/web            Next.js 工作台与 REST API
apps/mcp-server     MCP Streamable HTTP 服务
apps/a2a-server     A2A 1.0 兼容服务
packages/domain     Zod 领域模型
packages/database   SQLite 仓储与迁移
packages/prompt-engine  PromptSpec、编译器与评估
packages/providers  Mock/外部 Provider 适配器
packages/permissions 权限策略
packages/security   上传、SSRF、Token、Webhook 安全
.agents/skills      17 个仓库级技能
plugins/lai-commerce-studio  可安装 Codex 插件
docs                产品、架构、协议、安全与许可证文档
```

## 常用命令

```bash
pnpm run app:setup       # 跨平台初始化环境与演示数据库
pnpm run app:doctor      # 检查 Node、架构、SQLite 与测试浏览器
pnpm dev                 # 同时启动 Web、MCP、A2A
pnpm db:seed             # 幂等写入演示数据
pnpm browser:install     # 安装测试所需 Chromium 与 WebKit
pnpm test                # 单元与集成测试
pnpm test:e2e            # Chromium、移动 Chromium、WebKit 测试
pnpm lint && pnpm typecheck
pnpm build
```

不要把 Windows 的 `node_modules`、`.next` 或 Playwright 浏览器缓存复制到 Mac。`better-sqlite3`、Sharp 和 Next SWC 必须由 pnpm 在目标 Mac 上按 `darwin-arm64` 或 `darwin-x64` 重新安装。

## 实现状态与运行条件

| 能力 | 当前状态 | 额外条件 |
|---|---|---|
| 项目、品牌、商品、资料上传、事实/快照、PromptSpec、物料版本、任务、审核、权限与审计 | 已真实实现，本地 SQLite 持久化 | 无 |
| Web、REST、MCP Streamable HTTP、A2A 1.0、SSE、HMAC Webhook 示例 | 已真实实现并通过运行态验证 | 无 |
| 中文文案生成 | OpenAI Responses API 与 OpenRouter 免费路由均已实现；无 Key 时自动回退 Mock | 测试用 `OPENROUTER_API_KEY`；Codex 用 `OPENAI_API_KEY` |
| 图片、语音、视频与文档 Provider | Mock 演示；输出可复现，不产生真实费用 | 无 API Key、无 GPU |
| Remotion | 三个模板和浏览器 Player 预览已实现 | 本地预览不需要 GPU；服务端批量渲染需独立部署，并核验 Remotion 许可 |
| Anthropic / Gemini | Adapter 和配置状态已实现，默认关闭 | 需要对应 API Key |
| Docling / RAGFlow / Dify / ComfyUI / n8n / Langfuse | Adapter 边界和配置页已实现，默认关闭 | 需要独立部署；ComfyUI 通常需要 GPU；部分产品有商业或分发限制 |
| 真实电商平台发布 | 未实现，且不由本项目自动执行 | 下一阶段需平台授权、当期规则审核和发布前人工确认 |

首页会区分“免费测试模型”“Codex”和“演示模式”，不会把免费或 Mock 输出冒充 Codex；生成结果显示实际路由到的模型名。

## REST、MCP 与 A2A 接入

REST 的机器合同在 `/api/openapi` 和 [`docs/openapi.yaml`](docs/openapi.yaml)。外部工具调用示例：

```bash
curl -X POST http://127.0.0.1:3000/api/v1/tools/project.get \
  -H "Authorization: Bearer lai_demo_agent_token" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"prj_qingmai_launch"}'
```

MCP 客户端使用 [`docs/examples/mcp.json`](docs/examples/mcp.json)，服务端为 `http://127.0.0.1:3101/mcp`。A2A Agent Card 为 `http://127.0.0.1:3102/.well-known/agent-card.json`，消息入口为 `/a2a/v1/messages:send`，请求须带 `A2A-Version: 1.0`。

## 创建与撤销智能体 Token

打开“智能体接入 → 连接”，填写名称、项目范围和 scopes 后创建。明文 Token 只显示一次，复制后应存入秘密管理器。撤销可在同一页面执行，或调用 `POST /api/v1/agents/{agentId}/revoke`；撤销后 REST、MCP、A2A 会同时拒绝该 Token。默认 Agent 不能确认事实、批准成果、管理集成或公开发布。

## 生产部署

构建后运行 `pnpm start`。生产环境必须设置随机 `AGENT_TOKEN_PEPPER` 与 `WEBHOOK_SECRET`；免费测试配置 `OPENROUTER_API_KEY`，启用 Codex 则配置 `OPENAI_API_KEY`。本项目包含服务端 API 和 SQLite，不能直接作为纯静态 GitHub Pages 运行。正式公开前还要接入 HTTPS/OIDC、对象存储、队列 Worker、备份、出站 allowlist 和集中审计，并删除演示 Token 与虚构数据。`docker-compose.example.yml` 只演示进程和环境变量，不是生产安全基线。

仓库根目录的 `render.yaml` 用于小赖首轮云端测试：免费服务采用 `/tmp` SQLite 和单请求生成接口，实例重启后会恢复为虚构演示数据，不承诺长期保存上传资料和生成历史。免费实例闲置后可能冷启动；长期正式使用应升级持久化方案。

## 已知限制

- SQLite 和同步 Worker 面向单机演示/小团队，不适合多副本高并发；扩展路径见架构文档。
- macOS CI 分别使用 GitHub `macos-15`（Apple Silicon）与 `macos-15-intel`（Intel）验证；Playwright WebKit 不是 Apple Safari 本体，正式交付仍需在小赖的真实 Mac/Safari 上做一次点击验收。
- Office/PDF 在 Mock 模式只读取元数据；完整正文与表格解析要配置 Docling 等服务。
- 图片/语音/视频是 Mock 或浏览器预览，不是可直接投放的最终媒体。
- OAuth 配置展示了接入边界，尚未实现第三方身份提供商握手。
- 平台规则和广告合规具有时效性，公开发布前仍需运营/法务使用当期规则复核。

演示 Agent Token 是 `lai_demo_agent_token`，只用于本地虚构数据。生产部署前必须删除演示账户、设置 `AGENT_TOKEN_PEPPER` 与 `WEBHOOK_SECRET`、启用 HTTPS，并使用真实的密钥管理系统。

## 文档入口

- [产品规格](docs/product-spec.md)
- [系统架构](docs/architecture.md)
- [Prompt Engine](docs/prompt-engine.md)
- [技能设计](docs/skills-design.md)
- [OpenAPI](docs/openapi.md) / [OpenAPI 3.1 文件](docs/openapi.yaml)
- [MCP](docs/mcp-server.md) / [A2A](docs/a2a-server.md)
- [安全与合规](docs/security-and-compliance.md)
- [第三方许可证](docs/third-party-licenses.md)
- [macOS 安装、迁移与排错](docs/macos-setup.md)
- [REST/MCP/Handoff/Webhook 示例](docs/examples)

## 真实边界

OpenAI 文本模型已提供真实 Responses API 调用；只有服务端存在 `OPENAI_API_KEY` 时才会启用。Docling、ComfyUI、Remotion Server Render 等其他外部集成目前提供接口、配置页和 Adapter，默认不主动调用。公开发布、覆盖、删除、事实确认和批准始终需要明确的人类动作。这里的品牌、商品、数据和账号均为虚构演示。
