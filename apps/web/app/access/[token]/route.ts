import { NextResponse } from "next/server";
import { isWorkbenchAccessTokenValid, WORKBENCH_ACCESS_COOKIE } from "@/workbench-access";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isWorkbenchAccessTokenValid(token)) {
    return new NextResponse(null, { status: 303, headers: { location: "/?access=invalid" } });
  }
  const response = new NextResponse(null, { status: 303, headers: { location: "/" } });
  response.cookies.set(WORKBENCH_ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}
