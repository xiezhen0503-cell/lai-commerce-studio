import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../../_lib/http";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{projectId:string}>}){try{requireWorkbenchAccess(request);const {projectId}=await params;return ok(getCommerceService().repo.listFacts(projectId));}catch(error){return fail(error)}}
