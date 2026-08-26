import { getCommerceService } from "@lai/shared";
import { bearer, fail, ok } from "../../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{toolName:string}>}){try{const principal=bearer(request);const {toolName}=await params;const rate=getCommerceService().repo.checkRateLimit(principal.id);if(!rate.allowed)return Response.json({error:{code:"RATE_LIMITED",message:"调用过于频繁，请稍后再试"}},{status:429});return ok(await getCommerceService().runTool(decodeURIComponent(toolName),await request.json(),principal),200,{"x-rate-limit-remaining":String(rate.remaining)});}catch(error){return fail(error)}}
