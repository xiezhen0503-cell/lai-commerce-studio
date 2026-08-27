import { getCommerceService, MCP_PROMPT_NAMES, MCP_TOOL_NAMES } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../../_lib/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { agentId } = await params;
    const service = getCommerceService();
    const account = service.repo.get<any>("agent_service_accounts", agentId);
    if (!account) throw new Error("没有找到这个智能体账号");
    if (account.status !== "active") throw new Error("这个智能体连接已经停用或撤销");
    const allowedProjects = service.listProjects().filter((project) => account.projectIds.includes(project.id));
    return ok({
      status: "reachable",
      account: { id: account.id, name: account.name, scopes: account.scopes, projectIds: allowedProjects.map((project) => project.id) },
      protocols: { rest: true, mcp: Boolean(process.env.MCP_PUBLIC_URL), a2a: Boolean(process.env.A2A_PUBLIC_URL) },
      endpoints: { rest: "/api/v1", mcp: process.env.MCP_PUBLIC_URL || null, a2a: process.env.A2A_PUBLIC_URL || null },
      discovery: { tools: MCP_TOOL_NAMES.length, prompts: MCP_PROMPT_NAMES.length },
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return fail(error);
  }
}
