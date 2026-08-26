import { getCommerceService } from "@lai/shared";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{jobId:string}>}){const {jobId}=await params;const stream=new ReadableStream({start(controller){const job=getCommerceService().repo.get("generation_jobs",jobId);controller.enqueue(new TextEncoder().encode(`event: progress\ndata: ${JSON.stringify(job||{error:"not-found"})}\n\n`));controller.close();}});return new Response(stream,{headers:{"content-type":"text/event-stream","cache-control":"no-cache","connection":"keep-alive"}})}
