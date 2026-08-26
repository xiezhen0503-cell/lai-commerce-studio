# 智能体互操作

工作台向外暴露同一套能力的三种视图：REST 适合业务系统，MCP 适合工具型智能体，A2A 适合有身份和任务生命周期的智能体。三者共享 Token、scope、projectIds、幂等和审计实现。

## 交接合同

`AgentHandoff` 必须包含 handoffId、taskId、objective、projectId、projectContextUri、sourceUris、factSnapshotId、promptSpecId、constraints、expectedOutputSchema、allowedTools、permissionScope、approvalPolicy、创建者和过期时间。它传递资源引用而不是整库复制，禁止包含密钥和无关个人信息。

## 权限

scope 示例：`project:read`、`fact:read`、`prompt:write`、`prompt:run`、`artifact:write`、`artifact:review`。Agent Token 还绑定 workspace、项目白名单、过期时间和可选 IP allowlist。事实确认、真实发布和批准没有默认 Agent scope。

## 写回协议

外部智能体只能创建或更新自己有权限的草稿，写回时必须带 `factSnapshotId`、作者类型 `external-agent` 和幂等键。若当前项目快照已变化，服务端拒绝静默覆盖并要求重新评估。产物提交后进入人工 Review，而不是直接发布。

## 标准基线

MCP 使用稳定版 2025-11-25 的 Streamable HTTP；A2A 使用 1.0 语义和 Agent Card `supportedInterfaces`，请求携带 `A2A-Version: 1.0`。协议升级通过适配层完成，不改变领域模型。
