import { getCommerceService } from "@lai/shared";
import { fail, ok } from "../../../../../../../../_lib/http";
export const runtime = "nodejs";
export async function POST(_: Request, { params }: { params: Promise<{ projectId: string; artifactId: string; versionId: string }> }) { try { const { projectId, artifactId, versionId } = await params; return ok(getCommerceService().restoreArtifactVersion(projectId, artifactId, versionId)); } catch (error) { return fail(error); } }
