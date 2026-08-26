import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

if (nodeMajor < 22 || nodeMajor > 24) {
  throw new Error(`需要 Node.js 22–24，当前为 ${process.versions.node}。推荐运行 nvm use 使用 Node 22。`);
}

const envExamplePath = path.join(workspaceRoot, ".env.example");
const envPath = path.join(workspaceRoot, ".env");
const envCreated = !fs.existsSync(envPath);
if (envCreated) fs.copyFileSync(envExamplePath, envPath, fs.constants.COPYFILE_EXCL);
process.loadEnvFile(envPath);

const configuredDatabasePath = process.env.DATABASE_PATH || "./data/laicommerce.db";
const databasePath = path.isAbsolute(configuredDatabasePath)
  ? configuredDatabasePath
  : path.resolve(workspaceRoot, configuredDatabasePath);

fs.mkdirSync(path.join(workspaceRoot, "data", "uploads"), { recursive: true });

try {
  const [{ CommerceRepository }, { seedDemoData }] = await Promise.all([
    import("@lai/database"),
    import("@lai/shared")
  ]);
  const repository = new CommerceRepository(databasePath);
  seedDemoData(repository);
  repository.close();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const macHint = process.platform === "darwin"
    ? "\nmacOS 原生依赖未正确安装时，请确认 Node 架构后运行：xcode-select --install；pnpm install --force"
    : "";
  throw new Error(`初始化 SQLite 失败：${reason}${macHint}`);
}

console.log("小赖电商工作台初始化完成");
console.log(`平台：${process.platform} / ${process.arch} / Node ${process.versions.node}`);
console.log(`环境文件：${envCreated ? "已从 .env.example 创建" : "沿用现有 .env"}`);
console.log(`数据库：${databasePath}`);
