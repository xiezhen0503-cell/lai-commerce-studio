import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export type ArtifactExportFormat = "md" | "txt" | "html" | "json" | "csv" | "xlsx" | "docx" | "svg" | "zip";

type ArtifactRecord = {
  id: string;
  projectId: string;
  type: string;
  title: string;
  currentVersion: number;
  factSnapshotId: string;
  status: string;
  createdByType?: string;
  createdById?: string;
  humanModified?: boolean;
};

type VersionRecord = {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  factSnapshotId: string;
  changeSummary?: string;
  createdBy?: string;
  createdAt?: string;
};

export type ArtifactExportInput = { artifact: ArtifactRecord; version: VersionRecord };
export type ArtifactExportFile = { bytes: Buffer; contentType: string; extension: string; format: ArtifactExportFormat };

const TEXT_TYPES = new Set(["proposal", "script", "image-prompt", "caption", "report", "prompt"]);
const STRUCTURED_TYPES = new Set(["storyboard", "video-storyboard", "schedule", "handoff"]);

export function artifactExportFormats(type: string): ArtifactExportFormat[] {
  if (type === "image") return ["svg", "json"];
  if (type === "video") return ["zip", "json", "html"];
  if (STRUCTURED_TYPES.has(type)) return ["json", "xlsx", "csv", "docx"];
  if (TEXT_TYPES.has(type)) return ["md", "docx", "html", "txt", "json"];
  return ["json", "txt"];
}

export function defaultArtifactExportFormat(type: string) {
  return artifactExportFormats(type)[0]!;
}

function safeJson(content: string): unknown | undefined {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function plainText(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function htmlDocument(input: ArtifactExportInput) {
  const { artifact, version } = input;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(artifact.title)}</title><style>body{max-width:920px;margin:40px auto;padding:0 24px;font:16px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#25233d}header{border-bottom:1px solid #dddbea;margin-bottom:24px;padding-bottom:16px}.meta{color:#6d6a83;font-size:13px;display:flex;gap:16px;flex-wrap:wrap}pre{white-space:pre-wrap;word-break:break-word;font:inherit;background:#f7f6fb;padding:24px;border-radius:14px}</style></head><body><header><h1>${escapeHtml(artifact.title)}</h1><div class="meta"><span>成果类型：${escapeHtml(artifact.type)}</span><span>版本：v${version.version}</span><span>事实快照：${escapeHtml(version.factSnapshotId)}</span><span>状态：${escapeHtml(artifact.status)}</span></div></header><pre>${escapeHtml(version.content)}</pre></body></html>`;
}

function jsonEnvelope(input: ArtifactExportInput) {
  const parsed = safeJson(input.version.content);
  return JSON.stringify({
    schema: "laicommerce.artifact-export/v1",
    artifact: {
      id: input.artifact.id,
      projectId: input.artifact.projectId,
      type: input.artifact.type,
      title: input.artifact.title,
      status: input.artifact.status,
      currentVersion: input.artifact.currentVersion,
      factSnapshotId: input.artifact.factSnapshotId,
      createdByType: input.artifact.createdByType,
      createdById: input.artifact.createdById,
      humanModified: input.artifact.humanModified
    },
    version: {
      id: input.version.id,
      version: input.version.version,
      factSnapshotId: input.version.factSnapshotId,
      changeSummary: input.version.changeSummary,
      createdBy: input.version.createdBy,
      createdAt: input.version.createdAt
    },
    content: parsed ?? input.version.content
  }, null, 2);
}

function structuredRows(content: string): Array<Record<string, string | number | boolean>> {
  const parsed = safeJson(content);
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => typeof item === "object" && item !== null
      ? Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : String(value ?? "")]))
      : { index: index + 1, value: String(item ?? "") });
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).map(([key, value]) => ({ field: key, value: typeof value === "object" ? JSON.stringify(value) : String(value ?? "") }));
  }
  return content.split(/[；\n]+/).map((value, index) => ({ index: index + 1, value: value.trim() })).filter((row) => row.value);
}

function csvEscape(value: string | number | boolean | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvDocument(content: string) {
  const rows = structuredRows(content);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `\uFEFF${[headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\r\n")}`;
}

async function xlsxDocument(input: ArtifactExportInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LaiCommerce Studio";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("成果");
  const rows = structuredRows(input.version.content);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, Math.min(42, header.length * 2 + 8)) }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF40369D" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const meta = workbook.addWorksheet("版本信息");
  [["成果", input.artifact.title], ["类型", input.artifact.type], ["版本", input.version.version], ["事实快照", input.version.factSnapshotId], ["状态", input.artifact.status]].forEach((row) => meta.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function docxDocument(input: ArtifactExportInput) {
  const paragraphs = [
    new Paragraph({ text: input.artifact.title, heading: HeadingLevel.TITLE }),
    new Paragraph(`成果类型：${input.artifact.type} | 版本：v${input.version.version}`),
    new Paragraph(`事实快照：${input.version.factSnapshotId} | 状态：${input.artifact.status}`),
    ...input.version.content.split("\n").map((line) => {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) return new Paragraph({ text: heading[2]!, heading: heading[1]!.length === 1 ? HeadingLevel.HEADING_1 : heading[1]!.length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 });
      return new Paragraph(plainText(line));
    })
  ];
  const document = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  return Buffer.from(await Packer.toBuffer(document));
}

