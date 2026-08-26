# 第三方许可证与采用判断

核验日期：2026-08-26。许可证以各项目仓库当前 LICENSE 和官方商业条款为准；本表不是法律意见。本仓库没有复制下列项目源码，只把它们作为架构或可选集成参考。

| 项目 | 许可证/条款 | 本项目决策 |
|---|---|---|
| Next.js、Zod、better-sqlite3、MCP TypeScript SDK | 各自开源许可（以 lockfile 与包内 LICENSE 为准） | 运行依赖，发布前生成最终 SBOM/NOTICE |
| nexscope-ai/eCommerce-Skills | MIT | 仅参考技能分层，不复制内容 |
| ecommerce-visual-copywriting-skill | MIT | 仅参考视觉文案任务边界 |
| MoneyPrinterTurbo | MIT | 仅参考视频流水线分层 |
| Docling | MIT | 可选文档 Provider，未内置 |
| promptfoo、Promptflow、PromptWizard | MIT | 仅参考提示词评测/编排思想 |
| RAGFlow | Apache-2.0 | 可选外部知识服务，未内置 |
| ComfyUI | GPL-3.0 | 只允许独立服务集成；分发前需专项评估 GPL 义务 |
| Dify | 修改版 Apache-2.0，含多租户、前端与标识限制 | 不嵌入、不复制；若部署集成需复核商业限制 |
| n8n | Sustainable Use License，部分企业功能另有条款 | 仅作外部自动化连接，不打包或转售 |
| Remotion | 自定义许可证，个人/小型组织可免费，超过条款阈值需商业许可 | 本地模板预览；商业服务端渲染前核验公司规模和许可 |
| Langfuse | 核心 MIT，企业目录另有许可 | 可选观测后端；避免引入企业目录代码 |
| remotion-dev/skills | 仓库根许可证未由 GitHub API 返回 | 不复制；许可证明确前视为不可复用 |

## 发布前动作

运行包管理器许可证清单和漏洞扫描；锁定依赖版本；保留所有运行依赖 LICENSE；对 ComfyUI、Remotion、Dify、n8n 等非宽松或定制许可做法务复核；Provider 远程调用不等于可以复制或再分发其源码、模型和素材。
