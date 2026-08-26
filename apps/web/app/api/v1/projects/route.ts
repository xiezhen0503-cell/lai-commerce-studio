import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../_lib/http";
export const runtime="nodejs";
export async function GET(request:Request){try{requireWorkbenchAccess(request);return ok(getCommerceService().listProjects());}catch(error){return fail(error)}}
export async function POST(request:Request){try{requireWorkbenchAccess(request);const input=await request.json();return ok(getCommerceService().createProject(input),201);}catch(error){return fail(error)}}