function imageSvg(input: ArtifactExportInput) {
  const parsed = safeJson(input.version.content) as { assetUri?: unknown } | undefined;
  const uri = typeof parsed?.assetUri === "string" ? parsed.assetUri : "";
  const match = uri.match(/^data:image\/svg\+xml;(?:charset=[^;,]+;)?base64,(.+)$/i);
  if (!match?.[1]) throw new Error("这张图片没有可下载的 SVG 资产，请改用 JSON 导出查看生成记录");
  return Buffer.from(match[1], "base64");
}

function videoPreviewHtml(input: ArtifactExportInput) {
  const parsed = (safeJson(input.version.content) ?? {}) as { template?: string; props?: { product?: string; specification?: string; factSnapshotId?: string } };
  const product = escapeHtml(parsed.props?.product || "商品视频草稿");
  const specification = escapeHtml(parsed.props?.specification || "规格待确认");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${product}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e9e7f1;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.video{width:min(92vw,405px);aspect-ratio:9/16;border-radius:24px;background:linear-gradient(160deg,#242064,#6657e8);color:white;display:grid;place-items:center;position:relative;overflow:hidden;box-shadow:0 24px 70px #2c286955}.safe{position:absolute;inset:7%;border:1px dashed #ffffff70;border-radius:16px}.content{text-align:center;padding:34px;animation:in 1s ease both}.pill{display:inline-block;background:#a9f0d2;color:#242064;border-radius:99px;padding:7px 13px;font-weight:700}.product{font-size:32px;font-weight:800;margin:24px 0 10px}.spec{color:#d6d5ff}.cta{margin-top:34px;font-weight:700}@keyframes in{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}</style></head><body><main class="video"><div class="safe"></div><div class="content"><span class="pill">${escapeHtml(parsed.template || "Promo30")}</span><div class="product">${product}</div><div class="spec">${specification}</div><div class="cta">先看清，再决定</div></div></main></body></html>`;
}

async function videoZip(input: ArtifactExportInput) {
  const zip = new JSZip();
  zip.file("README.md", `# ${input.artifact.title}\n\n这是 LaiCommerce Studio 可继续编辑的 Remotion 视频项目包，不是 MP4 成片。\n\n- 模板配置：remotion-project.json\n- 离线动画预览：preview.html\n- 事实快照：${input.version.factSnapshotId}\n- 成果版本：v${input.version.version}\n`);
  zip.file("remotion-project.json", jsonEnvelope(input));
  zip.file("preview.html", videoPreviewHtml(input));
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }));
}

export async function buildArtifactExport(input: ArtifactExportInput, requested?: string | null): Promise<ArtifactExportFile> {
  const formats = artifactExportFormats(input.artifact.type);
  const format = (requested || defaultArtifactExportFormat(input.artifact.type)) as ArtifactExportFormat;
  if (!formats.includes(format)) throw new Error(`成果类型 ${input.artifact.type} 不支持 ${format} 导出；可用格式：${formats.join("、")}`);
  if (format === "svg") return { bytes: imageSvg(input), contentType: "image/svg+xml; charset=utf-8", extension: "svg", format };
  if (format === "zip") return { bytes: await videoZip(input), contentType: "application/zip", extension: "zip", format };
  if (format === "docx") return { bytes: await docxDocument(input), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", format };
  if (format === "xlsx") return { bytes: await xlsxDocument(input), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", format };
  if (format === "json") return { bytes: Buffer.from(jsonEnvelope(input)), contentType: "application/json; charset=utf-8", extension: "json", format };
  if (format === "csv") return { bytes: Buffer.from(csvDocument(input.version.content)), contentType: "text/csv; charset=utf-8", extension: "csv", format };
  if (format === "html") return { bytes: Buffer.from(input.artifact.type === "video" ? videoPreviewHtml(input) : htmlDocument(input)), contentType: "text/html; charset=utf-8", extension: "html", format };
  if (format === "txt") return { bytes: Buffer.from(plainText(input.version.content)), contentType: "text/plain; charset=utf-8", extension: "txt", format };
  return { bytes: Buffer.from(input.version.content), contentType: "text/markdown; charset=utf-8", extension: "md", format: "md" };
}

export function downloadHeaders(title: string, version: number, extension: string, contentType: string) {
  const asciiName = `laicommerce-v${version}.${extension}`;
  const unicodeName = `${title.replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 80)}-v${version}.${extension}`;
  return {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(unicodeName)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff"
  };
}
