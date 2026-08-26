import { getCommerceService } from "@lai/shared";
import type { SourceDocument } from "@lai/domain";
import { fail, ok, requireWorkbenchAccess } from "../../../../../_lib/http";
import { removeStoredSource } from "../../../../../_lib/source-storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; sourceId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId, sourceId } = await params;
    const source = getCommerceService().repo.get<SourceDocument>("source_documents", sourceId);
    if (!source || source.projectId !== projectId) throw new Error("没有找到这份项目资料");
    return ok(source);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; sourceId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId, sourceId } = await params;
    const service = getCommerceService();
    const source = service.repo.get<SourceDocument>("source_documents", sourceId);
    if (!source || source.projectId !== projectId) throw new Error("没有找到这份项目资料");
    await removeStoredSource(source);
    return ok(service.deleteSource(projectId, sourceId));
  } catch (error) {
    return fail(error);
  }
}
