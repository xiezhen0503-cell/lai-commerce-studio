import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../_lib/http";
export const runtime = "nodejs";
export async function GET(request: Request) { try { requireWorkbenchAccess(request); return ok(getCommerceService().repo.list("templates")); } catch (error) { return fail(error); } }
export async function POST(request: Request) { try { requireWorkbenchAccess(request); const body = await request.json(); return ok(getCommerceService().savePromptTemplate(String(body.projectId), String(body.promptSpecId), body.name ? String(body.name) : undefined), 201); } catch (error) { return fail(error); } }
