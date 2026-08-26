import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../../../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string;factId:string}>}){try{requireWorkbenchAccess(request);const {projectId,factId}=await params;const body=await request.json();return ok(getCommerceService().confirmFact(projectId,factId,body.value));}catch(error){return fail(error)}}
