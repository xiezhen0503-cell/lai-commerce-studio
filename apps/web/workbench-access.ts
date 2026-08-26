import crypto from "node:crypto";

export const WORKBENCH_ACCESS_COOKIE = "lai_workbench_access";

function expectedAccessToken() {
  return process.env.WORKBENCH_ACCESS_TOKEN?.trim() || "";
}

export function isWorkbenchAccessRequired() {
  return expectedAccessToken().length > 0;
}

export function isWorkbenchAccessTokenValid(supplied?: string | null) {
  const expected = expectedAccessToken();
  if (!expected) return true;
  if (!supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

export function workbenchAccessTokenFromCookieHeader(header?: string | null) {
  const pair = header?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${WORKBENCH_ACCESS_COOKIE}=`));
  if (!pair) return undefined;
  const value = pair.slice(WORKBENCH_ACCESS_COOKIE.length + 1);
  try { return decodeURIComponent(value); } catch { return undefined; }
}
