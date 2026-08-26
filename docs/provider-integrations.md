# Provider 集成

## 文本模型路由

`RoutedTextProvider` 支持 `LAI_TEXT_PROVIDER=auto | openai | openrouter | mock`。`auto` 会先检测 OpenAI，再检测 OpenRouter；都没有密钥时使用 `MockTextProvider`。公开测试站显式使用 `openrouter`，通过 OpenRouter Chat Completions API 调用 `openrouter/free` 免费模型路由；正式切回 Codex 时设置为 `openai`。

OpenAI 请求只在服务端发出，使用 `store: false`，默认推理强度为 `low`。可通过 `OPENAI_MODEL` 与 `OPENAI_REASONING_EFFORT` 调整。API Key、组织 ID 和项目 ID 不会返回浏览器或写入日志。

模型调用失败时不会偷偷切回 Mock，以免把演示内容冒充真实模型结果；只有“未配置任何真实密钥”的 `auto` 模式会使用 Mock。OpenRouter 免费模型只有低频测试额度，模型和可用性可能变化，页面会明确标为“免费测试模型”。

公开测试站点建议同时配置 `WORKBENCH_ACCESS_TOKEN`。用户通过 `/access/{token}` 专属链接进入后，服务端设置 7 天 HttpOnly Cookie；模型生成接口会校验该 Cookie，避免公开页面被批量消耗模型额度。这个 Token 只是测试链接凭证，不得替代正式用户登录与权限系统。

## Mock 能力

MockTextProvider 生成确定性文案，MockDocumentProvider 模拟解析，MockImageProvider 返回带元数据的占位资产，MockVideoProvider 返回模板化渲染结果。它们支持种子、可重试错误和任务进度，保证无外部密钥也能测试完整流程。

## Provider 合同

每个 Provider 声明 `id/capabilities/configured/sideEffects`，实现 `generate` 或 `parse`，并返回 provider、model、usage、latency、artifact metadata。错误归一为 auth/rate-limit/invalid-input/transient/safety/permanent；只有 transient 和 rate-limit 可以自动重试。

## 可选集成

- 文本模型：OpenAI Responses API 与 OpenRouter 免费路由均已接入；Anthropic、Gemini 当前只提供配置状态 Adapter。
- 文档：Docling/RAGFlow 只接收白名单文件，结果仍要经过事实确认。
- 图像：ComfyUI 等服务必须通过 SSRF allowlist，产品外观和文字保真由审核负责。
- 视频：Remotion 模板可本地预览；服务端渲染需单独确认算力与许可证。
- 工作流：n8n/Dify 可消费 REST/MCP/A2A，但不能绕过本平台权限和人工审核。

## 配置原则

密钥只来自环境变量或秘密管理服务，配置页只显示“已配置/未配置”和尾号。启动健康检查不能把未配置的可选 Provider 当成失败。外部请求记录用途、模型、成本估算和 traceId，不记录原始密钥。
