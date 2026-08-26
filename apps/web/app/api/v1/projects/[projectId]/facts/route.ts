import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../../_lib/http";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;return ok(getCommerceService().repo.listFacts(projectId));}catch(error){return fail(error)}}
