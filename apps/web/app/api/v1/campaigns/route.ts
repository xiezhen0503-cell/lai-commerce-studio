import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess, withIdempotency } from "../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request){try{requireWorkbenchAccess(request);const body=await request.clone().json();const result=await withIdempotency(request,()=>getCommerceService().createCampaignBundle(String(body.projectId),String(body.objective||"一键生成整套活动")));return ok(result.value,result.replayed?200:201,{"idempotency-replayed":String(result.replayed)});}catch(error){return fail(error)}}
