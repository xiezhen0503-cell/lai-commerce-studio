import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const token = process.env.LAI_COMMERCE_TOKEN || "lai_demo_agent_token";
const mcpUrl = process.env.MCP_URL || "http://127.0.0.1:3101/mcp";
const a2aUrl = process.env.A2A_URL || "http://127.0.0.1:3102";
const webUrl = process.env.WEB_URL || "http://127.0.0.1:3000";

const client = new Client({ name: "lai-commerce-smoke", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
await client.connect(transport);
const [tools, resources, prompts] = await Promise.all([client.listTools(), client.listResources(), client.listPrompts()]);
if (tools.tools.length < 45 || resources.resources.length < 3 || prompts.prompts.length < 10) throw new Error("MCP capability discovery is incomplete");

const cardResponse = await fetch(`${a2aUrl}/.well-known/agent-card.json`);
if (!cardResponse.ok) throw new Error(`Agent Card failed: ${cardResponse.status}`);
const card = await cardResponse.json() as { supportedInterfaces: Array<{ protocolVersion: string }> };
if (!card.supportedInterfaces.some((item) => item.protocolVersion === "1.0")) throw new Error("A2A 1.0 interface is missing");

const idempotencyKey = `smoke-${Date.now()}`;
const a2aHeaders = { Authorization: `Bearer ${token}`, "A2A-Version": "1.0", "Content-Type": "application/json", "Idempotency-Key": idempotencyKey };
const a2aBody = JSON.stringify({ message: { role: "ROLE_USER", parts: [{ text: "生成一份协议冒烟测试方案" }], metadata: { projectId: "prj_qingmai_launch" } } });
const firstResponse = await fetch(`${a2aUrl}/a2a/v1/messages:send`, { method: "POST", headers: a2aHeaders, body: a2aBody });
const secondResponse = await fetch(`${a2aUrl}/a2a/v1/messages:send`, { method: "POST", headers: a2aHeaders, body: a2aBody });
const first = await firstResponse.json() as { id: string; status: { state: string }; artifacts: unknown[] };
const second = await secondResponse.json() as { id: string };
if (!firstResponse.ok || !secondResponse.ok || first.id !== second.id || first.artifacts.length < 1) throw new Error("A2A send/idempotency smoke failed");
const cancelResponse = await fetch(`${a2aUrl}/a2a/v1/tasks/${first.id}:cancel`, { method: "POST", headers: a2aHeaders });
const cancelled = await cancelResponse.json() as { status: { state: string } };
if (!cancelResponse.ok || cancelled.status.state !== "TASK_STATE_CANCELED") throw new Error("A2A cancel smoke failed");

const [health, openapi] = await Promise.all([fetch(`${webUrl}/api/v1/health`), fetch(`${webUrl}/api/openapi`)]);
if (!health.ok || !openapi.ok || !(await openapi.text()).includes("openapi: 3.1.2")) throw new Error("REST/OpenAPI smoke failed");

await transport.close();
console.log(JSON.stringify({ rest: "ok", openapi: "3.1.2", mcp: { tools: tools.tools.length, resources: resources.resources.length, prompts: prompts.prompts.length }, a2a: { protocol: "1.0", task: first.id, idempotent: true, cancelled: true } }, null, 2));
