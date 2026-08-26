import crypto from "node:crypto";
import path from "node:path";

export const ALLOWED_FILE_TYPES = new Map([
  ["application/pdf", ".pdf"], ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"], ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["text/csv", ".csv"], ["text/plain", ".txt"], ["text/markdown", ".md"], ["image/jpeg", ".jpg"], ["image/png", ".png"]
]);

const BROWSER_GENERIC_FILE_TYPES = new Set(["", "application/octet-stream"]);
const SAFE_TEXT_TYPE_BY_EXTENSION = new Map([
  [".csv", "text/csv"], [".md", "text/markdown"], [".txt", "text/plain"]
]);

export function normalizeUploadMimeType(input: { name: string; type: string }) {
  const extension = path.extname(input.name).toLowerCase();
  if (input.type === "text/x-markdown") return "text/markdown";
  if (input.type === "text/plain" && extension !== ".txt") return SAFE_TEXT_TYPE_BY_EXTENSION.get(extension) || input.type;
  if (!BROWSER_GENERIC_FILE_TYPES.has(input.type)) return input.type;
  return SAFE_TEXT_TYPE_BY_EXTENSION.get(extension) || input.type;
}

export function sanitizeFilename(input: string) {
  // Control characters are intentionally rejected at the filesystem boundary.
  // eslint-disable-next-line no-control-regex
  const base = path.basename(input).normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\.{2,}/g, ".").trim();
  const cleaned = base.replace(/^\.+/, "").slice(0, 120);
  if (!cleaned) throw new Error("文件名无效");
  return cleaned;
}

export function validateUpload(input: { name: string; type: string; size: number }, maxMb = Number(process.env.UPLOAD_MAX_MB || 20)) {
  const safeName = sanitizeFilename(input.name);
  const mimeType = normalizeUploadMimeType({ name: safeName, type: input.type });
  const expected = ALLOWED_FILE_TYPES.get(mimeType);
  if (!expected) throw new Error("不支持这种文件类型，请上传 PDF、Office、文本、表格或 JPG/PNG");
  if (input.size <= 0 || input.size > maxMb * 1024 * 1024) throw new Error(`文件大小必须在 1 字节到 ${maxMb}MB 之间`);
  const extension = path.extname(safeName).toLowerCase();
  if (extension !== expected && !(mimeType === "image/jpeg" && extension === ".jpeg")) throw new Error("文件扩展名与内容类型不一致");
  return safeName;
}

export function safeWorkspacePath(root: string, ...segments: string[]) {
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error("检测到非法文件路径");
  return target;
}

export const hashToken = (token: string) => crypto.createHash("sha256").update(`${token}:${process.env.AGENT_TOKEN_PEPPER || "dev-pepper"}`).digest("hex");
export const createAgentToken = () => `lai_${crypto.randomBytes(24).toString("base64url")}`;
export const redact = (value: string) => value.replace(/(lai_|sk-|Bearer\s+)[A-Za-z0-9_\-.]+/gi, "$1***").replace(/[A-Za-z0-9+/=_-]{32,}/g, "***");

export function signWebhook(body: string, timestamp: string, secret = process.env.WEBHOOK_SECRET || "dev-webhook-secret") {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyWebhook(body: string, timestamp: string, signature: string, secret = process.env.WEBHOOK_SECRET || "dev-webhook-secret", toleranceSeconds = 300) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || Math.abs(Date.now() - time) > toleranceSeconds * 1000) return false;
  const expected = signWebhook(body, timestamp, secret);
  const left = Buffer.from(signature, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function detectPromptInjection(text: string) {
  const patterns = [/ignore (all|previous) instructions/i, /忽略(以上|之前|系统).{0,8}(指令|规则)/, /system prompt/i, /泄露.{0,6}(密钥|提示词|凭证)/, /绕过.{0,6}(权限|审核|安全)/];
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function validateOutboundUrl(raw: string, options: { allowHosts?: string[] } = {}) {
  const url = new URL(raw);
  if (url.username || url.password) throw new Error("外部地址不能在 URL 中携带凭证");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const allowlisted = options.allowHosts?.some((allowed) => allowed.toLowerCase() === host) ?? false;
  if (url.protocol !== "https:" && !(allowlisted && url.protocol === "http:")) throw new Error("外部地址必须使用 HTTPS；本地开发地址需要显式加入 allowlist");
  const forbidden = /^(localhost$|.*\.localhost$|.*\.local$|0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd|fe80:)/i;
  if (forbidden.test(host) && !allowlisted) throw new Error("禁止访问本机、内网、链路本地或元数据地址");
  return url;
}

export interface VirusScanner { name: string; scan(bytes: Uint8Array): Promise<{ clean: boolean; threat?: string }> }
export class MockVirusScanner implements VirusScanner {
  name = "mock-clamav-interface";
  async scan(bytes: Uint8Array) {
    const marker = Buffer.from(bytes).toString("utf8", 0, Math.min(bytes.length, 256));
    return marker.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE") ? { clean: false, threat: "EICAR test signature" } : { clean: true };
  }
}
