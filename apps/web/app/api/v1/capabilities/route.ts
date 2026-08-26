import { MCP_PROMPT_NAMES, MCP_TOOL_NAMES, SKILL_CATALOG } from "@lai/shared";
import { ok } from "../../_lib/http";
export async function GET(){return ok({name:"LaiCommerce Studio",restVersion:"v1",mcpProtocol:"2025-11-25",a2aProtocol:"1.0",tools:MCP_TOOL_NAMES,prompts:MCP_PROMPT_NAMES,skills:SKILL_CATALOG});}
