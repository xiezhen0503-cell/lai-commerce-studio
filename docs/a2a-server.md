# A2A Server

服务地址默认 `http://127.0.0.1:3102`。Agent Card 位于 `/.well-known/agent-card.json`，通过每个 `supportedInterfaces[].protocolVersion` 声明 1.0，并公开技能、认证方式和 capabilities。

## 接口

- JSON-RPC：`POST /a2a`，支持 `SendMessage`、`GetTask`、`CancelTask`。
- HTTP+JSON：`POST /a2a/v1/messages:send`、`GET /a2a/v1/tasks/{id}`、`POST /a2a/v1/tasks/{id}:cancel`；流式入口为 `POST /a2a/stream`。
- 流式接口使用 SSE，事件依次报告 submitted、working、completed/failed。

请求必须带 `A2A-Version: 1.0` 与 Bearer Token。创建任务建议携带 `Idempotency-Key`。消息 metadata 中传递 projectId、promptSpecId、factSnapshotId；服务端不会接受消息正文替代权限判断。

## 示例

```bash
curl -X POST http://127.0.0.1:3102/a2a/v1/messages:send \
  -H "Authorization: Bearer lai_demo_agent_token" \
  -H "A2A-Version: 1.0" -H "Content-Type: application/json" \
  -d '{"message":{"role":"ROLE_USER","parts":[{"text":"生成商品上新方案"}],"metadata":{"projectId":"prj_qingmai_launch"}}}'
```

A2A 1.0 参考：[官方规范](https://a2a-protocol.org/dev/specification/)。
