# 安全政策

## 支持范围

当前只维护 `main` 分支的最新版本。项目仍是可运行 MVP，不应在未完成生产加固的情况下直接暴露到公网或接入真实店铺写权限。

## 报告漏洞

仓库公开后优先使用 GitHub Private Vulnerability Reporting。请不要在公开 Issue 中提交可利用细节、真实密钥、客户数据或个人信息；如果私密报告入口暂不可用，可先创建不含敏感细节的 Issue，请维护者开启私密沟通渠道。

## 安全边界

- `.env`、数据库、上传文件、API key、Bearer Token、Cookie 和真实客户数据不得提交到 Git。
- `lai_demo_agent_token` 只允许本地虚构演示数据使用；生产部署必须删除演示账户并替换所有示例 secret。
- Agent 必须同时通过 workspace、scope、项目白名单、过期与撤销检查；默认不能确认事实、批准成果或公开发布。
- 外部 URL 必须执行 SSRF 检查；上传文件必须执行路径、扩展名、MIME、大小与真实病毒扫描。
- 任何真实电商发布、退款、价格修改或账号写操作都必须保留人工确认、幂等和审计。
- 外部 Provider 的密钥只能来自环境变量或秘密管理服务，不能进入客户端、日志、Prompt、成果或 Handoff。

## 生产前检查

至少完成 HTTPS/OIDC、随机 Token pepper、Webhook secret、真实病毒扫描、对象存储隔离、出站 allowlist、集中审计、备份恢复、依赖扫描、速率限制和演示数据清理。
