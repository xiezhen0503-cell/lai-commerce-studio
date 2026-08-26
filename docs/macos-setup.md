# macOS 安装与迁移

macOS（Apple Silicon `arm64` 和 Intel `x64`）是小赖电商工作台的正式支持平台。仓库只使用 Node 跨平台路径 API；启动脚本不依赖盘符、PowerShell、`.cmd` 或 `.exe`。

## 推荐安装

支持 Node.js 22–24，推荐 Node 22，与 macOS CI 保持一致。仓库同时提供 `.nvmrc` 与 `.node-version`；使用 nvm 时：

```bash
nvm install
nvm use
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm run app:setup
pnpm run app:doctor
pnpm dev
```

打开 `http://127.0.0.1:3000`。普通使用不需要安装 Playwright 浏览器；只有运行端到端测试时需要：

```bash
pnpm browser:install
pnpm check
```

## Apple Silicon 检查

```bash
node -p "process.platform + ' ' + process.arch"
```

原生 Apple Silicon Node 应输出 `darwin arm64`。`darwin x64` 表示 Intel Mac，或 Apple Silicon 正在 Rosetta 下运行；两种模式都可用，但 Node 与 `node_modules` 必须保持同一架构。

如果 `better-sqlite3`、Sharp 或 Next SWC 报原生绑定错误：

```bash
xcode-select --install
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install --force
pnpm run app:doctor
```

上述删除范围仅限当前项目的依赖目录，不会删除源码和数据库。

## 从 Windows 迁移到 Mac

1. 复制源码、`pnpm-lock.yaml`、配置和必要的 `data/laicommerce.db`。
2. 不要复制 `node_modules`、`.next`、`dist`、Playwright 浏览器缓存或 SQLite 的 `-wal`/`-shm` 临时文件。
3. 在 Windows 端停止三个服务后再复制 SQLite 主数据库。
4. 在 Mac 上重新运行 `pnpm install --frozen-lockfile` 和 `pnpm run app:setup`。
5. `.env` 单独安全迁移；不要通过聊天、Git 或公共网盘传递真实密钥。

## 浏览器与视频

- 工作台支持 Chrome 和 Safari；自动化回归使用 Chromium 与 Playwright WebKit。
- WebKit 测试能发现大部分 Safari 引擎兼容问题，但不能替代在小赖真实 Mac/Safari 上的最终点击验收。
- Remotion Player 可直接在浏览器预览；服务端批量渲染仍需单独部署 Chromium/FFmpeg，并复核 Remotion 许可证。

## Docker

Docker Desktop for Mac 可以运行示例 PostgreSQL、Redis 和 MinIO。Apple Silicon 优先使用带 `linux/arm64` 镜像的服务，不要把 Windows 或 Intel Linux 下构建的原生 `node_modules` 挂载进容器。
