import fs from "node:fs/promises";
import { getCommerceService } from "@lai/shared";
import { nowIso, type SourceDocument } from "@lai/domain";
import { providerRegistry } from "@lai/providers";
import { fail, ok, requireWorkbenchAccess } from "../../../../../../_lib/http";
import { resolveStoredSourcePath } from "../../../../../../_lib/source-storage";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sourceId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId, sourceId } = await params;
    const service = getCommerceService();
    const source = service.repo.get<SourceDocument>("source_documents", sourceId);
    if (!source || source.projectId !== projectId) throw new Error("没有找到这份项目资料");
    const bytes = source.storagePath.startsWith("demo://")
      ? new TextEncoder().encode(source.extractedText || "")
      : new Uint8Array(await fs.readFile(resolveStoredSourcePath(source)));
    service.saveSource({ ...source, status: "parsing", error: undefined, warnings: undefined });
    try {
      const parsed = await providerRegistry.document.parse({ fileName: source.fileName, mimeType: source.mimeType, bytes });
      const updated: SourceDocument = { ...source, parser: providerRegistry.document.name, status: "parsed", extractedText: parsed.text, parsedAt: nowIso(), error: undefined, warnings: parsed.warnings };
      service.saveSource(updated);
      const facts = service.extractFacts(projectId, sourceId);
      return ok({ source: updated, facts, warnings: parsed.warnings });
    } catch (parseError) {
      const updated: SourceDocument = { ...source, parser: providerRegistry.document.name, status: "failed", error: parseError instanceof Error ? parseError.message : "资料解析失败" };
      service.saveSource(updated);
      return ok({ source: updated, facts: [], warnings: [updated.error] }, 422);
    }
  } catch (error) {
    return fail(error);
  }
}
