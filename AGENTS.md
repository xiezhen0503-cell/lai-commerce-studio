# LaiCommerce Studio 开发约定

## 产品边界

- 产品围绕项目、事实快照和版本化成果组织，不以聊天记录为主结构。
- 已确认事实、创意建议和缺失信息必须分开表达；缺失内容不得补造。
- 价格、规格、活动日期、资质、功效和对外发布必须经过人工确认。
- 外部智能体默认只能读取授权项目、生成或回写草稿、请求审核，不能确认事实或批准内容。
- 没有外部密钥时必须保持 Mock 演示链路可用。

## 工程约定

- 使用 TypeScript 严格模式、Zod 校验和 Repository/Provider 接口隔离。
- 业务层不得直接依赖具体模型 SDK。
- 新接口同步更新 `docs/openapi.yaml` 与测试。
- 敏感值只存服务端，日志使用脱敏摘要，不提交 `.env`、数据库或上传文件。
- macOS（Apple Silicon 与 Intel）是正式支持平台；不得硬编码盘符、反斜杠路径、PowerShell 或 `.exe` 命令。
- 原生依赖必须在目标操作系统重新安装，禁止从 Windows 复制 `node_modules`、`.next` 或 Playwright 浏览器缓存到 macOS。

## 验证命令

```bash
pnpm run app:doctor
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```
