import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Level = "PASS" | "WARN" | "FAIL";
const results: Array<{ level: Level; label: string; detail: string }> = [];
const record = (level: Level, label: string, detail: string) => results.push({ level, label, detail });
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

record(nodeMajor >= 22 && nodeMajor <= 24 ? "PASS" : "FAIL", "Node.js", `${process.versions.node}（支持 22–24，CI 使用 22）`);
record(
  process.platform === "darwin" && ["arm64", "x64"].includes(process.arch) ? "PASS" : "WARN",
  "运行平台",
  `${process.platform}/${process.arch}${process.platform === "darwin" && process.arch === "x64" ? "；Apple Silicon 用户请确认是否正在 Rosetta 下运行" : ""}`
);

const packageManager = process.env.npm_config_user_agent || "未知";
record(packageManager.includes("pnpm/11") ? "PASS" : "WARN", "包管理器", packageManager);

try {
  fs.accessSync(workspaceRoot, fs.constants.R_OK | fs.constants.W_OK);
  record("PASS", "工作区读写", workspaceRoot);
} catch (error) {
  record("FAIL", "工作区读写", error instanceof Error ? error.message : String(error));
}

const envPath = path.join(workspaceRoot, ".env");
record(fs.existsSync(envPath) ? "PASS" : "WARN", "环境文件", fs.existsSync(envPath) ? envPath : ".env 不存在时运行 pnpm run app:setup");

try {
  const { CommerceRepository } = await import("@lai/database");
  const repository = new CommerceRepository(":memory:");
  const row = repository.db.prepare("select sqlite_version() as version").get() as { version: string };
  repository.close();
  record("PASS", "SQLite 原生绑定", `better-sqlite3 / SQLite ${row.version}`);
} catch (error) {
  record("FAIL", "SQLite 原生绑定", `${error instanceof Error ? error.message : String(error)}；请在本机重新运行 pnpm install --force`);
}

try {
  const { chromium, webkit } = await import("@playwright/test");
  for (const [name, browserPath] of [["Chromium", chromium.executablePath()], ["WebKit", webkit.executablePath()]] as const) {
    record(fs.existsSync(browserPath) ? "PASS" : "WARN", `${name} 测试浏览器`, fs.existsSync(browserPath) ? browserPath : "未安装；仅测试需要运行 pnpm browser:install");
  }
} catch (error) {
  record("WARN", "Playwright", error instanceof Error ? error.message : String(error));
}

for (const item of results) console.log(`[${item.level}] ${item.label}：${item.detail}`);
if (results.some((item) => item.level === "FAIL")) process.exitCode = 1;
