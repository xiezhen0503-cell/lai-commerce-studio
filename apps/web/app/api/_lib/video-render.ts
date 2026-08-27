import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { CommerceVideoProps } from "@/remotion/compositions";

export type CommerceVideoTemplate = "SellingPoint15" | "Ugc30" | "Promo30";
export type CommerceVideoRenderSpec = { template: CommerceVideoTemplate; props: CommerceVideoProps };

function resolveEntryPoint() {
  const candidates = [
    path.resolve(process.cwd(), "remotion", "entry.tsx"),
    path.resolve(process.cwd(), "apps", "web", "remotion", "entry.tsx")
  ];
  const found = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!found) throw new Error("没有找到视频渲染入口，请检查部署产物是否包含 remotion/entry.tsx");
  return found;
}

declare global { var __laiRemotionBundle: Promise<string> | undefined; }

async function bundledServeUrl() {
  globalThis.__laiRemotionBundle ??= bundle({ entryPoint: resolveEntryPoint(), webpackOverride: (config) => config });
  return globalThis.__laiRemotionBundle;
}

function cachePath(spec: CommerceVideoRenderSpec, extension: "mp4" | "png", variant = "full") {
  const hash = crypto.createHash("sha256").update(JSON.stringify({ spec, variant })).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), "laicommerce-renders", `${hash}.${extension}`);
}

export async function renderCommerceVideo(spec: CommerceVideoRenderSpec, options: { frameRange?: [number, number] } = {}) {
  const output = cachePath(spec, "mp4", options.frameRange ? `frames-${options.frameRange.join("-")}` : "full");
  try { if ((await fs.stat(output)).size > 1_024) return output; } catch { /* render below */ }
  await fs.mkdir(path.dirname(output), { recursive: true });
  const serveUrl = await bundledServeUrl();
  const composition = await selectComposition({ serveUrl, id: spec.template, inputProps: spec.props });
  await renderMedia({
    serveUrl,
    composition,
    inputProps: spec.props,
    codec: "h264",
    outputLocation: output,
    concurrency: 1,
    disallowParallelEncoding: true,
    x264Preset: "superfast",
    crf: 25,
    imageFormat: "jpeg",
    jpegQuality: 82,
    overwrite: true,
    scale: 0.5,
    chromiumOptions: { enableMultiProcessOnLinux: false },
    logLevel: "warn"
    ,...(options.frameRange ? { frameRange: options.frameRange } : {})
  });
  return output;
}

export async function renderCommercePoster(spec: CommerceVideoRenderSpec) {
  const output = cachePath(spec, "png");
  try { if ((await fs.stat(output)).size > 1_024) return output; } catch { /* render below */ }
  await fs.mkdir(path.dirname(output), { recursive: true });
  const serveUrl = await bundledServeUrl();
  const composition = await selectComposition({ serveUrl, id: spec.template, inputProps: spec.props });
  await renderStill({ serveUrl, composition, inputProps: spec.props, output: output, imageFormat: "png", frame: Math.max(0, Math.floor(composition.durationInFrames * 0.48)), overwrite: true, chromiumOptions: { enableMultiProcessOnLinux: false }, logLevel: "warn" });
  return output;
}

export function parseCommerceVideoSpec(content: string): CommerceVideoRenderSpec & { captions?: Array<{ start: number; end: number; text: string }> } {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("视频成果不是有效的渲染配置 JSON"); }
  if (!parsed || typeof parsed !== "object") throw new Error("视频成果缺少渲染配置");
  const value = parsed as Record<string, unknown>;
  if (!(["SellingPoint15", "Ugc30", "Promo30"] as string[]).includes(String(value.template))) throw new Error("视频模板不可用");
  if (!value.props || typeof value.props !== "object") throw new Error("视频成果缺少模板变量");
  const props = value.props as Record<string, unknown>;
  const required = ["brandName", "product", "specification", "cta", "headline", "subheadline", "brandColor", "accentColor", "factSnapshotId"];
  for (const field of required) if (typeof props[field] !== "string" || !String(props[field]).trim()) throw new Error(`视频成果缺少可用字段：${field}`);
  const captions = Array.isArray(value.captions) ? value.captions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const start = Number(row.start); const end = Number(row.end); const text = String(row.text ?? "").trim();
    return Number.isFinite(start) && Number.isFinite(end) && end > start && text ? [{ start, end, text }] : [];
  }) : undefined;
  return { template: value.template as CommerceVideoTemplate, props: props as unknown as CommerceVideoProps, captions };
}
