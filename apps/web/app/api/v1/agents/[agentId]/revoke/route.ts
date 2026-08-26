import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{agentId:string}>}){try{requireWorkbenchAccess(request);const {agentId}=await params;return ok({revoked:getCommerceService().revokeAgent(agentId)});}catch(error){return fail(error)}}
