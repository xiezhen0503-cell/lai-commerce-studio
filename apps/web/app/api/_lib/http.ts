import { NextResponse } from "next/server";
import { CommerceError, getCommerceService } from "@lai/shared";
import { isWorkbenchAccessTokenValid, workbenchAccessTokenFromCookieHeader } from "@/workbench-access";

export function ok(data: unknown, status = 200, headers?: HeadersInit) { return NextResponse.json({ data, meta: { traceId: crypto.randomUUID(), timestamp: new Date().toISOString() } }, { status, headers }); }
export function fail(error: unknown) {
  if (error instanceof CommerceError) return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details }, meta: { traceId: crypto.randomUUID() } }, { status: error.status });
  const message = error instanceof Error ? error.message : "服务器未能完成请求";
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message }, meta: { traceId: crypto.randomUUID() } }, { status: 500 });
}
export function bearer(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new CommerceError("UNAUTHORIZED", "请提供 Bearer 智能体凭证", 401);
  return getCommerceService().authenticate(header.slice(7));
}
export function requireWorkbenchAccess(request: Request) {
  const token = workbenchAccessTokenFromCookieHeader(request.headers.get("cookie"));
  if (!isWorkbenchAccessTokenValid(token)) throw new CommerceError("WORKBENCH_ACCESS_REQUIRED", "请使用小赖的专属测试链接进入工作台", 401);
}
export async function withIdempotency<T>(request: Request, action: () => Promise<T>) {
  const key = request.headers.get("idempotency-key"); const repo = getCommerceService().repo;
  if (key) { const cached = repo.getIdempotency<T>(key); if (cached) return { value: cached, replayed: true }; }
  const value = await action(); if (key) repo.rememberIdempotency(key, value); return { value, replayed: false };
}
