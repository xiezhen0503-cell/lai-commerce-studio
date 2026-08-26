import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request){try{const body=await request.json();return ok(getCommerceService().generatePrompt(String(body.projectId),String(body.objective||"生成电商方案")),201);}catch(error){return fail(error)}}
