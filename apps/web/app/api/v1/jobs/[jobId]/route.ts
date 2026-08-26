import { CommerceError, getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../_lib/http";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{jobId:string}>}){try{const {jobId}=await params;const job=getCommerceService().repo.get("generation_jobs",jobId);if(!job)throw new CommerceError("JOB_NOT_FOUND","没有找到这个任务",404);return ok(job);}catch(error){return fail(error)}}
