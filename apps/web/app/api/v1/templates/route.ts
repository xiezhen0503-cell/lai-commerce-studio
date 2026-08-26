import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../_lib/http";
export const runtime = "nodejs";
export async function GET() { try { return ok(getCommerceService().repo.list("templates")); } catch (error) { return fail(error); } }
export async function POST(request: Request) { try { const body = await request.json(); return ok(getCommerceService().savePromptTemplate(String(body.projectId), String(body.promptSpecId), body.name ? String(body.name) : undefined), 201); } catch (error) { return fail(error); } }
