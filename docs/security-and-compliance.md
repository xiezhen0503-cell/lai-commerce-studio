# 安全与合规

## 上传

白名单包含 PDF、DOCX、XLSX、CSV、TXT、Markdown、PNG、JPEG、WEBP 与 MP4；同时检查扩展名、MIME、大小和文件名。服务端生成存储名，拒绝路径穿越、双扩展名和不可见控制字符。病毒扫描提供接口；生产必须接入真实扫描器和隔离区。

## 网络与密钥

外部 URL 先解析并拒绝 localhost、私网、链路本地和非 HTTP(S) 协议，重定向后再次检查，防 SSRF。Agent Token 只显示一次，以 pepper 摘要入库；日志会清理 Bearer、api_key、secret、手机号和邮箱。Webhook 使用 `HMAC-SHA256(timestamp.body)`，校验时间窗并防重放。

## 权限和审计

每次 Agent 调用同时检查 workspace、scope、projectIds、过期、撤销和可选 IP allowlist。审计事件记录 actor type/id、action、project、摘要、traceId 和时间，不保存提示词中的敏感原文。服务账户不得继承人类 owner 权限。

## 提示注入

来源文档是数据而不是指令。解析后检测“忽略系统提示”“泄露密钥”“调用外部工具”等模式并标注风险；下游提示词用数据边界包裹来源内容。任何来源内容都不能扩大工具权限。

## 电商合规

价格、规格、活动时间、资质、食品/医疗功效、知识产权和外部发布是人工审核字段。无证据的“第一、最佳、治愈、减肥、零糖”等不进入已批准物料。平台规则具有时效性，上线前应由运营和法务使用当期规则复核。

## 生产部署清单

启用 HTTPS/OIDC/CSRF/CSP；替换演示 Token；设置强 pepper 与 Webhook Secret；数据库备份和加密；对象存储签名 URL；真实病毒扫描；队列隔离；出站 allowlist；集中审计；限额和成本告警；数据保留/删除策略；依赖漏洞与许可证持续扫描。
