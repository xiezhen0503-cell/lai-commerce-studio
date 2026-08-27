# Provider 集成

## 文本模型路由

`RoutedTextProvider` 支持 `LAI_TEXT_PROVIDER=auto | openai | pollinations | openrouter | mock`。`auto` 会依次检测 OpenAI、Pollinations 文本 Key 与 OpenRouter；都没有密钥时只在本地开发模式使用 `MockTextProvider`。公开测试站显式使用 `pollinations`，通过 OpenAI 兼容的 Chat Completions API 调用只允许 `nemotron-3.5-lightning` 的 Quest Pollen Key；正式切回 Codex 时设置为 `openai`。

OpenAI 请求只在服务端发出，使用 `store: false`，默认推理强度为 `low`。可通过 `OPENAI_MODEL` 与 `OPENAI_REASONING_EFFORT` 调整。API Key、组织 ID 和项目 ID 不会返回浏览器或写入日志。

模型调用失败时不会偷偷切回 Mock，以免把演示内容冒充真实模型结果；只有“未配置任何真实密钥”的 `auto` 模式会使用 Mock。OpenRouter 免费模型只有低频测试额度，模型和可用性可能变化，页面会明确标为“免费测试模型”。

公开测试站点建议同时配置 `WORKBENCH_ACCESS_TOKEN`。用户通过 `/access/{token}` 专属链接进入后，服务端设置 7 天 HttpOnly Cookie；模型生成接口会校验该 Cookie，避免公开页面被批量消耗模型额度。这个 Token 只是测试链接凭证，不得替代正式用户登录与权限系统。

## 本地真实能力与演示替代

- `LocalDocumentParser` 会在服务端真实读取 TXT、Markdown、CSV、PDF 文本层、DOCX、PPTX 和 XLSX。JPG/PNG 在配置 OpenRouter 时通过支持图片输入的 `openrouter/free` 路由识别；没有视觉模型或识别失败时，原图仍保存并明确提示，不伪装成已提取正文。
- `RoutedImageProvider` 在生产真实模式调用 Pollinations 图像模型；`Sharp` 再把品牌名、商品名、已确认规格/价格/日期与 CTA 稳定排版为 1024×1024 PNG。没有图像 Key 或调用失败时会明确报错，不会回退 SVG 冒充商品图。
- Remotion Player 与服务端 Renderer 使用同一套组合。导出接口真实生成 H.264 MP4、PNG 封面与 SRT 字幕，并按内容哈希缓存成片。
- `MockTextProvider`、`MockVoiceProvider`、`MockVideoProvider` 与确定性 SVG 只用于本地开发和自动测试；`LAI_REQUIRE_LIVE_OUTPUTS=true` 时禁止进入公开生成链路。

## Provider 合同

每个 Provider 声明 `id/capabilities/configured/sideEffects`，实现 `generate` 或 `parse`，并返回 provider、model、usage、latency、artifact metadata。错误归一为 auth/rate-limit/invalid-input/transient/safety/permanent；只有 transient 和 rate-limit 可以自动重试。

## 可选集成

- 文本模型：OpenAI Responses API 与 OpenRouter 免费路由均已接入；Anthropic、Gemini 当前只提供配置状态 Adapter。
- 文档：内置本地解析器负责常用格式；Docling/RAGFlow 是复杂版面、OCR 和大型知识库的可选升级，所有结果仍要经过事实确认。
- 图像：ComfyUI 等服务必须通过 SSRF allowlist，产品外观和文字保真由审核负责。
- 视频：Remotion 模板可本地预览并由服务端逐帧渲染；部署环境需要 Chromium、足够的 CPU/内存，并需单独核验许可证。
- 工作流：n8n/Dify 可消费 REST/MCP/A2A，但不能绕过本平台权限和人工审核。

## 配置原则

密钥只来自环境变量或秘密管理服务，配置页只显示“已配置/未配置”和尾号。启动健康检查不能把未配置的可选 Provider 当成失败。外部请求记录用途、模型、成本估算和 traceId，不记录原始密钥。
