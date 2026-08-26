# Prompt Engine

## PromptSpec

PromptSpec 不是一段字符串，而是可版本化的合同：`objective`、`audience`、`platform`、`inputs`、`factSnapshotId`、`constraints`、`instructions`、`outputSchema`、`examples`、`qualityCriteria`、`failureConditions`、`modelHints`、`sideEffects`。任何运行都必须记录 Spec、快照、Provider、产物和日志的关联。

## 三档版本

- 保守：强调证据与最小推断，适合合规敏感和首轮草稿。
- 平衡：在事实不变的前提下增加场景和表达变化，是默认推荐。
- 探索：允许更强创意张力，但无证据数字和功效仍被禁止。

## 编译目标

编译器输出中文、英文、Markdown、JSON，以及 OpenAI、Anthropic、Gemini 的消息结构；Handoff 编译器输出最小上下文、资源 URI、权限、验收标准和人工批准策略。模型专用字段只存在于 Adapter，不污染通用 PromptSpec。

## 11 维评估

目标清晰度、受众与渠道、事实绑定、来源完整、约束覆盖、输出结构、模型适配、示例质量、失败条件、副作用透明、人工审核。每维 0–10，阻断项优先于总分。高分不能抵消“快照缺失”“无证据功效”或“未确认发布”。

## 事实规则

编译时只注入指定快照中的事实；数字、规格、价格、成分、资质、活动时间都带事实 ID。推断与创意分区显示。快照变更不会静默修改旧 Spec，而是创建新版本并产生影响提醒。

## 可观测性

Prompt Run 记录 traceId、Provider、模型、开始/结束、状态、错误类别、输入输出摘要和产物 ID。日志先脱敏再持久化；密钥、Bearer Token、Webhook Secret 不进入提示词或日志。
