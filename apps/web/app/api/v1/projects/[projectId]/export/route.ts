import JSZip from "jszip";
import fs from "node:fs/promises";
import { CommerceError, getCommerceService } from "@lai/shared";
import { buildArtifactExport, defaultArtifactExportFormat, downloadHeaders } from "../../../../_lib/artifact-export";
import { fail, requireWorkbenchAccess } from "../../../../_lib/http";
import { parseCommerceVideoSpec, renderCommerceVideo } from "../../../../_lib/video-render";

export const runtime = "nodejs";

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, "-").slice(0, 70) || "artifact";
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    requireWorkbenchAccess(request);
    const { projectId } = await params;
    const service = getCommerceService();
    const data = service.getProject(projectId);
    if (!data.project) throw new CommerceError("PROJECT_NOT_FOUND", "没有找到项目", 404);
    if (!data.artifacts.length) throw new CommerceError("PROJECT_EXPORT_EMPTY", "项目还没有可下载成果", 400);

    const zip = new JSZip();
    const manifest: Array<Record<string, unknown>> = [];
    for (const [index, artifact] of data.artifacts.entries()) {
      const versions = data.artifactVersions.filter((item) => item.artifactId === artifact.id);
      const version = versions.find((item) => item.version === artifact.currentVersion) || versions[0];
      if (!version) continue;
      const preferred = defaultArtifactExportFormat(artifact.type);
      try {
        const file = artifact.type === "video" && process.env.LAI_REQUIRE_LIVE_OUTPUTS === "true"
          ? { bytes: await fs.readFile(await renderCommerceVideo(parseCommerceVideoSpec(version.content))), contentType: "video/mp4", extension: "mp4", format: "mp4" as const }
          : await buildArtifactExport({ artifact, version }, preferred);
        const fileName = `${String(index + 1).padStart(2, "0")}-${safeName(artifact.title)}-v${version.version}.${file.extension}`;
        zip.file(`artifacts/${fileName}`, file.bytes);
        manifest.push({ artifactId: artifact.id, title: artifact.title, type: artifact.type, version: version.version, factSnapshotId: version.factSnapshotId, status: artifact.status, file: `artifacts/${fileName}`, format: file.format });
      } catch (error) {
        const fallback = await buildArtifactExport({ artifact, version }, "json");
        const fileName = `${String(index + 1).padStart(2, "0")}-${safeName(artifact.title)}-v${version.version}.json`;
        zip.file(`artifacts/${fileName}`, fallback.bytes);
        manifest.push({ artifactId: artifact.id, title: artifact.title, type: artifact.type, version: version.version, factSnapshotId: version.factSnapshotId, status: artifact.status, file: `artifacts/${fileName}`, format: "json", fallbackReason: error instanceof Error ? error.message : "原生格式暂不可用" });
      }
    }

    zip.file("manifest.json", JSON.stringify({ schema: "laicommerce.project-export/v1", project: data.project, exportedAt: new Date().toISOString(), artifacts: manifest }, null, 2));
    zip.file("README.md", `# ${data.project.name}\n\n本压缩包由 LaiCommerce Studio 导出。每个成果保留当前版本、事实快照、状态和原生可用格式。\n\n- 项目 ID：${data.project.id}\n- 成果数量：${manifest.length}\n- 当前事实快照：${data.project.currentFactSnapshotId}\n- 真实商品图以 PNG/JPEG 原图保存；视频以 H.264 MP4 成片保存；文字与结构化成果使用 Word、Excel、Markdown 或 JSON。\n`);
    const bytes = Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }));
    return new Response(new Uint8Array(bytes), { headers: downloadHeaders(`${data.project.name}-全部成果`, 1, "zip", "application/zip") });
  } catch (error) {
    return fail(error);
  }
}
