import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../_lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) { try { const body = await request.json(); return ok(getCommerceService().buildHandoff(String(body.projectId), String(body.promptSpecId), String(body.objective || "继续完成电商内容任务")), 201); } catch (error) { return fail(error); } }
