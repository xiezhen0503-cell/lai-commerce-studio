import { getCommerceService } from "@lai/shared";
import { ok } from "../../_lib/http";
export const runtime="nodejs";
export async function GET(){const service=getCommerceService();return ok({status:"ok",database:service.repo.filePath,providers:{mock:true,external:"optional"},time:new Date().toISOString()});}
