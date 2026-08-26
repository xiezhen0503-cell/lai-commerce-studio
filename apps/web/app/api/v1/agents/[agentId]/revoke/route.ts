import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../../_lib/http";
export const runtime="nodejs";
export async function POST(_:Request,{params}:{params:Promise<{agentId:string}>}){try{const {agentId}=await params;return ok({revoked:getCommerceService().revokeAgent(agentId)});}catch(error){return fail(error)}}
