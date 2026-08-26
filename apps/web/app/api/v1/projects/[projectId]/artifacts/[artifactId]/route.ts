import { getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../../../_lib/http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; artifactId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId, artifactId } = await params;
    const service = getCommerceService();
    const artifact = service.repo.get<any>("artifacts", artifactId);
    if (!artifact || artifact.projectId !== projectId) throw new Error("没有找到这个成果");
    return ok({ artifact, versions: service.repo.listArtifactVersions(artifactId) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; artifactId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId, artifactId } = await params;
    const body = await request.json();
    const content = String(body.content || "").trim();
    if (!content) throw new Error("成果正文不能为空");
    return ok(getCommerceService().updateArtifact(projectId, artifactId, content));
  } catch (error) {
    return fail(error);
  }
}
