import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../_lib/http";
export const runtime="nodejs";
export async function GET(){try{return ok(getCommerceService().repo.list("agent_connections"));}catch(error){return fail(error)}}
export async function POST(request:Request){try{return ok(getCommerceService().createAgentConnection(await request.json()),201);}catch(error){return fail(error)}}
