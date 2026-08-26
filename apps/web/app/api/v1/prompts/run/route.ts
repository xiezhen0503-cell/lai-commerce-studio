import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request){try{requireWorkbenchAccess(request);const body=await request.json();return ok(await getCommerceService().runPrompt(String(body.projectId),String(body.promptSpecId),body.artifactType||"proposal"),201);}catch(error){return fail(error)}}
