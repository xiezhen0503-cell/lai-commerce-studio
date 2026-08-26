# 技能设计

仓库级技能位于 `.agents/skills`，同一套技能被打包到 `plugins/lai-commerce-studio/skills`。每个技能都声明触发/不触发、输入、预检查、事实证据规则、质量/失败/停止/转人工条件和 Side Effects。

| 阶段 | 技能 |
|---|---|
| 资料与事实 | commerce-source-intake、evidence-grounding、brand-style-lock |
| 意图与提示词 | intent-to-brief、beginner-prompt-builder、prompt-reviewer、agent-handoff-builder |
| 内容生产 | ecommerce-plan-generator、selling-point-translator、ecommerce-script-writer |
| 视觉与视频 | visual-campaign-director、image-prompt-and-production、video-storyboard-director、video-renderer |
| 适配与治理 | platform-adapter、campaign-orchestrator、artifact-qa-and-compliance |

## 路由原则

每次一个主技能对最终产物负责，辅助技能通常不超过两个。`campaign-orchestrator` 是总控时，不重复运行同类下游总控。渠道操作严格隔离；平台适配不等于真实发布。事实未确认时仅允许资料整理、缺口分析和带假设草案。

## 副作用分级

纯读取与草稿为低风险；外部模型调用、批量出图和渲染为可计费副作用；发布、删除、覆盖、权限变更和事实确认是高风险副作用。高风险操作不得由技能隐式执行，必须显示目标、范围、成本或不可逆影响并请求人类确认。

## 版本治理

技能版本随行为合同变化递增；文字润色可补丁升级，输入输出或副作用变化需次版本，破坏兼容性需主版本。技能运行记录 name/version/input snapshot/output artifact/trace。
