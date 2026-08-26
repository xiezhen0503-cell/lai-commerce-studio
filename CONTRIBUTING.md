# 参与贡献

感谢参与小赖电商工作台。请保持“事实、建议、缺失信息分离”，不要用生成内容覆盖人工确认的价格、规格、日期、资质或功效信息。

## 开发环境

支持 Node.js 22–24、pnpm 11，以及 macOS、Linux、Windows。推荐使用 Node 22：

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm run app:setup
pnpm run app:doctor
```

测试浏览器按需安装：

```bash
pnpm run browser:install
pnpm check
```

## 提交要求

- TypeScript 严格模式和 Zod 校验保持通过。
- 新增接口时同步更新 OpenAPI、权限检查和测试。
- 外部服务通过 Provider 接口接入，不在业务层直接绑定模型 SDK。
- 不提交 `.env`、数据库、上传文件、构建目录、密钥或真实客户数据。
- 新依赖需说明用途、许可证和生产部署影响。
- 公开发布、付费生成和外部账号写操作必须停在人工确认之前。
