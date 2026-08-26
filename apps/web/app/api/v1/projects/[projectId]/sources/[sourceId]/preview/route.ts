import fs from "node:fs/promises";
import { getCommerceService } from "@lai/shared";
import type { SourceDocument } from "@lai/domain";
import { fail, requireWorkbenchAccess } from "../../../../../../_lib/http";
import { resolveStoredSourcePath } from "../../../../../../_lib/source-storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; sourceId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId, sourceId } = await params;
    const source = getCommerceService().repo.get<SourceDocument>("source_documents", sourceId);
    if (!source || source.projectId !== projectId) throw new Error("没有找到这份项目资料");
    const url = new URL(request.url);
    const textMode = url.searchParams.get("mode") === "text" || source.storagePath.startsWith("demo://");
    if (textMode) {
      return new Response(source.extractedText || "这份资料暂时没有可预览的正文。", {
        headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "private, no-store" }
      });
    }
    const bytes = await fs.readFile(resolveStoredSourcePath(source));
    const inline = source.mimeType === "application/pdf" || source.mimeType.startsWith("image/") || source.mimeType.startsWith("text/");
    return new Response(bytes, {
      headers: {
        "content-type": source.mimeType,
        "content-length": String(bytes.byteLength),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(source.fileName)}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox",
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
