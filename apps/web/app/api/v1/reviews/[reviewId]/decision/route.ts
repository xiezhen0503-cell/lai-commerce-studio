import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../../_lib/http";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{reviewId:string}>}){try{const {reviewId}=await params;const body=await request.json();return ok(getCommerceService().decideReview(reviewId,body.decision,body.note||""));}catch(error){return fail(error)}}
