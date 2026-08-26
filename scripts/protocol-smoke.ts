import { spawn } from "node:child_process";
import concurrently from "concurrently";

const cwd = process.cwd();
const mockEnv = { ...process.env, LAI_TEXT_PROVIDER: "mock" };
const endpoints = [
  "http://127.0.0.1:3000/api/v1/health",
  "http://127.0.0.1:3101/health",
  "http://127.0.0.1:3102/.well-known/agent-card.json"
];

const servers = concurrently(
  [
    { name: "WEB", command: "pnpm --filter @lai/web start", env: mockEnv },
    { name: "MCP", command: "pnpm --filter @lai/mcp-server start", env: mockEnv },
    { name: "A2A", command: "pnpm --filter @lai/a2a-server start", env: mockEnv }
  ],
  { cwd, prefix: "name", prefixColors: ["blue", "magenta", "cyan"], successCondition: "all" }
);

let serverFailure: unknown;
const completion = servers.result.catch((error) => {
  serverFailure = error;
});

async function waitForServices() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (serverFailure) throw serverFailure;
    const results = await Promise.all(
      endpoints.map(async (url) => {
        try {
          return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok;
        } catch {
          return false;
        }
      })
    );
    if (results.every(Boolean)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("REST、MCP 或 A2A 服务未在 20 秒内就绪");
}

function runClientSmoke() {
  const packageManager = process.env.npm_execpath;
  if (!packageManager) throw new Error("无法定位 pnpm 运行入口");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [packageManager, "--filter", "@lai/mcp-server", "smoke"], {
      cwd,
      env: mockEnv,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`协议客户端烟雾测试失败，退出码 ${code ?? "unknown"}`));
    });
  });
}

try {
  await waitForServices();
  await runClientSmoke();
} finally {
  servers.commands.forEach((command) => command.kill("SIGTERM"));
  await completion;
}
