import fs from "node:fs/promises";
import { CommerceError, getCommerceService } from "@lai/shared";
import { fail, requireWorkbenchAccess } from "../../../../_lib/http";
import { buildArtifactExport, downloadHeaders } from "../../../../_lib/artifact-export";
import { parseCommerceVideoSpec, renderCommercePoster, renderCommerceVideo } from "../../../../_lib/video-render";

export const runtime = "nodejs";
export const maxDuration = 300;

function videoResponse(request: Request, bytes: Buffer, title: string, version: number) {
  const url = new URL(request.url);
  const inline = url.searchParams.get("inline") === "1";
  const baseHeaders = downloadHeaders(title, version, "mp4", "video/mp4");
  const headers: Record<string, string> = {
    ...baseHeaders,
    "accept-ranges": "bytes",
    "content-disposition": inline ? baseHeaders["content-disposition"].replace(/^attachment;/, "inline;") : baseHeaders["content-disposition"]
  };
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/i);
  if (!range) {
    headers["content-length"] = String(bytes.byteLength);
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  }
  const suffixLength = !range[1] && range[2] ? Number(range[2]) : undefined;
  const requestedStart = suffixLength === undefined ? Number(range[1] || 0) : Math.max(0, bytes.byteLength - suffixLength);
  const requestedEnd = suffixLength === undefined && range[2] ? Number(range[2]) : bytes.byteLength - 1;
  if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd) || requestedStart < 0 || requestedStart >= bytes.byteLength || requestedEnd < requestedStart) {
    headers["content-range"] = `bytes */${bytes.byteLength}`;
    return new Response(null, { status: 416, headers });
  }
  const start = requestedStart;
  const end = Math.min(requestedEnd, bytes.byteLength - 1);
  const chunk = bytes.subarray(start, end + 1);
  headers["content-range"] = `bytes ${start}-${end}/${bytes.byteLength}`;
  headers["content-length"] = String(chunk.byteLength);
  return new Response(new Uint8Array(chunk), { status: 206, headers });
}

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
        return videoResponse(request, bytes, artifact.title, version.version);
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
