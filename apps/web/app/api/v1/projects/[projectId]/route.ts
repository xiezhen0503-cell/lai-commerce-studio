import { getCommerceService } from "@lai/shared";
import { ProjectSchema, nowIso } from "@lai/domain";
import { fail, ok } from "../../../_lib/http";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;return ok(getCommerceService().getProject(projectId));}catch(error){return fail(error)}}
export async function PATCH(request:Request,{params}:{params:Promise<{projectId:string}>}){try{const {projectId}=await params;const service=getCommerceService();const current=service.getProject(projectId).project;const patch=await request.json();const updated=ProjectSchema.parse({...current,...patch,id:current.id,workspaceId:current.workspaceId,updatedAt:nowIso()});service.repo.saveProject(updated);return ok(updated);}catch(error){return fail(error)}}
