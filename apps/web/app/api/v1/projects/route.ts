import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../_lib/http";
export const runtime="nodejs";
export async function GET(){try{return ok(getCommerceService().listProjects());}catch(error){return fail(error)}}
export async function POST(request:Request){try{const input=await request.json();return ok(getCommerceService().createProject(input),201);}catch(error){return fail(error)}}
