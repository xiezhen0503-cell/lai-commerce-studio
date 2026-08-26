# Provider 集成

## 文本模型路由

`RoutedTextProvider` 默认使用 `LAI_TEXT_PROVIDER=auto`：服务端检测到 `OPENAI_API_KEY` 时，通过 OpenAI Responses API 调用 Codex `gpt-5.6-sol`；没有密钥时使用 `MockTextProvider`。也可以显式设置 `LAI_TEXT_PROVIDER=openai` 或 `LAI_TEXT_PROVIDER=mock`。

OpenAI 请求只在服务端发出，使用 `store: false`，默认推理强度为 `low`。可通过 `OPENAI_MODEL` 与 `OPENAI_REASONING_EFFORT` 调整。API Key、组织 ID 和项目 ID 不会返回浏览器或写入日志。

模型调用失败时不会偷偷切回 Mock，以免把演示内容冒充真实模型结果；只有“未配置密钥”的 `auto` 模式会使用 Mock。

## Mock 能力

MockTextProvider 生成确定性文案，MockDocumentProvider 模拟解析，MockImageProvider 返回带元数据的占位资产，MockVideoProvider 返回模板化渲染结果。它们支持种子、可重试错误和任务进度，保证无外部密钥也能测试完整流程。

## Provider 合同

每个 Provider 声明 `id/capabilities/configured/sideEffects`，实现 `generate` 或 `parse`，并返回 provider、model、usage、latency、artifact metadata。错误归一为 auth/rate-limit/invalid-input/transient/safety/permanent；只有 transient 和 rate-limit 可以自动重试。

## 可选集成

- 文本模型：OpenAI Responses API 已接入；Anthropic、Gemini 当前只提供配置状态 Adapter。
- 文档：Docling/RAGFlow 只接收白名单文件，结果仍要经过事实确认。
- 图像：ComfyUI 等服务必须通过 SSRF allowlist，产品外观和文字保真由审核负责。
- 视频：Remotion 模板可本地预览；服务端渲染需单独确认算力与许可证。
- 工作流：n8n/Dify 可消费 REST/MCP/A2A，但不能绕过本平台权限和人工审核。

## 配置原则

密钥只来自环境变量或秘密管理服务，配置页只显示“已配置/未配置”和尾号。启动健康检查不能把未配置的可选 Provider 当成失败。外部请求记录用途、模型、成本估算和 traceId，不记录原始密钥。
