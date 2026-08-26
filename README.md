# 小赖电商工作台 · LaiCommerce Studio

[![Cross-platform CI](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/macos-ci.yml/badge.svg)](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/macos-ci.yml)
[![CodeQL](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/codeql.yml/badge.svg)](https://github.com/xiezhen0503-cell/lai-commerce-studio/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f855a.svg)](LICENSE)

[在 GitHub Codespaces 中打开](https://codespaces.new/xiezhen0503-cell/lai-commerce-studio?quickstart=1)，无需先在个人电脑安装项目依赖。Codespaces 创建完成后运行 `pnpm dev`。

一个项目优先、事实驱动、可审计的中文电商 AI 内容生产平台。它不是聊天壳：品牌、商品、来源、事实快照、提示词、物料、版本、任务、评审与智能体权限都落在本地 SQLite 中，可通过 Web、REST、MCP 和 A2A 使用。

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

打开 `http://127.0.0.1:3000`。MCP 服务位于 `http://127.0.0.1:3101/mcp`，A2A 服务位于 `http://127.0.0.1:3102`。仓库默认启用 Mock Provider，无需任何外部密钥即可完成全流程。

`pnpm run app:setup` 会跨平台创建 `.env`、上传目录和演示数据库，不依赖 PowerShell。若只运行 Web，执行 `pnpm --filter @lai/web dev`。完整 Mac 安装、Apple Silicon 排错和 Windows→Mac 迁移见 [macOS 安装指南](docs/macos-setup.md)。

## 第一次使用

1. 在“项目”打开已预置的虚构项目“青麦脆夏日上新”，或用四步向导新建项目。
2. 上传资料并检查来源定位、冲突、缺失与置信度；只有人类用户能确认事实。
3. 在 Prompt Lab 选择任务，比较保守、平衡、探索三版提示词和 11 维评分。
4. 运行提示词，或在项目页生成整套 Campaign Bundle。
5. 在“任务中心”查看进度，在“审核中心”处理价格、规格、时间、资质、功效和对外发布等高风险项。
6. 在“智能体接入”签发最小权限 Token；Token 仅显示一次，支持过期、项目范围与撤销。

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
| 文案、图片、语音、视频与文档 Provider | Mock 演示；输出可复现，不产生真实费用 | 无 API Key、无 GPU |
| Remotion | 三个模板和浏览器 Player 预览已实现 | 本地预览不需要 GPU；服务端批量渲染需独立部署，并核验 Remotion 许可 |
| OpenAI / Anthropic / Gemini | Adapter 和配置状态已实现，默认关闭 | 需要对应 API Key |
| Docling / RAGFlow / Dify / ComfyUI / n8n / Langfuse | Adapter 边界和配置页已实现，默认关闭 | 需要独立部署；ComfyUI 通常需要 GPU；部分产品有商业或分发限制 |
| 真实电商平台发布 | 未实现，且不由本项目自动执行 | 下一阶段需平台授权、当期规则审核和发布前人工确认 |

可选服务未配置时明确显示“未配置”，不会伪装连接成功，也不会阻断 Mock 主流程。

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

构建后运行 `pnpm start`。生产环境必须设置随机 `AGENT_TOKEN_PEPPER` 与 `WEBHOOK_SECRET`，接入 HTTPS/OIDC、真实病毒扫描、对象存储、队列 Worker、备份、出站 allowlist 和集中审计；删除演示 Token 与虚构数据。`docker-compose.example.yml` 只演示进程和环境变量，不是生产安全基线。

## 已知限制

- SQLite 和同步 Worker 面向单机演示/小团队，不适合多副本高并发；扩展路径见架构文档。
- macOS CI 使用 GitHub `macos-14` 验证；Playwright WebKit 不是 Apple Safari 本体，正式交付仍需在小赖的真实 Mac/Safari 上做一次点击验收。
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

外部模型、Docling、ComfyUI、Remotion Server Render 等集成目前提供接口、配置页和 Adapter，默认不主动调用。公开发布、付费生成、覆盖、删除、事实确认和批准始终需要明确的人类动作。这里的品牌、商品、数据和账号均为虚构演示。
