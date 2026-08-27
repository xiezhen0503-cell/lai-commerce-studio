import fs from "node:fs/promises";
import { CommerceError, getCommerceService } from "@lai/shared";
import { fail, requireWorkbenchAccess } from "../../../../_lib/http";
import { buildArtifactExport, downloadHeaders } from "../../../../_lib/artifact-export";
import { parseCommerceVideoSpec, renderCommercePoster, renderCommerceVideo } from "../../../../_lib/video-render";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { artifactId } = await params;
    const service = getCommerceService();
    const artifact = service.repo.get<any>("artifacts", artifactId);
    if (!artifact) throw new CommerceError("ARTIFACT_NOT_FOUND", "没有找到成果", 404);
    const versions = service.repo.listArtifactVersions(artifactId);
    const version = versions.find((item) => item.version === artifact.currentVersion) || versions[0];
    if (!version) throw new CommerceError("ARTIFACT_VERSION_NOT_FOUND", "没有找到成果版本", 404);
    const requested = new URL(request.url).searchParams.get("format");

    if (artifact.type === "video" && (requested === "mp4" || !requested)) {
      try {
        const outputPath = await renderCommerceVideo(parseCommerceVideoSpec(version.content));
        const bytes = await fs.readFile(outputPath);
        return new Response(new Uint8Array(bytes), { headers: downloadHeaders(artifact.title, version.version, "mp4", "video/mp4") });
      } catch (error) {
        throw new CommerceError("VIDEO_RENDER_FAILED", error instanceof Error ? `视频成片渲染失败：${error.message}` : "视频成片渲染失败", 503);
      }
    }
    if (artifact.type === "video" && requested === "png") {
      try {
        const outputPath = await renderCommercePoster(parseCommerceVideoSpec(version.content));
        const bytes = await fs.readFile(outputPath);
        return new Response(new Uint8Array(bytes), { headers: downloadHeaders(`${artifact.title}-封面`, version.version, "png", "image/png") });
      } catch (error) {
        throw new CommerceError("VIDEO_POSTER_FAILED", error instanceof Error ? `视频封面渲染失败：${error.message}` : "视频封面渲染失败", 503);
      }
    }

    let file;
    try {
      file = await buildArtifactExport({ artifact, version }, requested);
    } catch (error) {
      throw new CommerceError("EXPORT_FORMAT_UNAVAILABLE", error instanceof Error ? error.message : "导出格式不可用", 400);
    }
    return new Response(new Uint8Array(file.bytes), { headers: downloadHeaders(artifact.title, version.version, file.extension, file.contentType) });
  } catch (error) {
    return fail(error);
  }
}
