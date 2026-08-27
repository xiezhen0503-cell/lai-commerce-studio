import { CommerceError, getCommerceService } from "@lai/shared";
import { fail, ok, requireWorkbenchAccess } from "../../../../_lib/http";
import { removeStoredSource } from "../../../../_lib/source-storage";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId } = await params;
    const body = await request.json() as { confirmation?: string };
    if (body.confirmation !== "CLEAR_PROJECT_DATA") {
      throw new CommerceError("RESET_CONFIRMATION_REQUIRED", "清空项目需要明确确认", 400);
    }
    const service = getCommerceService();
    const sources = service.getProject(projectId).sources;
    for (const source of sources) await removeStoredSource(source);
    return ok(service.resetProjectForTesting(projectId));
  } catch (error) {
    return fail(error);
  }
}
