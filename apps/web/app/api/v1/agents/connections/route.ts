import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../_lib/http";
export const runtime="nodejs";
export async function GET(request:Request){try{requireWorkbenchAccess(request);return ok(getCommerceService().repo.list("agent_connections"));}catch(error){return fail(error)}}
export async function POST(request:Request){try{requireWorkbenchAccess(request);return ok(getCommerceService().createAgentConnection(await request.json()),201);}catch(error){return fail(error)}}
