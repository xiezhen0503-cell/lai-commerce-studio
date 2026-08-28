import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { CommerceVideoProps } from "../../../remotion/types";

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

function resolvePublicDirectory() {
  const candidates = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "apps", "web", "public")
  ];
  const found = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!found) throw new Error("没有找到视频渲染静态资源目录");
  return found;
}

declare global { var __laiRemotionBundle: Promise<string> | undefined; }
declare global { var __laiRemotionBrowser: Promise<string> | undefined; }
declare global { var __laiVideoRendererVerified: boolean | undefined; }
declare global { var __laiVideoRenderTail: Promise<void> | undefined; }

async function bundledServeUrl() {
  globalThis.__laiRemotionBundle ??= bundle({ entryPoint: resolveEntryPoint(), publicDir: resolvePublicDirectory(), webpackOverride: (config) => ({ ...config, cache: false }) });
  return globalThis.__laiRemotionBundle;
}

async function browserExecutable() {
  globalThis.__laiRemotionBrowser ??= ensureBrowser({ logLevel: "error", chromeMode: "headless-shell" }).then((status) => {
    if (status.type === "no-browser" || status.type === "version-mismatch") throw new Error("视频渲染浏览器没有安装完成");
    return status.path;
  });
  return globalThis.__laiRemotionBrowser;
}

function cachePath(spec: CommerceVideoRenderSpec, extension: "mp4" | "png", variant = "full") {
  const hash = crypto.createHash("sha256").update(JSON.stringify({ spec, variant })).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), "laicommerce-renders", `${hash}.${extension}`);
}

async function withRenderLock<T>(render: () => Promise<T>) {
  const previous = globalThis.__laiVideoRenderTail ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.__laiVideoRenderTail = previous.catch(() => {}).then(() => gate);
  await previous.catch(() => {});
  try { return await render(); } finally { release(); }
}

export async function renderCommerceVideo(spec: CommerceVideoRenderSpec, options: { frameRange?: [number, number] } = {}) {
  const output = cachePath(spec, "mp4", options.frameRange ? `frames-${options.frameRange.join("-")}` : "full");
  try {
    if ((await inspectPlayableMp4(output)).passed) {
      globalThis.__laiVideoRendererVerified = true;
      return output;
    }
  } catch { /* render below */ }
  return withRenderLock(async () => {
    try {
      if ((await inspectPlayableMp4(output)).passed) {
        globalThis.__laiVideoRendererVerified = true;
        return output;
      }
    } catch { /* render below */ }
    await fs.mkdir(path.dirname(output), { recursive: true });
    const [serveUrl, executable] = await Promise.all([bundledServeUrl(), browserExecutable()]);
    const composition = await selectComposition({ serveUrl, id: spec.template, inputProps: spec.props, browserExecutable: executable });
    await renderMedia({
      serveUrl,
      composition,
      inputProps: spec.props,
      browserExecutable: executable,
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
      logLevel: "warn",
      ...(options.frameRange ? { frameRange: options.frameRange } : {})
    });
    await inspectPlayableMp4(output, true);
    globalThis.__laiVideoRendererVerified = true;
    return output;
  });
}

export async function renderCommercePoster(spec: CommerceVideoRenderSpec) {
  const output = cachePath(spec, "png");
  try { if ((await inspectPng(output)).passed) return output; } catch { /* render below */ }
  return withRenderLock(async () => {
    try { if ((await inspectPng(output)).passed) return output; } catch { /* render below */ }
    await fs.mkdir(path.dirname(output), { recursive: true });
    const [serveUrl, executable] = await Promise.all([bundledServeUrl(), browserExecutable()]);
    const composition = await selectComposition({ serveUrl, id: spec.template, inputProps: spec.props, browserExecutable: executable });
    await renderStill({ serveUrl, composition, inputProps: spec.props, output: output, imageFormat: "png", frame: Math.max(0, Math.floor(composition.durationInFrames * 0.48)), overwrite: true, browserExecutable: executable, chromiumOptions: { enableMultiProcessOnLinux: false }, logLevel: "warn" });
    await inspectPng(output, true);
    return output;
  });
}

export type VideoFileQa = { passed: boolean; size: number; hasFtyp: boolean; hasMovieIndex: boolean; hasMediaData: boolean; hasH264Track: boolean };

export async function inspectPlayableMp4(filePath: string, throwOnFailure = false): Promise<VideoFileQa> {
  const bytes = await fs.readFile(filePath);
  const qa = {
    passed: false,
    size: bytes.byteLength,
    hasFtyp: bytes.byteLength >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp",
    hasMovieIndex: bytes.includes(Buffer.from("moov")),
    hasMediaData: bytes.includes(Buffer.from("mdat")),
    hasH264Track: bytes.includes(Buffer.from("avc1")) || bytes.includes(Buffer.from("avc3"))
  };
  qa.passed = qa.size >= 16_384 && qa.hasFtyp && qa.hasMovieIndex && qa.hasMediaData && qa.hasH264Track;
  if (!qa.passed && throwOnFailure) throw new Error(`MP4 文件完整性检查失败：${JSON.stringify(qa)}`);
  return qa;
}

export function getVideoRendererStatus() {
  const browserRoots = [
    path.resolve(process.cwd(), "node_modules", ".remotion", "chrome-headless-shell", "VERSION"),
    path.resolve(process.cwd(), "..", "..", "node_modules", ".remotion", "chrome-headless-shell", "VERSION")
  ];
  let entryPointReady = true;
  try { resolveEntryPoint(); } catch { entryPointReady = false; }
  const browserInstalled = browserRoots.some((candidate) => fsSync.existsSync(candidate));
  let chineseFontInstalled = false;
  try { chineseFontInstalled = fsSync.existsSync(path.join(resolvePublicDirectory(), "fonts", "NotoSansSC-400.ttf")); } catch { /* reported as false */ }
  return {
    provider: "remotion-server-renderer",
    live: entryPointReady && browserInstalled && chineseFontInstalled,
    entryPointReady,
    browserInstalled,
    chineseFontInstalled,
    runtimeVerified: globalThis.__laiVideoRendererVerified === true,
    preview: true,
    mp4Render: true,
    formats: ["mp4", "png", "srt", "zip", "json"]
  };
}

async function inspectPng(filePath: string, throwOnFailure = false) {
  const bytes = await fs.readFile(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const qa = { passed: bytes.byteLength >= 1_024 && bytes.subarray(0, 8).equals(signature), size: bytes.byteLength };
  if (!qa.passed && throwOnFailure) throw new Error(`PNG 封面完整性检查失败：${JSON.stringify(qa)}`);
  return qa;
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
