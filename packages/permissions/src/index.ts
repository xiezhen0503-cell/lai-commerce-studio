import type { Scope } from "@lai/domain";
import { DEFAULT_AGENT_SCOPES } from "@lai/domain";

export interface AgentPrincipal {
  id: string;
  workspaceId: string;
  scopes: Scope[];
  projectIds: string[];
  expiresAt?: string;
  revokedAt?: string;
  ipAllowlist?: string[];
}

const HIGH_RISK: Scope[] = ["fact:confirm", "artifact:approve", "admin:integrations"];

export function authorize(principal: AgentPrincipal, scope: Scope, input: { workspaceId: string; projectId?: string; ip?: string }) {
  if (principal.revokedAt) return { allowed: false, code: "TOKEN_REVOKED", reason: "这个智能体连接已撤销" };
  if (principal.expiresAt && Date.parse(principal.expiresAt) <= Date.now()) return { allowed: false, code: "TOKEN_EXPIRED", reason: "这个智能体连接已过期" };
  if (principal.workspaceId !== input.workspaceId) return { allowed: false, code: "WORKSPACE_FORBIDDEN", reason: "智能体不能访问其他工作区" };
  if (!principal.scopes.includes(scope)) return { allowed: false, code: "SCOPE_FORBIDDEN", reason: HIGH_RISK.includes(scope) ? "该操作需要单独的高风险授权" : "这个智能体没有执行该操作的权限" };
  if (input.projectId && principal.projectIds.length > 0 && !principal.projectIds.includes(input.projectId)) return { allowed: false, code: "PROJECT_FORBIDDEN", reason: "这个项目不在智能体的授权范围内" };
  if (principal.ipAllowlist?.length && input.ip && !principal.ipAllowlist.includes(input.ip)) return { allowed: false, code: "IP_FORBIDDEN", reason: "当前来源地址不在允许列表中" };
  return { allowed: true, code: "OK", reason: "已授权" };
}

export const defaultAgentPrincipal = (id: string, projectIds: string[] = []): AgentPrincipal => ({ id, workspaceId: "ws_demo", scopes: [...DEFAULT_AGENT_SCOPES], projectIds });

export const permissionPlainLanguage: Record<Scope, string> = {
  "workspace:read": "查看工作区概况", "brand:read": "查看品牌资料", "product:read": "查看商品资料", "project:read": "查看获准项目", "project:write": "修改获准项目的草稿信息",
  "source:read": "查看获准项目的资料", "source:upload": "向获准项目上传资料", "fact:read": "查看事实卡", "fact:propose": "提出事实候选", "fact:confirm": "确认事实（高风险）",
  "prompt:read": "查看提示词", "prompt:write": "保存提示词草稿", "prompt:run": "运行提示词", "skill:run": "调用电商技能", "artifact:read": "查看生成成果",
  "artifact:write": "回写成果草稿", "artifact:review": "请求人工审核", "artifact:approve": "批准成果（高风险）", "artifact:export": "导出成果", "campaign:run": "生成整套活动",
  "job:read": "查看任务进度", "job:cancel": "取消任务", "admin:integrations": "管理外部服务密钥（高风险）"
};
