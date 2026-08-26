# MCP Server

服务地址默认 `http://127.0.0.1:3101/mcp`，实现 MCP 稳定规范 2025-11-25 的 Streamable HTTP。POST 可返回 JSON 或 SSE；GET 用于服务端事件流；DELETE 结束会话。服务默认无状态，避免本地多进程会话漂移。

## 鉴权示例

```json
{
  "mcpServers": {
    "lai-commerce-studio": {
      "type": "http",
      "url": "http://127.0.0.1:3101/mcp",
      "headers": { "Authorization": "Bearer ${LAI_COMMERCE_TOKEN}" }
    }
  }
}
```

演示环境可设置 `LAI_COMMERCE_TOKEN=lai_demo_agent_token`。真实环境的 Token 只显示一次，不应提交到 Git。

## 能力

Resources 覆盖工作区摘要、品牌、商品、项目、来源、事实、PromptSpec、物料、模板、技能和任务；resource templates 使用 `laicommerce://...` URI。45 个 tools 覆盖项目、来源、事实、提示词、技能、物料、Campaign、Job 与 Review。10 个 prompts 覆盖方案、脚本、图像、视频、平台适配、审核和交接。

## 防护

Origin 只允许本地或显式 allowlist；Bearer Token 经过摘要查询；每身份窗口限流；调用前检查 scope/project；错误使用 MCP error 内容且不回显密钥。`fact.confirm/reject/resolve_conflict` 即使有工具名也会返回 HUMAN_REQUIRED，这是显式治理边界。

规范参考：[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) 与 [OpenAI MCP Server 指南](https://developers.openai.com/plugins/build/mcp-server)。
