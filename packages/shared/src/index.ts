import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import type { AgentHandoff, Artifact, ArtifactVersion, BrandProfile, CampaignBundleResult, Fact, FactSnapshot, GenerationJob, Product, Project, PromptGenerationResult, PromptSpec, Scope, SourceDocument } from "@lai/domain";
import { AgentHandoffSchema, ArtifactTypeSchema as ArtifactTypeValidator, FactSchema, ProjectSchema, PromptSpecSchema, newId, nowIso } from "@lai/domain";
import { getRepository, type CommerceRepository } from "@lai/database";
import { authorize, defaultAgentPrincipal, type AgentPrincipal } from "@lai/permissions";
import { buildPromptVariants, compilePrompt, evaluatePrompt, generationModeFor, retrieveSourceExcerpts, type CompileContext, type GenerationMode } from "@lai/prompt-engine";
import { IMAGE_PIPELINE_VERSION, providerRegistry } from "@lai/providers";
import { createAgentToken, hashToken, redact, signWebhook } from "@lai/security";
import { z } from "zod";

export const DEMO_WORKSPACE_ID = "ws_demo";
export const DEMO_PROJECT_ID = "prj_qingmai_launch";
export const DEMO_BRAND_ID = "brand_wuqinggu";
export const DEMO_PRODUCT_ID = "product_qingmaicui";
export const DEMO_AGENT_TOKEN = "lai_demo_agent_token";
export const EMPTY_TEST_BRAND_ID = "brand_lai_test_blank";
export const EMPTY_TEST_PRODUCT_ID = "product_lai_test_blank";

export class CommerceError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) { super(message); }
}

type LocalOcrWorker = {
  recognize(image: Buffer): Promise<{ data: { text?: string; confidence?: number } }>;
  terminate(): Promise<void>;
};

export type ImageTypographyQa = {
  passed: boolean;
  recognizedText: string;
  confidence: number;
  cjkCharacters: number;
  alphaNumericCharacters: number;
};

let sharedPackageRequire: NodeJS.Require | undefined;

function requireFromSharedPackage() {
  if (sharedPackageRequire) return sharedPackageRequire;
  const candidates = [
    path.resolve(process.cwd(), "packages/shared/package.json"),
    path.resolve(process.cwd(), "../../packages/shared/package.json")
  ];
  const packageJson = candidates.find((candidate) => existsSync(candidate));
  if (!packageJson) throw new Error("图片生产依赖目录不存在，无法加载中文字体与本地质检器。");
  sharedPackageRequire = createRequire(packageJson);
  return sharedPackageRequire;
}

function bundledChineseFontPath() {
  return requireFromSharedPackage().resolve("@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf");
}

async function createLocalChineseOcrWorker(): Promise<LocalOcrWorker> {
  const packageRequire = requireFromSharedPackage();
  const { createWorker } = packageRequire("tesseract.js") as {
    createWorker: (language: string, oem: number, options: Record<string, unknown>) => Promise<LocalOcrWorker>;
  };
  const language = packageRequire("@tesseract.js-data/chi_sim") as { code: string; gzip: boolean; langPath: string };
  return createWorker(language.code, 1, {
    langPath: language.langPath,
    gzip: language.gzip,
    cacheMethod: "none"
  });
}

function dataImageBytes(assetUri: string) {
  const match = assetUri.match(/^data:image\/(?:png|jpe?g|webp|svg\+xml);base64,(.+)$/i);
  if (!match?.[1]) throw new Error("图片文件无法进入本地质量检查。");
  return Buffer.from(match[1], "base64");
}

export async function inspectTextFreeImage(assetUri: string): Promise<ImageTypographyQa> {
  const prepared = await sharp(dataImageBytes(assetUri))
    .rotate()
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
  const worker = await createLocalChineseOcrWorker();
  try {
    const result = await worker.recognize(prepared);
    const recognizedText = String(result.data.text || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const cjkCharacters = (recognizedText.match(/[\u3400-\u9fff]/g) || []).length;
    const alphaNumericCharacters = (recognizedText.match(/[A-Za-z0-9]/g) || []).length;
    const confidence = Number.isFinite(result.data.confidence) ? Number(result.data.confidence) : 0;
    return {
      passed: cjkCharacters < 2 && alphaNumericCharacters < 4,
      recognizedText,
      confidence,
      cjkCharacters,
      alphaNumericCharacters
    };
  } finally {
    await worker.terminate();
  }
}

const checksumFacts = (facts: Fact[]) => crypto.createHash("sha256").update(JSON.stringify(facts.map((fact) => ({ id: fact.id, value: fact.value, status: fact.status, updatedAt: fact.updatedAt })))).digest("hex");

export function buildGroundedImagePrompt(context: CompileContext, referenceImageUsed: boolean) {
  const product = context.products[0]!;
  const creative = generationModeFor(context.spec) === "creative";
  const confirmedFacts = (creative ? [] : context.snapshot.facts)
    .filter((fact) => ["verified", "user-confirmed"].includes(fact.status) && fact.value)
    .slice(0, 12)
    .map((fact) => `${fact.type}: ${fact.value}${fact.unit ? ` ${fact.unit}` : ""}`);
  const visualReferenceRule = referenceImageUsed
    ? "Use the supplied product photo as the visual reference. Preserve the product shape, package proportions, colors, logo placement and visible label layout. Do not replace or redesign the product."
    : "No usable product photo was supplied. Create a clearly generic packaging concept for a creative draft; do not invent a real trademark, certification mark, label copy or exact package detail.";
  const typographyRule = referenceImageUsed
    ? "Preserve only the text and label marks already visible in the supplied product photo. Add no new headline, slogan, price, number, seal, watermark, platform logo or pseudo-text; the application will add accurate campaign typography later."
    : "CRITICAL ZERO-TEXT RULE: render absolutely no words, letters, numbers, Chinese characters, calligraphy, seals, logos, captions, labels, watermarks or pseudo-text anywhere in the image. Keep every visible package face blank and unprinted. Do not reproduce text from the user objective; the application will add all accurate Chinese typography later with a bundled font.";
  const prompt = `Create one square commercial product photography background plate. This is a photograph, not a poster, advertisement layout, packaging design sheet or typography composition.

USER OBJECTIVE — interpret its visual meaning only; never copy or render any words from it
${context.spec.objective}

PRODUCT CONTEXT
Mode: ${creative ? "Free creative concept without reference materials" : "Source-grounded product production"}
Brand: ${creative ? "Unspecified; use no real trademark" : context.brand.name}
Product: ${creative ? "Infer only a generic product category from the user objective" : product.name}
Target platforms: ${context.spec.targetPlatforms.join(", ")}
Audience: ${context.spec.targetAudience}
Confirmed facts only:
${confirmedFacts.length ? confirmedFacts.map((item) => `- ${item}`).join("\n") : "- No confirmed product facts; keep all concrete package details generic."}

VISUAL DIRECTION
- Photorealistic commercial product photography, clean composition, believable lighting and one clear focal product.
- Follow this user request and the confirmed facts. Treat any missing fact as missing.
- ${visualReferenceRule}
- ${typographyRule}
- No poster headline, no advertising slogan, no platform logo, no duplicated package, no deformed container, no extra fingers or hands.
- Avoid these claims or expressions: ${[...context.brand.bannedWords, ...product.prohibitedClaims].join(", ") || "none"}.

Return the image only.`;
  return { prompt, confirmedFacts };
}

function escapeSvgText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function renderChineseTextLayer(input: { text: string; width: number; height: number; fontSize: number; color: string; align?: "left" | "center" | "right"; weight?: number }) {
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#ffffff";
  const weight = Math.min(900, Math.max(100, input.weight || 500));
  const layer = await sharp({
    text: {
      text: `<span foreground="${color}" font_weight="${weight}">${escapeSvgText(input.text)}</span>`,
      font: `Noto Sans SC ${input.fontSize}`,
      fontfile: bundledChineseFontPath(),
      width: input.width,
      height: input.height,
      align: input.align || "left",
      rgba: true
    }
  }).png().toBuffer();
  const metadata = await sharp(layer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("中文信息层没有生成有效像素。");
  return layer;
}

function confirmedFactValue(context: CompileContext, names: string[]) {
  return context.snapshot.facts.find((fact) => names.includes(fact.type) && ["verified", "user-confirmed"].includes(fact.status) && fact.value)?.value;
}

export async function composeUsableProductImage(assetUri: string, context: CompileContext) {
  const match = assetUri.match(/^data:(image\/(?:png|jpe?g|webp|svg\+xml));base64,(.+)$/i);
  if (!match?.[2]) throw new Error("图片模型返回的文件无法进入确定性排版，请重新生成。");
  const product = context.products[0]!;
  const creative = generationModeFor(context.spec) === "creative";
  const productName = creative ? "商品创意概念图" : confirmedFactValue(context, ["商品名称", "产品名称"]) || product.name;
  const specification = creative ? undefined : confirmedFactValue(context, ["规格", "净含量"]) || product.specification;
  const price = creative ? undefined : confirmedFactValue(context, ["活动价", "售价", "价格"]);
  const date = creative ? undefined : confirmedFactValue(context, ["活动时间", "活动日期"]);
  const brandName = creative ? "AI 自由创作" : context.brand.name;
  const safeColor = /^#[0-9a-f]{6}$/i.test(context.brand.colors[0] || "") ? context.brand.colors[0]! : "#242064";
  const accent = /^#[0-9a-f]{6}$/i.test(context.brand.colors[1] || "") ? context.brand.colors[1]! : "#a9f0d2";
  const detailLines = creative ? ["具体商品信息待确认"] : [specification && `规格：${specification}`, price && `活动价：${price}`, date && `活动时间：${date}`].filter(Boolean) as string[];
  const overlay = Buffer.from(`<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${safeColor}" stop-opacity="0"/><stop offset="0.38" stop-color="${safeColor}" stop-opacity="0.86"/><stop offset="1" stop-color="${safeColor}" stop-opacity="0.98"/></linearGradient></defs>
    <rect x="0" y="610" width="1024" height="414" fill="url(#fade)"/>
    <rect x="70" y="695" width="178" height="44" rx="22" fill="${accent}"/>
    <rect x="52" y="52" width="920" height="920" rx="30" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2" stroke-dasharray="12 10"/>
  </svg>`);
  const brandLayer = await renderChineseTextLayer({ text: brandName, width: 162, height: 38, fontSize: 21, color: safeColor, align: "center", weight: 700 });
  const productLayer = await renderChineseTextLayer({ text: productName.slice(0, 20), width: 884, height: 64, fontSize: 44, color: "#ffffff", weight: 800 });
  const detailLayers = await Promise.all(detailLines.slice(0, 3).map((line) => renderChineseTextLayer({ text: line, width: 884, height: 42, fontSize: 28, color: "#ffffff", weight: 600 })));
  const ctaLayer = await renderChineseTextLayer({ text: context.brand.ctas[0] || "查看商品详情", width: 884, height: 40, fontSize: 24, color: "#ffffff", weight: 600 });
  const textComposites = [
    { input: brandLayer, top: 698, left: 78 },
    { input: productLayer, top: 742, left: 70 },
    ...detailLayers.map((input, index) => ({ input, top: 790 + index * 46, left: 70 })),
    { input: ctaLayer, top: 938, left: 70 }
  ];
  const bytes = await sharp(Buffer.from(match[2], "base64"))
    .resize(1024, 1024, { fit: "cover" })
    .composite([{ input: overlay, top: 0, left: 0 }, ...textComposites])
    .png({ quality: 92, compressionLevel: 8 })
    .toBuffer();
  return {
    assetUri: `data:image/png;base64,${bytes.toString("base64")}`,
    overlayFields: { brandName, productName, specification, price, date, cta: context.brand.ctas[0] || "查看商品详情" },
    overlayFont: "Noto Sans SC 400 (bundled OFL-1.1)"
  };
}

function firstMeaningfulLine(markdown: string, fallback: string) {
  return markdown.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim()).find((line) => line.length >= 4)?.slice(0, 32) || fallback;
}

const CommercePlanModelSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  goals: z.array(z.object({
    goal: z.string().trim().min(1),
    kpi: z.string().trim().min(1),
    observationPeriod: z.string().trim().min(1),
    successCriteria: z.string().trim().min(1)
  })).min(1),
  audience: z.object({
    segment: z.string().trim().min(1),
    scenes: z.array(z.string().trim().min(1)).min(1),
    barriers: z.array(z.string().trim().min(1)).min(1)
  }),
  platformStrategies: z.array(z.object({
    platform: z.string().trim().min(1),
    approach: z.string().trim().min(1)
  })).min(1),
  strategies: z.array(z.string().trim().min(1)).min(1),
  contentMatrix: z.array(z.object({
    theme: z.string().trim().min(1),
    benefit: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
    format: z.string().trim().min(1),
    cta: z.string().trim().min(1)
  })).min(1),
  schedule: z.array(z.object({
    day: z.coerce.number().int().min(1).max(7),
    owner: z.string().trim().min(1),
    action: z.string().trim().min(1),
    deliverable: z.string().trim().min(1),
    metric: z.string().trim().min(1)
  })).min(1),
  resources: z.array(z.object({
    role: z.string().trim().min(1),
    responsibility: z.string().trim().min(1),
    requirement: z.string().trim().min(1),
    budgetOrHours: z.string().trim().min(1)
  })).min(1),
  review: z.object({
    metrics: z.string().trim().min(1),
    reviewTimes: z.string().trim().min(1),
    scaleCondition: z.string().trim().min(1),
    adjustCondition: z.string().trim().min(1),
    stopCondition: z.string().trim().min(1)
  }),
  boundaries: z.object({
    confirmedFacts: z.array(z.string().trim().min(1)),
    creativeAssumptions: z.array(z.string().trim().min(1)).min(1),
    pendingConfirmations: z.array(z.string().trim().min(1)).min(1)
  })
});

type CommercePlanModel = z.infer<typeof CommercePlanModelSchema>;

function modelJsonCandidate(text: string) {
  const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");
  return objectStart >= 0 && objectEnd > objectStart ? withoutFence.slice(objectStart, objectEnd + 1) : withoutFence;
}

function markdownCell(value: string) {
  return value.replace(/\s+/g, " ").replace(/\|/g, "／").trim();
}

function renderCommercePlanModel(plan: CommercePlanModel) {
  const schedule = [...plan.schedule].sort((left, right) => left.day - right.day);
  return `# ${plan.title.replace(/^#+\s*/, "")}

## 方案摘要

${plan.summary}

## 目标与指标

| 业务目标 | 核心 KPI | 观察周期 | 成功标准 |
|---|---|---|---|
${plan.goals.map((item) => `| ${markdownCell(item.goal)} | ${markdownCell(item.kpi)} | ${markdownCell(item.observationPeriod)} | ${markdownCell(item.successCriteria)} |`).join("\n")}

## 目标人群与平台策略

- **目标人群**：${plan.audience.segment}
- **使用场景**：${plan.audience.scenes.join("；")}
- **购买阻力**：${plan.audience.barriers.join("；")}
${plan.platformStrategies.map((item) => `- **${item.platform}**：${item.approach}`).join("\n")}

## 核心策略

${plan.strategies.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## 内容矩阵

| 内容主线 | 用户利益点 | 素材/证据 | 内容形式 | CTA |
|---|---|---|---|---|
${plan.contentMatrix.map((item) => `| ${markdownCell(item.theme)} | ${markdownCell(item.benefit)} | ${markdownCell(item.evidence)} | ${markdownCell(item.format)} | ${markdownCell(item.cta)} |`).join("\n")}

## 7 天执行排期

| 时间 | 负责人 | 具体执行动作 | 交付物 | 验收指标 |
|---|---|---|---|---|
${schedule.map((item) => `| 第 ${item.day} 天 | ${markdownCell(item.owner)} | 执行：${markdownCell(item.action)} | ${markdownCell(item.deliverable)} | ${markdownCell(item.metric)} |`).join("\n")}

## 资源与预算假设

| 角色/资源 | 分工 | 所需资源 | 预算或工时 |
|---|---|---|---|
${plan.resources.map((item) => `| ${markdownCell(item.role)} | ${markdownCell(item.responsibility)} | ${markdownCell(item.requirement)} | ${markdownCell(item.budgetOrHours)} |`).join("\n")}

## 数据复盘与止损

- **监测指标**：${plan.review.metrics}
- **复盘时间**：${plan.review.reviewTimes}
- **继续加码条件**：${plan.review.scaleCondition}
- **调整条件**：${plan.review.adjustCondition}
- **停止条件**：${plan.review.stopCondition}

## 事实依据、创意假设与发布前待确认

### 已确认事实
${(plan.boundaries.confirmedFacts.length ? plan.boundaries.confirmedFacts : ["本次没有可引用的已确认商品事实，发布前需补充资料。"] ).map((item) => `- ${item}`).join("\n")}

### 创意假设
${plan.boundaries.creativeAssumptions.map((item) => `- ${item}`).join("\n")}

### 发布前待确认
${plan.boundaries.pendingConfirmations.map((item) => `- ${item}`).join("\n")}
`;
}

function normalizeCommercePlanModelOutput(text: string) {
  try {
    const json = JSON.parse(modelJsonCandidate(text));
    const checked = CommercePlanModelSchema.safeParse(json);
    if (checked.success) {
      const markdown = renderCommercePlanModel(checked.data);
      return { markdown, structured: true, structureIssues: [] as string[] };
    }
    const structureIssues = checked.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "方案"}：${issue.message}`);
    return { markdown: text.trim(), structured: false, structureIssues };
  } catch {
    return { markdown: text.trim(), structured: false, structureIssues: ["没有返回可解析的结构化方案 JSON"] };
  }
}

const CommerceScriptModelSchema = z.object({
  title: z.string().trim().min(1),
  creativeDirection: z.string().trim().min(1),
  openings: z.array(z.object({
    label: z.string().trim().min(1),
    visual: z.string().trim().min(1),
    spoken: z.string().trim().min(1),
    subtitle: z.string().trim().min(1)
  })).min(1),
  shots: z.array(z.object({
    start: z.coerce.number().min(0),
    end: z.coerce.number().positive(),
    visual: z.string().trim().min(1),
    action: z.string().trim().min(1),
    spoken: z.string().trim().min(1),
    subtitle: z.string().trim().min(1),
    productBoundary: z.string().trim().min(1)
  })).min(1),
  production: z.object({
    scenes: z.array(z.string().trim().min(1)).min(1),
    props: z.array(z.string().trim().min(1)).min(1),
    camera: z.array(z.string().trim().min(1)).min(1),
    sound: z.array(z.string().trim().min(1)).min(1)
  }),
  creativeAssumptions: z.array(z.string().trim().min(1)).min(1),
  pendingConfirmations: z.array(z.string().trim().min(1)).min(1)
});

type CommerceScriptModel = z.infer<typeof CommerceScriptModelSchema>;

function renderCommerceScriptModel(script: CommerceScriptModel, targetDurationSeconds: number) {
  const shots = [...script.shots].sort((left, right) => left.start - right.start);
  return `# ${script.title.replace(/^#+\s*/, "")}

## 创意主线

${script.creativeDirection}

## A/B/C 前 3 秒开场

${script.openings.map((item) => `### ${item.label}\n- **画面**：${item.visual}\n- **口播**：${item.spoken}\n- **字幕**：${item.subtitle}`).join("\n\n")}

## ${targetDurationSeconds} 秒逐镜头脚本

| 时间 | 画面/景别 | 人物动作 | 口播/台词 | 字幕/屏幕文字 | 商品展示/事实边界 |
|---|---|---|---|---|---|
${shots.map((item) => `| ${item.start}–${item.end}s | ${markdownCell(item.visual)} | ${markdownCell(item.action)} | ${markdownCell(item.spoken)} | ${markdownCell(item.subtitle)} | ${markdownCell(item.productBoundary)} |`).join("\n")}

## 拍摄与素材清单

- **场景**：${script.production.scenes.join("；")}
- **道具**：${script.production.props.join("；")}
- **镜头与转场**：${script.production.camera.join("；")}
- **声音**：${script.production.sound.join("；")}

## 创意假设与发布前待确认

### 创意假设
${script.creativeAssumptions.map((item) => `- ${item}`).join("\n")}

### 发布前待确认
${script.pendingConfirmations.map((item) => `- ${item}`).join("\n")}
`;
}

function normalizeCommerceScriptModelOutput(text: string, targetDurationSeconds: number) {
  try {
    const json = JSON.parse(modelJsonCandidate(text));
    const checked = CommerceScriptModelSchema.safeParse(json);
    if (checked.success) return { markdown: renderCommerceScriptModel(checked.data, targetDurationSeconds), structured: true, structureIssues: [] as string[] };
    return { markdown: text.trim(), structured: false, structureIssues: checked.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "脚本"}：${issue.message}`) };
  } catch {
    return { markdown: text.trim(), structured: false, structureIssues: ["没有返回可解析的结构化脚本 JSON"] };
  }
}

function videoScriptOutputFormat(targetDurationSeconds: number) {
  return `只返回严格 JSON 对象，不要 Markdown 代码围栏，不要解释。系统会把数据排版成中文脚本。字段必须为：
{
  "title": "脚本标题",
  "creativeDirection": "具体创意主线与核心冲突",
  "openings": [{"label":"A版/B版/C版","visual":"前3秒画面","spoken":"口播","subtitle":"字幕"}],
  "shots": [{"start":0,"end":3,"visual":"画面与景别","action":"人物动作","spoken":"口播或台词","subtitle":"字幕或屏幕文字","productBoundary":"商品如何展示、事实依据或待确认边界"}],
  "production": {"scenes":["场景"],"props":["道具"],"camera":["景别、运镜或转场"],"sound":["声音要求"]},
  "creativeAssumptions": ["创意假设"],
  "pendingConfirmations": ["发布前待确认项"]
}
创作要求：openings 给 A/B/C 三个不同开场；shots 设计至少 5 个连续镜头，从 0 秒覆盖到 ${targetDurationSeconds} 秒；具体商品事实没有证据时写入 pendingConfirmations，不得编造。`;
}

function commercePlanOutputFormat() {
  return `只返回严格 JSON 对象，不要 Markdown 代码围栏，不要解释。系统会把数据排版成中文活动方案。字段必须为：
{
  "title": "方案标题",
  "summary": "3到5句话，写清目标、受众、平台和核心判断",
  "goals": [{"goal":"业务目标","kpi":"核心KPI或基线待确认","observationPeriod":"观察周期","successCriteria":"成功标准"}],
  "audience": {"segment":"目标人群","scenes":["具体使用场景"],"barriers":["购买阻力"]},
  "platformStrategies": [{"platform":"目标平台","approach":"适合该平台的表达与承接方式"}],
  "strategies": ["明确策略与执行判断"],
  "contentMatrix": [{"theme":"内容主线","benefit":"用户利益点","evidence":"素材、事实依据或待确认","format":"内容形式","cta":"下一步动作"}],
  "schedule": [{"day":1,"owner":"负责人","action":"当天具体动作","deliverable":"交付物","metric":"验收指标"}],
  "resources": [{"role":"角色或资源","responsibility":"分工","requirement":"所需素材或工具","budgetOrHours":"预算或工时；未知写待确认"}],
  "review": {"metrics":"监测指标","reviewTimes":"复盘时间","scaleCondition":"继续加码条件","adjustCondition":"调整条件","stopCondition":"停止条件"},
  "boundaries": {"confirmedFacts":["已确认事实；自由创作无事实时可为空"],"creativeAssumptions":["创意假设"],"pendingConfirmations":["发布前待确认项"]}
}
创作要求：contentMatrix 规划至少 3 条内容主线；schedule 写全第 1 天到第 7 天并给具体动作；不得编造价格、规格、日期、资质、功效、销量或评价。`;
}

function activeSkillsForTask(taskType: string, generationMode: GenerationMode) {
  const primary = taskType === "short-video-script"
    ? "ecommerce-script-writer"
    : taskType === "image-creative"
      ? "image-prompt-and-production"
      : taskType === "video-storyboard"
        ? "video-storyboard-director"
        : "ecommerce-plan-generator";
  return ["intent-to-brief", ...(generationMode === "grounded" ? ["evidence-grounding"] : []), primary, "platform-adapter", "artifact-qa-and-compliance"];
}

function latestGeneratedImageUri(data: ReturnType<CommerceService["getProject"]>) {
  const artifact = data.artifacts.find((item) => item.type === "image");
  if (!artifact) return undefined;
  const version = data.artifactVersions.find((item) => item.artifactId === artifact.id && item.version === artifact.currentVersion);
  if (!version) return undefined;
  try { const parsed = JSON.parse(version.content) as { assetUri?: unknown }; return typeof parsed.assetUri === "string" ? parsed.assetUri : undefined; } catch { return undefined; }
}

const PROJECT_TEMPLATE = {
  type: "新品上市", businessGoal: "验证新品内容钩子与首购转化", targetPlatforms: ["小红书", "抖音"], targetAudience: "25–38 岁、重视配料与便携早餐的城市上班族", objective: "为新品上市生成一套有事实依据、可执行、可复核的内容方案"
};

export function seedDemoData(repo = getRepository()) {
  const now = nowIso();
  if (repo.get<Project>("projects", DEMO_PROJECT_ID)) return;
  repo.save("workspaces", { id: DEMO_WORKSPACE_ID, name: "小赖的电商工作区", createdAt: now, updatedAt: now });
  repo.save("human_users", { id: "user_lai", workspaceId: DEMO_WORKSPACE_ID, name: "小赖", role: "owner", createdAt: now, updatedAt: now });
  const brand: BrandProfile = {
    id: DEMO_BRAND_ID, workspaceId: DEMO_WORKSPACE_ID, name: "雾青谷", positioning: "把真实谷物做成忙碌日常里看得懂、带得走的小食", audience: PROJECT_TEMPLATE.targetAudience,
    story: "虚构演示品牌，源于清晨谷仓与城市通勤的对照。", tone: ["清楚", "克制", "有生活感"], preferredWords: ["真实谷物", "一杯带走", "清楚配料"],
    bannedWords: ["零负担", "最健康", "减肥", "治疗", "绝对"], colors: ["#242064", "#5E50D8", "#22A982", "#F5F6FA"], fonts: ["Noto Sans SC", "霞鹜文楷（仅标题可选）"],
    allowedClaims: ["燕麦为主要配料", "独立杯装"], forbiddenClaims: ["减脂", "治疗", "零糖（无检测报告）"], ctas: ["先看清配料，再决定要不要带走"], status: "confirmed", updatedAt: now
  };
  repo.saveBrand(brand);
  const product: Product = {
    id: DEMO_PRODUCT_ID, workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, name: "青麦脆·草莓燕麦杯", category: "冲调谷物", sku: "WQG-QMC-45X6",
    specification: "45克×6杯", cost: 12.6, inventory: 860, features: ["燕麦片为主要配料", "冻干草莓粒", "独立杯装"],
    evidence: ["虚构商品资料单 v1.0", "虚构包装背标照片"], prohibitedClaims: ["减肥", "代餐治疗", "零糖", "全网第一"], status: "confirmed", updatedAt: now
  };
  repo.saveProduct(product);
  const project: Project = {
    id: DEMO_PROJECT_ID, workspaceId: DEMO_WORKSPACE_ID, name: "青麦脆夏日上新", type: PROJECT_TEMPLATE.type, brandId: brand.id, productIds: [product.id], objective: PROJECT_TEMPLATE.objective,
    businessGoal: PROJECT_TEMPLATE.businessGoal, targetPlatforms: PROJECT_TEMPLATE.targetPlatforms, targetAudience: PROJECT_TEMPLATE.targetAudience, budget: 30000, campaignStart: "2026-09-10", campaignEnd: "2026-09-30",
    status: "needs-input", createdAt: now, updatedAt: now
  };
  repo.saveProject(project);
  const source: SourceDocument = { id: "src_demo_product_sheet", workspaceId: DEMO_WORKSPACE_ID, projectId: project.id, fileName: "虚构商品资料单-v1.md", mimeType: "text/markdown", size: 812, parser: "local-document-parser-v1", status: "parsed", storagePath: "demo://product-sheet", extractedText: "商品名称：青麦脆·草莓燕麦杯\n规格：45克×6杯\n主要配料：燕麦片、冻干草莓粒、乳粉\n产地：浙江湖州（虚构演示）", createdAt: now, parsedAt: now };
  repo.saveSource(source);
  const facts: Fact[] = [
    { id: "fact_product_name", projectId: project.id, type: "商品名称", value: product.name, status: "verified", confidence: .99, sourceDocumentId: source.id, sourcePosition: "第1行", sourceQuote: `商品名称：${product.name}`, confirmedByUser: false, createdAt: now, updatedAt: now },
    { id: "fact_spec", projectId: project.id, type: "规格", value: product.specification, status: "user-confirmed", confidence: 1, sourceDocumentId: source.id, sourcePosition: "第2行", sourceQuote: `规格：${product.specification}`, confirmedByUser: true, confirmedAt: now, createdAt: now, updatedAt: now },
    { id: "fact_ingredient", projectId: project.id, type: "主要配料", value: "燕麦片、冻干草莓粒、乳粉", status: "verified", confidence: .94, sourceDocumentId: source.id, sourcePosition: "第3行", sourceQuote: "主要配料：燕麦片、冻干草莓粒、乳粉", confirmedByUser: false, createdAt: now, updatedAt: now },
    { id: "fact_origin", projectId: project.id, type: "产地", value: "浙江湖州（虚构演示）", status: "verified", confidence: .9, sourceDocumentId: source.id, sourcePosition: "第4行", sourceQuote: "产地：浙江湖州（虚构演示）", confirmedByUser: false, createdAt: now, updatedAt: now },
    { id: "fact_price", projectId: project.id, type: "活动价", value: "", unit: "元", status: "missing", confidence: 0, confirmedByUser: false, createdAt: now, updatedAt: now },
    { id: "fact_campaign_time", projectId: project.id, type: "活动时间", value: "2026-09-10 至 2026-09-30", status: "user-confirmed", confidence: 1, confirmedByUser: true, confirmedAt: now, createdAt: now, updatedAt: now }
  ].map((fact) => FactSchema.parse(fact));
  facts.forEach((fact) => repo.saveFact(fact));
  const snapshot = createFactSnapshot(project.id, "seed", repo);
  project.currentFactSnapshotId = snapshot.id;
  repo.saveProject(project);
  const agent = { id: "agent_demo", workspaceId: DEMO_WORKSPACE_ID, name: "演示协作智能体", scopes: ["workspace:read", "brand:read", "product:read", "project:read", "source:read", "fact:read", "prompt:read", "prompt:write", "prompt:run", "skill:run", "artifact:read", "artifact:write", "artifact:review", "job:read"] as Scope[], projectIds: [project.id], tokenLast4: DEMO_AGENT_TOKEN.slice(-4), status: "active", createdAt: now, updatedAt: now };
  repo.save("agent_service_accounts", agent, { workspaceId: DEMO_WORKSPACE_ID, status: "active", tokenHash: hashToken(DEMO_AGENT_TOKEN) });
  repo.save("agent_connections", { id: "conn_demo", workspaceId: DEMO_WORKSPACE_ID, agentServiceAccountId: agent.id, name: agent.name, protocol: "MCP / REST / A2A", status: "active", lastSeenAt: now, createdAt: now, updatedAt: now });
  audit("demo.seeded", { projectId: project.id }, { actorId: "system", actorType: "platform", repo });
}

export function createFactSnapshot(projectId: string, createdBy: string, repo = getRepository()) {
  const facts = repo.listFacts(projectId);
  const snapshots = repo.listSnapshots(projectId);
  const snapshot: FactSnapshot = { id: newId("snap"), projectId, version: snapshots.length + 1, factIds: facts.map((fact) => fact.id), facts, checksum: checksumFacts(facts), createdAt: nowIso(), createdBy };
  repo.saveSnapshot(snapshot);
  return snapshot;
}

export function audit(action: string, summary: Record<string, unknown>, options: { actorId: string; actorType: "human" | "agent" | "platform"; projectId?: string; repo?: CommerceRepository }) {
  const repo = options.repo ?? getRepository();
  const now = nowIso();
  return repo.save("audit_events", { id: newId("audit"), workspaceId: DEMO_WORKSPACE_ID, projectId: options.projectId, action, actorId: options.actorId, actorType: options.actorType, summary: redact(JSON.stringify(summary)).slice(0, 1200), traceId: newId("trace"), createdAt: now, updatedAt: now }, { workspaceId: DEMO_WORKSPACE_ID, projectId: options.projectId });
}

export class CommerceService {
  constructor(public repo = getRepository(), options: { seedMode?: "demo" | "blank" } = {}) {
    seedDemoData(repo);
    const seedMode = options.seedMode ?? (process.env.LAI_SEED_MODE === "blank" ? "blank" : "demo");
    const project = repo.get<Project>("projects", DEMO_PROJECT_ID);
    if (seedMode === "blank" && project && !project.productIds.includes(EMPTY_TEST_PRODUCT_ID)) {
      this.resetProjectForTesting(DEMO_PROJECT_ID);
    }
    if (seedMode === "blank") {
      repo.delete("agent_connections", "conn_demo");
      repo.delete("agent_service_accounts", "agent_demo");
    }
  }

  dashboard() {
    const projects = this.repo.listProjects();
    const facts = this.repo.list<Fact>("facts");
    const jobs = this.repo.list<GenerationJob>("generation_jobs");
    const artifacts = this.repo.list<Artifact>("artifacts");
    const reviews = this.repo.list<any>("review_requests");
    const connections = this.repo.list<any>("agent_connections");
    return { projects: projects.slice(0, 4), counts: { pendingFacts: facts.filter((fact) => ["missing", "conflicting"].includes(fact.status)).length, activeJobs: jobs.filter((job) => ["queued", "running"].includes(job.status)).length, pendingReviews: reviews.filter((review) => review.status === "pending").length, artifacts: artifacts.length, agents: connections.filter((connection) => connection.status === "active").length }, recentArtifacts: artifacts.slice(0, 5), connections: connections.slice(0, 4) };
  }

  listProjects() { return this.repo.listProjects(); }
  getProject(projectId: string) {
    const project = this.repo.get<Project>("projects", projectId);
    if (!project) throw new CommerceError("PROJECT_NOT_FOUND", "没有找到这个项目", 404);
    const artifacts = this.repo.listArtifacts(projectId);
    return { project, brand: this.repo.get<BrandProfile>("brands", project.brandId), products: project.productIds.map((id) => this.repo.get<Product>("products", id)).filter(Boolean), sources: this.repo.listSources(projectId), facts: this.repo.listFacts(projectId), snapshots: this.repo.listSnapshots(projectId), artifacts, artifactVersions: artifacts.flatMap((artifact) => this.repo.listArtifactVersions(artifact.id)), jobs: this.repo.list<GenerationJob>("generation_jobs", { projectId }), reviews: this.repo.list<any>("review_requests", { projectId }) };
  }

  createProject(input: Partial<Project> & { brandName?: string; productName?: string }) {
    const now = nowIso();
    const projectId = newId("prj");
    const existingBrand = input.brandId ? this.repo.get<BrandProfile>("brands", input.brandId) : undefined;
    const existingProducts = (input.productIds ?? []).map((id) => this.repo.get<Product>("products", id)).filter((item): item is Product => Boolean(item));
    let brandId = existingBrand?.id;
    let productIds = existingProducts.map((item) => item.id);
    if (!brandId || !productIds.length) {
      brandId = newId("brand");
      const productId = newId("product");
      const brand: BrandProfile = { id: brandId, workspaceId: DEMO_WORKSPACE_ID, name: input.brandName?.trim() || "待从资料识别品牌", positioning: "等待从本项目上传资料中识别", audience: input.targetAudience || "待从资料中确认", story: "", tone: ["清楚", "具体", "不夸大"], preferredWords: [], bannedWords: [], colors: ["#242064", "#a9f0d2"], fonts: [], allowedClaims: [], forbiddenClaims: [], ctas: ["查看商品详情"], status: "draft", updatedAt: now };
      const product: Product = { id: productId, workspaceId: DEMO_WORKSPACE_ID, brandId, name: input.productName?.trim() || "待从资料识别商品", category: "待识别", sku: "待识别", specification: "待从上传资料识别", features: [], evidence: [], prohibitedClaims: [], status: "draft", updatedAt: now };
      this.repo.saveBrand(brand); this.repo.saveProduct(product); productIds = [productId];
    }
    const project = ProjectSchema.parse({ id: projectId, workspaceId: DEMO_WORKSPACE_ID, name: input.name || "未命名电商项目", type: input.type || PROJECT_TEMPLATE.type, brandId, productIds, objective: input.objective || PROJECT_TEMPLATE.objective, businessGoal: input.businessGoal || PROJECT_TEMPLATE.businessGoal, targetPlatforms: input.targetPlatforms?.length ? input.targetPlatforms : PROJECT_TEMPLATE.targetPlatforms, targetAudience: input.targetAudience || "待从资料中确认", budget: input.budget, campaignStart: input.campaignStart, campaignEnd: input.campaignEnd, status: "draft", createdAt: now, updatedAt: now });
    this.repo.saveProject(project);
    const product = this.repo.get<Product>("products", project.productIds[0]!);
    if (product) {
      [
        { type: "商品名称", value: product.status === "confirmed" ? product.name : "", status: product.status === "confirmed" ? "verified" as const : "missing" as const, quote: product.status === "confirmed" ? "来自已确认商品资料" : undefined },
        { type: "规格", value: product.status === "confirmed" ? product.specification : "", status: product.status === "confirmed" ? "user-confirmed" as const : "missing" as const, quote: product.status === "confirmed" ? "来自已确认商品资料" : undefined },
        { type: "活动价", value: "", status: "missing" as const, quote: undefined }
      ].forEach((item) => this.repo.saveFact(FactSchema.parse({ id: newId("fact"), projectId: project.id, type: item.type, value: item.value, status: item.status, confidence: item.status === "missing" ? 0 : 1, sourceQuote: item.quote, confirmedByUser: item.status === "user-confirmed", confirmedAt: item.status === "user-confirmed" ? now : undefined, createdAt: now, updatedAt: now })));
    }
    const snapshot = createFactSnapshot(project.id, "user_lai", this.repo);
    project.currentFactSnapshotId = snapshot.id;
    this.repo.saveProject(project);
    audit("project.created", { name: project.name }, { actorId: "user_lai", actorType: "human", projectId: project.id, repo: this.repo });
    return project;
  }

  saveSource(source: SourceDocument) { this.repo.saveSource(source); audit("source.uploaded", { fileName: source.fileName }, { actorId: "user_lai", actorType: "human", projectId: source.projectId, repo: this.repo }); return source; }

  resetProjectForTesting(projectId: string) {
    const current = this.getProject(projectId).project;
    const now = nowIso();
    const deleted = this.repo.deleteProjectData(projectId, current.workspaceId);
    const brand: BrandProfile = {
      id: EMPTY_TEST_BRAND_ID, workspaceId: current.workspaceId, name: "待上传品牌", positioning: "等待从你上传的资料中识别", audience: "待从资料中确认", story: "",
      tone: ["清楚", "具体", "不夸大"], preferredWords: [], bannedWords: [], colors: [], fonts: [], allowedClaims: [], forbiddenClaims: [], ctas: [], status: "draft", updatedAt: now
    };
    const product: Product = {
      id: EMPTY_TEST_PRODUCT_ID, workspaceId: current.workspaceId, brandId: brand.id, name: "待上传商品", category: "待识别", sku: "待识别", specification: "请先上传商品资料",
      features: [], evidence: [], prohibitedClaims: [], status: "draft", updatedAt: now
    };
    this.repo.saveBrand(brand);
    this.repo.saveProduct(product);
    const project = ProjectSchema.parse({
      ...current, name: "我的资料测试项目", type: "资料驱动内容测试", brandId: brand.id, productIds: [product.id],
      objective: "根据我上传的资料检索事实并生成内容", businessGoal: "验证资料上传、正文检索、真实生成与文件下载的完整链路",
      targetPlatforms: ["小红书", "抖音"], targetAudience: "待从资料中确认", budget: undefined, campaignStart: undefined, campaignEnd: undefined,
      currentFactSnapshotId: undefined, status: "draft", updatedAt: now
    });
    this.repo.saveProject(project);
    const snapshot = createFactSnapshot(projectId, "project-reset", this.repo);
    project.currentFactSnapshotId = snapshot.id;
    project.updatedAt = nowIso();
    this.repo.saveProject(project);
    audit("project.reset-for-testing", { deleted }, { actorId: "user_lai", actorType: "human", projectId, repo: this.repo });
    return { project, snapshot, deleted };
  }

  deleteSource(projectId: string, sourceId: string) {
    const source = this.repo.get<SourceDocument>("source_documents", sourceId);
    if (!source || source.projectId !== projectId) throw new CommerceError("SOURCE_NOT_FOUND", "没有找到这份项目资料", 404);
    const updatedAt = nowIso();
    const affectedFacts = this.repo.listFacts(projectId).filter((fact) => fact.sourceDocumentId === sourceId && !fact.confirmedByUser);
    affectedFacts.forEach((fact) => this.repo.saveFact(FactSchema.parse({ ...fact, status: "expired", updatedAt })));
    this.repo.delete("source_documents", sourceId);
    const snapshot = createFactSnapshot(projectId, "user_lai", this.repo);
    const project = this.getProject(projectId).project;
    project.currentFactSnapshotId = snapshot.id;
    project.updatedAt = updatedAt;
    this.repo.saveProject(project);
    const affectedArtifacts = this.repo.listArtifacts(projectId).filter((artifact) => !artifact.humanModified);
    affectedArtifacts.forEach((artifact) => this.repo.saveArtifact({ ...artifact, status: "stale", updatedAt }));
    audit("source.deleted", { sourceId, fileName: source.fileName, expiredFacts: affectedFacts.map((fact) => fact.id) }, { actorId: "user_lai", actorType: "human", projectId, repo: this.repo });
    return { deleted: true, sourceId, snapshotId: snapshot.id, expiredFactIds: affectedFacts.map((fact) => fact.id), affectedArtifactIds: affectedArtifacts.map((artifact) => artifact.id) };
  }

  extractFacts(projectId: string, sourceId: string) {
    const source = this.repo.get<SourceDocument>("source_documents", sourceId);
    if (!source || source.projectId !== projectId) throw new CommerceError("SOURCE_NOT_FOUND", "没有找到这份项目资料", 404);
    const text = source.extractedText || "";
    const patterns = [
      { type: "商品名称", regex: /(?:^|\n)\s*(?:商品名称|产品名称)[:：\t]\s*([^\n\t]+)/i },
      { type: "品牌名称", regex: /(?:^|\n)\s*(?:品牌名称|品牌)[:：\t]\s*([^\n\t]+)/i },
      { type: "品类", regex: /(?:^|\n)\s*(?:品类|商品分类|产品分类)[:：\t]\s*([^\n\t]+)/i },
      { type: "SKU", regex: /(?:^|\n)\s*(?:SKU|货号)[:：\t]\s*([^\n\t]+)/i },
      { type: "规格", regex: /(?:^|\n)\s*(?:商品规格|产品规格|规格)[:：\t]\s*([^\n\t]+)/i },
      { type: "包装数量", regex: /(?:^|\n)\s*(?:包装数量|装箱数|包装规格)[:：\t]\s*([^\n\t]+)/i },
      { type: "活动价", regex: /(?:^|\n)\s*(?:活动价|促销价|到手价|价格)[:：\t]\s*(?:¥|￥)?\s*([\d.]+)\s*元?/i, unit: "元" },
      { type: "成本", regex: /(?:^|\n)\s*(?:成本|采购成本)[:：\t]\s*(?:¥|￥)?\s*([\d.]+)\s*元?/i, unit: "元" },
      { type: "库存", regex: /(?:^|\n)\s*(?:库存|可售库存)[:：\t]\s*([\d.]+\s*[^\n\t]*)/i },
      { type: "主要配料", regex: /(?:^|\n)\s*(?:主要配料|配料表|配料|成分)[:：\t]\s*([^\n\t]+)/i },
      { type: "产地", regex: /(?:^|\n)\s*(?:产地|生产地)[:：\t]\s*([^\n\t]+)/i },
      { type: "材质", regex: /(?:^|\n)\s*(?:材质|主要材质)[:：\t]\s*([^\n\t]+)/i },
      { type: "使用方法", regex: /(?:^|\n)\s*(?:使用方法|食用方法)[:：\t]\s*([^\n\t]+)/i },
      { type: "适用人群", regex: /(?:^|\n)\s*(?:适用人群|目标人群)[:：\t]\s*([^\n\t]+)/i },
      { type: "活动时间", regex: /(?:^|\n)\s*(?:活动时间|活动日期|促销时间)[:：\t]\s*([^\n\t]+)/i },
      { type: "资质", regex: /(?:^|\n)\s*(?:资质|许可证|认证)[:：\t]\s*([^\n\t]+)/i },
      { type: "检测报告", regex: /(?:^|\n)\s*(?:检测报告|报告编号)[:：\t]\s*([^\n\t]+)/i },
      { type: "商品卖点", regex: /(?:^|\n)\s*(?:商品卖点|核心卖点|卖点)[:：\t]\s*([^\n\t]+)/i },
      { type: "禁用宣称", regex: /(?:^|\n)\s*(?:禁用宣称|禁用词|禁止表述)[:：\t]\s*([^\n\t]+)/i },
      { type: "预算", regex: /(?:^|\n)\s*(?:预算|投放预算)[:：\t]\s*(?:¥|￥)?\s*([\d.]+)\s*元?/i, unit: "元" },
      { type: "KPI", regex: /(?:^|\n)\s*(?:核心KPI|KPI|目标指标)[:：\t]\s*([^\n\t]+)/i }
    ];
    const existing = this.repo.listFacts(projectId);
    const created: Fact[] = [];
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (!match?.[1]) continue;
      const value = match[1].trim();
      const duplicate = existing.find((fact) => fact.sourceDocumentId === source.id && fact.type === pattern.type && fact.value === value);
      if (duplicate) { created.push(duplicate); continue; }
      const current = existing.find((fact) => fact.type === pattern.type && fact.value && !["expired","missing"].includes(fact.status));
      const status = current?.value && current.value !== value ? "conflicting" : "inferred";
      const line = text.slice(0, match.index ?? 0).split("\n").length;
      const fact = FactSchema.parse({ id: newId("fact"), projectId, type: pattern.type, value, unit: pattern.unit, status, confidence: .78, sourceDocumentId: source.id, sourcePosition: `第 ${line} 行`, sourceQuote: match[0].trim(), confirmedByUser: false, conflictGroupId: status === "conflicting" ? (current?.conflictGroupId || newId("conflict")) : undefined, createdAt: nowIso(), updatedAt: nowIso() });
      this.repo.saveFact(fact); created.push(fact);
    }
    if (created.length) {
      this.syncCatalogLabels(projectId, created, source.fileName);
      const snapshot = createFactSnapshot(projectId, "platform", this.repo);
      const project = this.getProject(projectId).project;
      project.currentFactSnapshotId = snapshot.id;
      project.status = snapshot.facts.some((fact) => ["missing","conflicting"].includes(fact.status)) ? "needs-input" : project.status;
      project.updatedAt = nowIso();
      this.repo.saveProject(project);
      this.repo.listArtifacts(projectId).filter((artifact) => artifact.factSnapshotId !== snapshot.id && !artifact.humanModified).forEach((artifact) => this.repo.saveArtifact({ ...artifact, status: "stale", updatedAt: nowIso() }));
    }
    audit("fact.extracted", { sourceId, count: created.length }, { actorId: "platform", actorType: "platform", projectId, repo: this.repo });
    return created;
  }

  private syncCatalogLabels(projectId: string, facts: Fact[], sourceName: string) {
    const project = this.getProject(projectId).project;
    const product = project.productIds[0] ? this.repo.get<Product>("products", project.productIds[0]) : undefined;
    const brand = this.repo.get<BrandProfile>("brands", project.brandId);
    const latest = (type: string) => facts.find((fact) => fact.type === type && fact.value)?.value;
    if (product) {
      const features = latest("商品卖点")?.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean);
      const prohibitedClaims = latest("禁用宣称")?.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean);
      this.repo.saveProduct({
        ...product,
        name: latest("商品名称") ?? product.name,
        category: latest("品类") ?? product.category,
        sku: latest("SKU") ?? product.sku,
        specification: latest("规格") ?? product.specification,
        features: features?.length ? features : product.features,
        prohibitedClaims: prohibitedClaims?.length ? prohibitedClaims : product.prohibitedClaims,
        evidence: product.evidence.includes(sourceName) ? product.evidence : [...product.evidence, sourceName],
        updatedAt: nowIso()
      });
    }
    const brandName = latest("品牌名称");
    if (brandName && brand) this.repo.saveBrand({ ...brand, name: brandName, updatedAt: nowIso() });
  }

  confirmFact(projectId: string, factId: string, value?: string) {
    const fact = this.repo.get<Fact>("facts", factId);
    if (!fact || fact.projectId !== projectId) throw new CommerceError("FACT_NOT_FOUND", "没有找到这条事实", 404);
    const updated = FactSchema.parse({ ...fact, value: value ?? fact.value, status: "user-confirmed", confidence: 1, confirmedByUser: true, confirmedAt: nowIso(), updatedAt: nowIso() });
    this.repo.saveFact(updated);
    const snapshot = createFactSnapshot(projectId, "user_lai", this.repo);
    const project = this.getProject(projectId).project;
    project.currentFactSnapshotId = snapshot.id; project.updatedAt = nowIso(); this.repo.saveProject(project);
    const affected = this.repo.listArtifacts(projectId).filter((artifact) => artifact.factSnapshotId !== snapshot.id && !artifact.humanModified);
    affected.forEach((artifact) => this.repo.saveArtifact({ ...artifact, status: "stale", updatedAt: nowIso() }));
    audit("fact.confirmed", { factId, affectedArtifacts: affected.map((item) => item.id) }, { actorId: "user_lai", actorType: "human", projectId, repo: this.repo });
    return { fact: updated, snapshot, affectedArtifactIds: affected.map((item) => item.id) };
  }

  makeCompileContext(projectId: string, objective: string, generationMode: GenerationMode = "grounded"): CompileContext {
    const data = this.getProject(projectId);
    const brand = data.brand;
    const products = data.products as Product[];
    if (!brand || products.length === 0) throw new CommerceError("PROJECT_CONTEXT_INCOMPLETE", "项目缺少品牌或商品资料");
    const snapshot = data.snapshots.find((item) => item.id === data.project.currentFactSnapshotId) ?? data.snapshots[0] ?? createFactSnapshot(projectId, "platform", this.repo);
    const taskType = objective.includes("脚本") ? "short-video-script" : objective.includes("图片") || objective.includes("海报") ? "image-creative" : objective.includes("视频") ? "video-storyboard" : "campaign-plan";
    const now = nowIso();
    const sourceExcerpts = generationMode === "grounded" ? retrieveSourceExcerpts(data.sources, objective) : [];
    const retrievedSourceIds = [...new Set(sourceExcerpts.map((item) => item.sourceId))];
    const sourceNames = [...new Set(sourceExcerpts.map((item) => item.fileName))];
    const confirmedValues = generationMode === "grounded" ? snapshot.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status) && fact.value).map((fact) => fact.value) : [];
    const spec = PromptSpecSchema.parse({ id: newId("ps"), name: `${data.project.name} · ${objective.slice(0, 24)}`, version: 1, taskType, objective, businessGoal: data.project.businessGoal, projectId, brandId: brand.id, productIds: products.map((item) => item.id), targetAudience: data.project.targetAudience, targetPlatforms: data.project.targetPlatforms, contextReferences: generationMode === "creative" ? [`laicommerce://projects/${projectId}`] : [`laicommerce://projects/${projectId}`, `laicommerce://projects/${projectId}/facts`, ...retrievedSourceIds.map((id) => `laicommerce://sources/${id}`)], sourceDocumentIds: retrievedSourceIds, factSnapshotId: snapshot.id, requiredFacts: generationMode === "creative" ? [] : ["商品名称", "规格", "活动价", "活动时间"], creativePreferences: ["具体场景", "一条内容只讲一个利益点", "避免模板化三段式"], tone: brand.tone, style: "清醒、具体、有生活场景", deliverables: taskType === "short-video-script" ? ["30 秒短视频脚本", "3 个 A/B 开场", generationMode === "creative" ? "创意假设与待确认清单" : "事实来源与风险提示"] : taskType === "image-creative" ? ["5 张主图 Storyboard", "图片提示词", generationMode === "creative" ? "创意假设与待确认清单" : "确定性叠字清单"] : taskType === "video-storyboard" ? ["30 秒视频分镜", "素材清单", "字幕与安全区"] : ["新品上市方案", "短视频脚本", "5 张主图 Storyboard", "视频分镜", "风险清单"], outputFormat: generationMode === "creative" ? "使用中文 Markdown，直接给可编辑使用的完整创意草稿；单列“创意假设”和“发布前待确认”，不要伪造资料来源。" : "使用中文 Markdown，并为每个事实型结论标注来源；最后列出待确认事项。", outputSchema: { executiveSummary: { type: "string" }, strategy: { type: "array" }, deliverables: { type: "array" }, evidence: { type: "array" }, risks: { type: "array" } }, constraints: generationMode === "creative" ? ["不得把创意假设标为已确认事实", "不得声称读取过不存在的资料", "人工内容不可静默覆盖"] : ["不改变已确认规格", "事实变化后必须重新复核", "人工内容不可静默覆盖"], mustInclude: confirmedValues.slice(0, 12), mustAvoid: [...brand.bannedWords, ...products.flatMap((item) => item.prohibitedClaims)], evidencePolicy: generationMode === "creative" ? "无需引用资料；允许自由创作，但所有具体商品事实默认待确认，禁止伪造来源。" : "事实型宣称必须引用当前事实快照或本次检索的资料片段；缺失就是缺失。", brandPolicy: generationMode === "creative" ? "用户未指定品牌时使用中性商业表达，不虚构现实品牌、商标或背书。" : `遵循${brand.name}的品牌语气：${brand.tone.join("、")}。`, compliancePolicy: "价格、规格、日期、资质、功效和发布动作必须人工确认。", qualityRubric: generationMode === "creative" ? ["创意完整", "场景具体", "利益点清楚", "平台适配", "可继续编辑", "假设标识清楚", "无高风险宣称"] : ["事实准确", "来源完整", "品牌一致", "利益点清楚", "平台适配", "可执行", "无高风险宣称"], variables: { objective, generationMode, retrieval: { sourceIds: retrievedSourceIds, excerptCount: sourceExcerpts.length } }, examples: [], providerHints: { temperature: "隐藏高级项，由适配器决定" }, createdBy: "user_lai", createdAt: now, updatedAt: now });
    spec.variables.activeSkills = activeSkillsForTask(taskType, generationMode);
    return { spec, snapshot, brand, products, sourceNames, sourceExcerpts };
  }

  generatePrompt(projectId: string, objective: string, generationMode: GenerationMode = "grounded"): PromptGenerationResult {
    const context = this.makeCompileContext(projectId, objective, generationMode);
    const variants = buildPromptVariants(context);
    const evaluation = evaluatePrompt(context.spec, context.snapshot);
    const missing = context.snapshot.facts.filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status));
    const creative = generationMode === "creative";
    const result = { spec: context.spec, variants, explanation: { objective, sources: context.sourceNames, confirmedFacts: creative ? [] : context.snapshot.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status)).map((fact) => `${fact.type}：${fact.value}`), missing: creative ? ["商品名称、规格、价格、功效等具体事实：发布前待确认"] : missing.map((fact) => `${fact.type}：${fact.status === "missing" ? "缺失" : fact.status}`), outputs: context.spec.deliverables, risks: creative ? ["自由创作草稿没有资料背书，不可直接作为事实发布"] : evaluation.blockers.length ? evaluation.blockers : ["发布前仍需人工复核"], advice: creative ? ["先用自由创作找方向", "定稿前上传商品资料并切换资料驱动", "高风险字段必须人工确认"] : ["先处理活动价等必须确认项", "简易版适合快速复制，专业版适合正式生产", "交接版只给获得项目权限的智能体"] }, evaluation };
    this.repo.save("prompt_specs", context.spec, { workspaceId: DEMO_WORKSPACE_ID, projectId, version: context.spec.version });
    variants.forEach((variant) => this.repo.save("prompt_versions", { ...variant, promptSpecId: context.spec.id, projectId, factSnapshotId: context.snapshot.id, updatedAt: variant.createdAt }, { workspaceId: DEMO_WORKSPACE_ID, projectId, parentId: context.spec.id, version: context.spec.version }));
    this.repo.save("evaluations", evaluation, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: evaluation.risk, parentId: context.spec.id });
    audit("prompt.generated", { promptSpecId: context.spec.id, objective }, { actorId: "user_lai", actorType: "human", projectId, repo: this.repo });
    return result;
  }

  async runPrompt(projectId: string, promptSpecId: string, artifactType: z.infer<typeof ArtifactTypeValidator> = "proposal") {
    const spec = this.repo.get<PromptSpec>("prompt_specs", promptSpecId);
    if (!spec || spec.projectId !== projectId) throw new CommerceError("PROMPT_NOT_FOUND", "没有找到这个项目的提示词", 404);
    const context = this.makeCompileContext(projectId, spec.objective, generationModeFor(spec)); context.spec = spec;
    if (artifactType === "image") return this.runImagePrompt(projectId, promptSpecId, context);
    const structured = ["storyboard", "video-storyboard", "schedule", "handoff"].includes(artifactType);
    const scriptDuration = /(?:^|\D)15\s*秒/.test(spec.objective) ? 15 : 30;
    const needsProductionScript = artifactType === "script" || artifactType === "video";
    const needsCommercePlan = artifactType === "proposal";
    const taskLabel = artifactType === "script" ? `${scriptDuration}秒短视频脚本` : this.titleForArtifact(artifactType);
    const deliverables = needsProductionScript
      ? [
          "3 个可替换的 A/B/C 前 3 秒开场，每个包含画面、口播和字幕",
          `一份从 0 秒覆盖到 ${scriptDuration} 秒、至少 5 段的逐镜头脚本`,
          "每段完整写出画面/景别、人物动作、口播/台词、字幕/屏幕文字和商品展示/事实边界",
          "拍摄与素材清单",
          "创意假设与发布前待确认清单"
        ]
      : [taskLabel];
    const modelSpec = PromptSpecSchema.parse({
      ...spec,
      objective: `${spec.objective}\n\n本次只生成：${taskLabel}。不要输出其他交付物。`,
      deliverables,
      outputFormat: needsProductionScript
        ? videoScriptOutputFormat(scriptDuration)
        : needsCommercePlan
          ? commercePlanOutputFormat()
        : structured
          ? "只返回严格 JSON，不要 Markdown 代码围栏；数组中每一项必须字段完整，可直接导出为表格。"
          : "使用中文 Markdown，直接给可使用的完整成果，并标注事实来源与待确认项。"
    });
    context.spec = modelSpec;
    const prompt = compilePrompt(context, "markdown");
    const started = Date.now();
    const textProvider = providerRegistry.text;
    let generated = await textProvider.generate(modelSpec, prompt);
    let totalTokenUsage = generated.tokenUsage;
    let textDraft = generated.model === "mock-text-v1" && needsProductionScript
      ? this.mockScript(context)
      : generated.model === "mock-text-v1" && (artifactType === "storyboard" || artifactType === "video-storyboard")
        ? JSON.stringify(this.mockStoryboard(context, artifactType === "video-storyboard"), null, 2)
        : structured
          ? this.requireUsableJson(generated.text, taskLabel)
          : generated.text.trim();
    let generationAttempts = 1;
    let structuredPresentation = false;
    let generationNotes: string[] = [];
    if (generated.model !== "mock-text-v1" && (needsProductionScript || needsCommercePlan)) {
      const first = needsProductionScript
        ? normalizeCommerceScriptModelOutput(generated.text, scriptDuration)
        : normalizeCommercePlanModelOutput(generated.text);
      textDraft = first.markdown;
      structuredPresentation = first.structured;
      generationNotes = first.structureIssues;
      if (!first.structured) {
        const correctionPrompt = `${prompt}\n\n## 结构化整理\n上一版内容已经生成，但字段格式没有完全对齐。请保留其中有价值的判断和创意，按本任务的 JSON 字段重新整理。不要评价上一版，不要输出说明或 Markdown 代码围栏。\n\n<previous_draft>\n${generated.text.slice(0, 10_000)}\n</previous_draft>`;
        const retried = await textProvider.generate(modelSpec, correctionPrompt);
        generated = retried;
        totalTokenUsage += retried.tokenUsage;
        generationAttempts = 2;
        const second = needsProductionScript
          ? normalizeCommerceScriptModelOutput(retried.text, scriptDuration)
          : normalizeCommercePlanModelOutput(retried.text);
        if (second.structured || second.markdown.length >= first.markdown.length) textDraft = second.markdown;
        structuredPresentation = second.structured;
        generationNotes = second.structureIssues;
      }
    }
    const content = artifactType === "video"
      ? this.buildVideoContent(context, textDraft, latestGeneratedImageUri(this.getProject(projectId)))
      : textDraft;
    const artifact = this.createArtifact(projectId, artifactType, taskLabel, content, context.snapshot.id, promptSpecId, { type: "platform-ai", id: generated.model });
    const run = { id: newId("run"), promptVersionId: promptSpecId, provider: textProvider.name, model: generated.model, inputSnapshot: context.snapshot.id, factSnapshotId: context.snapshot.id, output: content, latency: Date.now() - started, tokenUsage: totalTokenUsage, estimatedCost: 0, generationMethod: { type: needsProductionScript || needsCommercePlan ? "structured-generation" : "direct-generation", attempts: generationAttempts, structuredPresentation, notes: generationNotes }, errors: [], createdAt: nowIso(), updatedAt: nowIso() };
    this.repo.save("prompt_runs", run, { workspaceId: DEMO_WORKSPACE_ID, projectId, parentId: promptSpecId });
    return { artifact, run };
  }

  requireUsableJson(text: string, label: string) {
    const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = withoutFence.indexOf(withoutFence.includes("[") && (!withoutFence.includes("{") || withoutFence.indexOf("[") < withoutFence.indexOf("{")) ? "[" : "{");
    const end = Math.max(withoutFence.lastIndexOf("]"), withoutFence.lastIndexOf("}"));
    const candidate = start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
    try {
      const parsed = JSON.parse(candidate);
      if ((Array.isArray(parsed) && parsed.length > 0) || (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0)) return JSON.stringify(parsed, null, 2);
    } catch { /* reported below */ }
    throw new CommerceError("MODEL_OUTPUT_INVALID", `${label}没有返回可下载的结构化 JSON，请重新生成。系统没有用固定模板替代真实结果。`, 502);
  }

  buildVideoContent(context: CompileContext, generatedScript: string, imageUri?: string) {
    const product = context.products[0]!;
    const creative = generationModeFor(context.spec) === "creative";
    const confirmed = (names: string[]) => confirmedFactValue(context, names);
    const specification = creative ? undefined : confirmed(["规格", "净含量"]) || product.specification;
    const productName = creative ? "商品创意概念" : confirmed(["商品名称", "产品名称"]) || product.name;
    const price = creative ? undefined : confirmed(["活动价", "售价", "价格"]);
    const isFifteenSeconds = !/30\s*秒/.test(context.spec.objective);
    const duration = isFifteenSeconds ? 15 : 30;
    const headline = firstMeaningfulLine(generatedScript, context.spec.objective).slice(0, 28);
    const subheadline = creative ? "自由创作草稿 · 商品事实待确认" : specification && !/待|请先/.test(specification) ? `${productName} · ${specification}` : `${productName} · 具体信息以项目确认事实为准`;
    const cta = creative ? "查看创意方案" : context.brand.ctas[0] || "查看商品详情";
    const captions = isFifteenSeconds ? [
      { start: 0, end: 4.5, text: headline },
      { start: 4.5, end: 10, text: subheadline },
      { start: 10, end: 15, text: cta }
    ] : [
      { start: 0, end: 8, text: headline },
      { start: 8, end: 20, text: subheadline },
      { start: 20, end: 30, text: cta }
    ];
    return JSON.stringify({
      schema: "laicommerce.video-render/v1",
      template: isFifteenSeconds ? "SellingPoint15" : "Promo30",
      props: {
        brandName: creative ? "AI 自由创作" : context.brand.name,
        product: productName,
        specification,
        ...(price ? { price: `活动价：${price}` } : {}),
        cta,
        headline,
        subheadline,
        brandColor: /^#[0-9a-f]{6}$/i.test(context.brand.colors[0] || "") ? context.brand.colors[0] : "#242064",
        accentColor: /^#[0-9a-f]{6}$/i.test(context.brand.colors[1] || "") ? context.brand.colors[1] : "#a9f0d2",
        factSnapshotId: context.snapshot.id,
        ...(imageUri ? { imageUri } : {})
      },
      captions,
      sourceScript: generatedScript,
      sourceDocumentIds: context.spec.sourceDocumentIds,
      factSnapshotId: context.snapshot.id,
      durationSeconds: duration,
      outputs: ["mp4", "png", "srt", "zip", "json"]
    }, null, 2);
  }

  async runImagePrompt(projectId: string, promptSpecId: string, context: CompileContext) {
    const started = Date.now();
    const creative = generationModeFor(context.spec) === "creative";
    const imageSource = creative ? undefined : this.getProject(projectId).sources.find((source) => source.status === "parsed" && ["image/jpeg", "image/png"].includes(source.mimeType) && !source.storagePath.includes("://"));
    const referenceImages: Array<{ dataUri: string }> = [];
    const canUseReferenceImage = providerRegistry.image.name === "pollinations-image" && Boolean(process.env.POLLINATIONS_API_KEY?.trim());
    if (imageSource && canUseReferenceImage) {
      try {
        const bytes = await fs.readFile(imageSource.storagePath);
        if (bytes.byteLength <= 10 * 1024 * 1024) referenceImages.push({ dataUri: `data:${imageSource.mimeType};base64,${bytes.toString("base64")}` });
      } catch {
        // The source record remains valid even if an ephemeral cloud upload disappeared; generation can continue without a visual reference.
      }
    }
    const production = buildGroundedImagePrompt(context, referenceImages.length > 0);
    const needsTextFreeBase = creative || referenceImages.length === 0;
    const maxAttempts = needsTextFreeBase ? 2 : 1;
    let generated: Awaited<ReturnType<typeof providerRegistry.image.generate>> | undefined;
    let typographyQa: ImageTypographyQa | undefined;
    let selectedGenerated: Awaited<ReturnType<typeof providerRegistry.image.generate>> | undefined;
    let selectedTypographyQa: ImageTypographyQa | undefined;
    let selectedCharacterCount = Number.POSITIVE_INFINITY;
    let ocrWarning: string | undefined;
    let attempts = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt;
      const correction = attempt > 1
        ? "\n\nCORRECTION REQUIRED: the previous candidate contained visible typography. Regenerate the photograph from scratch with completely blank package surfaces and zero text-like marks."
        : "";
      try {
        generated = await providerRegistry.image.generate({ prompt: `${production.prompt}${correction}`, width: 1024, height: 1024, referenceImages });
      } catch (error) {
        throw new CommerceError("IMAGE_GENERATION_FAILED", error instanceof Error ? error.message : "图片没有生成成功，请稍后重试。", 503);
      }
      const generationMetadata = generated.metadata as Record<string, unknown>;
      if (!needsTextFreeBase || generationMetadata.externalGeneration !== true) { selectedGenerated = generated; break; }
      try {
        typographyQa = await inspectTextFreeImage(generated.assetUri);
      } catch (error) {
        ocrWarning = error instanceof Error ? `底图文字检查未完成：${error.message}` : "底图文字检查未完成，建议人工查看。";
        selectedGenerated = generated;
        break;
      }
      const detectedCharacters = typographyQa.cjkCharacters + typographyQa.alphaNumericCharacters;
      if (detectedCharacters < selectedCharacterCount) {
        selectedGenerated = generated;
        selectedTypographyQa = typographyQa;
        selectedCharacterCount = detectedCharacters;
      }
      if (typographyQa.passed) break;
    }
    generated = selectedGenerated ?? generated;
    typographyQa = selectedTypographyQa ?? typographyQa;
    if (!generated) throw new CommerceError("IMAGE_GENERATION_EMPTY", "图片模型没有返回可处理的图片文件，请稍后重试。", 503);
    const composed = await composeUsableProductImage(generated.assetUri, context).catch((error) => {
      throw new CommerceError("IMAGE_COMPOSITION_FAILED", error instanceof Error ? error.message : "商品图中文信息层合成失败，请稍后重试。", 503);
    });
    const generationMetadata = generated.metadata as Record<string, unknown>;
    const model = typeof generationMetadata.model === "string" ? generationMetadata.model : providerRegistry.image.name;
    const content = JSON.stringify({
      assetUri: composed.assetUri,
      rawAssetUri: generated.assetUri,
      metadata: {
        ...generated.metadata,
        imagePipelineVersion: IMAGE_PIPELINE_VERSION,
        usableCommercialDraft: true,
        deterministicOverlay: true,
        overlayFont: composed.overlayFont,
        outputMimeType: "image/png",
        overlayFields: composed.overlayFields,
        typographyQa: {
          status: typographyQa?.passed === false ? "visible-text-detected" : typographyQa ? "passed" : "not-checked",
          engine: typographyQa ? "tesseract-chi-sim-local" : "none",
          attempts,
          confidence: typographyQa?.confidence,
          detectedCharacters: (typographyQa?.cjkCharacters || 0) + (typographyQa?.alphaNumericCharacters || 0),
          blocking: false
        }
      },
      production: {
        prompt: production.prompt,
        userObjective: context.spec.objective,
        sourceDocumentIds: context.spec.sourceDocumentIds,
        sourceNames: context.sourceNames,
        confirmedFacts: production.confirmedFacts,
        factSnapshotId: context.snapshot.id,
        referenceSourceId: referenceImages.length ? imageSource?.id : undefined,
        warnings: [...(ocrWarning ? [ocrWarning] : []), ...(typographyQa?.passed === false ? ["底图检测到模型自带文字或类文字痕迹，已选择两次候选中干扰较少的一张；请人工查看后决定是否重新生成。"] : []), ...(creative
          ? ["本次使用自由创作模式，没有把生成外观当作真实商品包装；具体品牌、规格、价格、功效和包装细节均待确认。", "中文信息由程序使用内置 Noto 字体排版；图片可用于方向测试，定稿前请上传真实商品图并切换资料驱动模式。"]
          : referenceImages.length
            ? ["已使用本项目上传的商品照片作为视觉参考；生成结果仍需人工对照包装。", "价格、规格、活动时间与 CTA 已由程序从确认事实中排版，不依赖图片模型拼写中文。"]
            : ["没有找到可用的商品照片，本次是通用包装创意草稿，商品外观可能与实物不一致。", "价格、规格、活动时间与 CTA 已由程序从确认事实中排版，不依赖图片模型拼写中文。"])]
      }
    });
    const artifact = this.createArtifact(projectId, "image", "AI 商品主图", content, context.snapshot.id, promptSpecId, { type: "platform-ai", id: providerRegistry.image.name });
    const run = {
      id: newId("run"), promptVersionId: promptSpecId, provider: providerRegistry.image.name, model,
      inputSnapshot: context.snapshot.id, factSnapshotId: context.snapshot.id,
      output: `已生成 1 张 1024×1024 图片，成果：${artifact.id}`, latency: Date.now() - started,
      tokenUsage: 0, estimatedCost: 0,
      generationMethod: { type: "image-generation-with-advisory-ocr", attempts, ocrStatus: typographyQa?.passed === false ? "visible-text-detected" : typographyQa ? "passed" : "not-checked" },
      errors: [], createdAt: nowIso(), updatedAt: nowIso()
    };
    this.repo.save("prompt_runs", run, { workspaceId: DEMO_WORKSPACE_ID, projectId, parentId: promptSpecId });
    return { artifact, run };
  }

  titleForArtifact(type: z.infer<typeof ArtifactTypeValidator>) { return ({ proposal: "新品上市方案", script: "30秒短视频脚本", storyboard: "五张主图 Storyboard", "image-prompt": "图片生成提示词", image: "AI 商品主图", "video-storyboard": "30秒视频分镜", video: "可下载 MP4 商品视频", caption: "平台文案", schedule: "内容排期", report: "质量报告", prompt: "专业提示词", handoff: "智能体交接包" } as Record<string, string>)[type] || type; }

  mockScript(context: CompileContext) {
    const product = context.products[0]!;
    return `# 30 秒短视频脚本｜${product.name}\n\n## 创意主线\n用“忙碌早晨也要先看清商品信息”的生活冲突推进，不承诺未经证实的效果。\n\n## A/B/C 前 3 秒开场\n\n### A 版：时间冲突\n- 画面：闹钟、通勤包和商品快速切换。\n- 口播：早上又来不及？先别空着手出门。\n- 字幕：忙归忙，先看清楚。\n\n### B 版：配料好奇\n- 画面：包装背标微距推进。\n- 口播：买早餐之前，我会先翻到背面看这一行。\n- 字幕：先看配料，再做决定。\n\n### C 版：办公桌场景\n- 画面：电脑旁腾出一小块位置放下商品。\n- 口播：桌面很挤，但早餐不该只剩一句“算了”。\n- 字幕：给早晨一个具体选择。\n\n## 30 秒逐镜头脚本\n\n| 时间 | 画面/景别 | 人物动作 | 口播/台词 | 字幕/屏幕文字 | 商品展示/事实边界 |\n|---|---|---|---|---|---|\n| 0–3s | 通勤包里露出独立杯，近景 | 拿出产品 | 早上又来不及？先别空着手出门。 | 一杯带走 | 创意场景，不代表功效 |\n| 3–10s | 包装原样特写 | 镜头沿背标移动 | 这杯先把配料写清楚：燕麦片、冻干草莓粒和乳粉。 | 配料看得懂 | ${context.sourceNames[0] || "事实卡"} |\n| 10–18s | 冲泡与搅拌，俯拍 | 加水、搅拌 | ${product.specification}，独立杯装，办公桌上也好处理。 | ${product.specification} | 规格事实卡 |\n| 18–25s | 早餐、午后、加班三个生活场景切换 | 放到桌面并拿起杯子 | 不替你承诺神奇效果，只给忙碌的一天多一个具体选择。 | 不夸大，只讲清楚 | 合规表达 |\n| 25–30s | 商品卡与 CTA，中近景 | 指向商品卡 | 活动价确认后再上屏。先看清配料，再决定要不要带走。 | 活动价：待确认 | 未确认价格不得发布 |\n\n## 拍摄与素材清单\n- 场景：通勤玄关、办公桌；道具：闹钟、电脑、透明杯。\n- 景别：开场快切，中段包装微距与俯拍，结尾中近景；转场跟随人物拿放动作。\n- 声音：前 3 秒保留闹钟提示音，口播清楚，不使用夸张音效。\n\n## 创意假设与发布前待确认\n- 开场场景与人物状态属于创意假设。\n- 商品名称、规格、配料、活动价、活动时间和功效表述必须依据资料逐项确认；未确认字段继续显示“待确认”。\n`;
  }

  mockStoryboard(context: CompileContext, video = false) {
    const product = context.products[0]!;
    if (video) return [
      { time: "0–3s", shot: "通勤包开合特写", action: "取出独立杯", voice: "早上又来不及？", overlay: "一杯带走", evidence: "创意" },
      { time: "3–10s", shot: "包装背标微距", action: "镜头横移", voice: "先把配料看清楚", overlay: "主要配料见事实卡", evidence: context.snapshot.id },
      { time: "10–20s", shot: "冲泡俯拍", action: "加水搅拌", voice: `规格是${product.specification}`, overlay: product.specification, evidence: context.snapshot.id },
      { time: "20–30s", shot: "桌面商品卡", action: "Logo 与 CTA 程序化入场", voice: "先看清，再决定", overlay: "活动价待确认", evidence: "必须人工审核" }
    ];
    return [
      { index: 1, role: "识别", headline: "忙碌早晨，一杯带走", composition: "通勤包与真实商品并置", overlay: "品牌主题与 CTA" },
      { index: 2, role: "理解", headline: "配料，先写清楚", composition: "包装背标与配料俯拍", overlay: "配料文字由程序渲染" },
      { index: 3, role: "规格", headline: product.specification, composition: "独立杯阵列", overlay: "规格来自事实快照" },
      { index: 4, role: "场景", headline: "早餐 / 午后 / 加班", composition: "三格生活场景", overlay: "不使用功效暗示" },
      { index: 5, role: "转化", headline: "先看清，再决定", composition: "商品卡与活动区", overlay: "活动价、日期发布前确认" }
    ];
  }

  createArtifact(projectId: string, type: z.infer<typeof ArtifactTypeValidator>, title: string, content: string, factSnapshotId: string, promptVersionId?: string, creator: { type: "platform-ai" | "external-agent"; id: string } = { type: "platform-ai", id: "mock-text-v1" }) {
    const now = nowIso();
    const artifact: Artifact = { id: newId("art"), workspaceId: DEMO_WORKSPACE_ID, projectId, type, title, status: "draft", currentVersion: 1, factSnapshotId, createdByType: creator.type, createdById: creator.id, humanModified: false, createdAt: now, updatedAt: now };
    const version: ArtifactVersion = { id: newId("artv"), artifactId: artifact.id, version: 1, content, promptVersionId, factSnapshotId, changeSummary: "初始生成", createdBy: creator.id, createdAt: now };
    this.repo.saveArtifact(artifact); this.repo.saveArtifactVersion(version, DEMO_WORKSPACE_ID, projectId);
    audit("artifact.created", { artifactId: artifact.id, type }, { actorId: creator.id, actorType: creator.type === "external-agent" ? "agent" : "platform", projectId, repo: this.repo });
    return { ...artifact, version };
  }

  updateArtifact(projectId: string, artifactId: string, content: string, actor: { id: string; type: "human" | "external-agent" } = { id: "user_lai", type: "human" }) {
    const artifact = this.repo.get<Artifact>("artifacts", artifactId);
    if (!artifact || artifact.projectId !== projectId) throw new CommerceError("ARTIFACT_NOT_FOUND", "没有找到这个成果", 404);
    const next = artifact.currentVersion + 1;
    const version: ArtifactVersion = { id: newId("artv"), artifactId, version: next, content, factSnapshotId: artifact.factSnapshotId, changeSummary: actor.type === "human" ? "人工编辑" : "智能体回写草稿", createdBy: actor.id, createdAt: nowIso() };
    this.repo.saveArtifactVersion(version, DEMO_WORKSPACE_ID, projectId);
    this.repo.saveArtifact({ ...artifact, currentVersion: next, status: "draft", humanModified: artifact.humanModified || actor.type === "human", updatedAt: nowIso() });
    audit("artifact.version.created", { artifactId, version: next }, { actorId: actor.id, actorType: actor.type === "human" ? "human" : "agent", projectId, repo: this.repo });
    return version;
  }

  restoreArtifactVersion(projectId: string, artifactId: string, versionId: string) {
    const version = this.repo.get<ArtifactVersion>("artifact_versions", versionId);
    if (!version || version.artifactId !== artifactId) throw new CommerceError("VERSION_NOT_FOUND", "没有找到这个历史版本", 404);
    return this.updateArtifact(projectId, artifactId, version.content);
  }

  savePromptTemplate(projectId: string, promptSpecId: string, name?: string) {
    const spec = this.repo.get<PromptSpec>("prompt_specs", promptSpecId);
    if (!spec || spec.projectId !== projectId) throw new CommerceError("PROMPT_NOT_FOUND", "没有找到这个项目的提示词", 404);
    const now = nowIso();
    const template = { id: newId("tpl"), workspaceId: DEMO_WORKSPACE_ID, projectId, name: name || spec.name, type: "prompt", promptSpecId, factSnapshotId: spec.factSnapshotId, content: spec, status: "active", createdAt: now, updatedAt: now };
    this.repo.save("templates", template, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: "active", parentId: promptSpecId });
    audit("prompt.template.saved", { templateId: template.id, promptSpecId }, { actorId: "user_lai", actorType: "human", projectId, repo: this.repo });
    return template;
  }

  async createCampaignBundle(projectId: string, objective = "一键生成整套新品上市活动", generationMode: GenerationMode = "grounded"): Promise<CampaignBundleResult> {
    const context = this.makeCompileContext(projectId, objective, generationMode);
    const job: GenerationJob = { id: newId("job"), workspaceId: DEMO_WORKSPACE_ID, projectId, type: "campaign-bundle", status: "running", progress: 15, stage: "建立事实快照与任务简报", resultArtifactIds: [], createdAt: nowIso(), updatedAt: nowIso() };
    this.repo.saveJob(job);
    try {
      const prompt = this.generatePrompt(projectId, objective, generationMode);
      prompt.spec.variables.activeSkills = ["intent-to-brief", ...(generationMode === "grounded" ? ["evidence-grounding"] : []), "campaign-orchestrator", "image-prompt-and-production", "video-storyboard-director", "video-renderer", "platform-adapter", "artifact-qa-and-compliance"];
      this.repo.save("prompt_specs", prompt.spec, { workspaceId: DEMO_WORKSPACE_ID, projectId, version: prompt.spec.version });
      context.spec = prompt.spec;
      const textProvider = providerRegistry.text;
      job.progress = 28; job.stage = "真实模型生成整套文字与结构化内容"; job.updatedAt = nowIso(); this.repo.saveJob(job);
      const bundleFactRule = generationMode === "creative"
        ? "本次是自由创作模式：允许提出完整创意，但不得声称读取过资料；所有具体商品事实、数据、资质和功效默认写‘待确认’，并在报告中列出创意假设。"
        : "所有事实只能使用事实快照；缺失字段写‘待确认’，不要编造。";
      const bundleInstruction = `${compilePrompt(context)}\n\n你现在要一次完成整套电商内容生产。只返回一个严格 JSON 对象，不要 Markdown 代码围栏，不要省略字段。字段必须是：\n- proposal: 至少 650 个有效字符的完整可执行方案 Markdown，包含目标与 KPI、人群与平台判断、至少 3 条内容主线、第 1 天到第 7 天逐日动作、负责人/资源、复盘与止损、事实依据和待确认项\n- script: 15秒短视频完整脚本 Markdown，必须含 A/B/C 三个前 3 秒开场，以及至少 5 段从 0 秒覆盖到 15 秒的时间轴；每段含画面、动作、口播、屏幕文字、商品展示/证据，另列拍摄清单和待确认项\n- storyboard: 5项数组，每项含 index、role、headline、composition、overlay、evidence\n- imagePrompt: 可直接交给图片模型的完整中文/英文提示词 Markdown\n- videoStoryboard: 4到8项数组，每项含 start、end、shot、action、voice、overlay、evidence\n- caption: 目标平台可直接编辑使用的正文 Markdown\n- schedule: 7到14项数组，每项含 day、channel、content、metric、stopRule\n- report: 质量与合规报告 Markdown，逐项列证据、缺失和人工确认点\n${bundleFactRule}`;
      const bundleModelSpec = PromptSpecSchema.parse({ ...prompt.spec, outputFormat: "只返回严格 JSON 对象；字段用于拆分真实成果，不要 Markdown 代码围栏。" });
      let generated = await textProvider.generate(bundleModelSpec, bundleInstruction);
      let campaign: { proposal: string; script: string; storyboard: unknown[]; imagePrompt: string; videoStoryboard: unknown[]; caption: string; schedule: unknown[]; report: string };
      if (generated.model === "mock-text-v1") {
        campaign = {
          proposal: generated.text,
          script: this.mockScript(context),
          storyboard: this.mockStoryboard(context) as unknown[],
          imagePrompt: `商品摄影构图预览：${context.spec.objective}`,
          videoStoryboard: this.mockStoryboard(context, true) as unknown[],
          caption: generated.text,
          schedule: [{ day: 1, channel: context.spec.targetPlatforms[0] || "待确认", content: "演示流程", metric: "待确认", stopRule: "待确认" }],
          report: `事实快照：${context.snapshot.id}\n本地 Mock 仅用于开发测试，不得部署为真实产出。`
        };
      } else {
        const schema = z.object({
          proposal: z.string().trim().min(1), script: z.string().trim().min(1), storyboard: z.array(z.record(z.string(), z.unknown())).min(1),
          imagePrompt: z.string().trim().min(1), videoStoryboard: z.array(z.record(z.string(), z.unknown())).min(1), caption: z.string().trim().min(1),
          schedule: z.array(z.record(z.string(), z.unknown())).min(1), report: z.string().trim().min(1)
        });
        const parseCampaign = (text: string) => schema.safeParse(JSON.parse(this.requireUsableJson(text, "整套活动")));
        let checked = parseCampaign(generated.text);
        if (!checked.success && generated.model !== "mock-text-v1") {
          generated = await textProvider.generate(bundleModelSpec, `${bundleInstruction}\n\n上一版无法按字段拆分。请保留有用内容，只修正为上述完整 JSON 对象；不要解释。\n\n<previous_draft>\n${generated.text.slice(0, 12_000)}\n</previous_draft>`);
          checked = parseCampaign(generated.text);
        }
        if (!checked.success) throw new CommerceError("CAMPAIGN_OUTPUT_UNREADABLE", "真实模型返回的整套内容无法拆分为独立成果，请再次生成。这里检查的是必要文件结构，不评价内容好坏。", 502, checked.error.flatten());
        campaign = checked.data;
      }

      job.progress = 62; job.stage = "真实图片模型生成商品图并叠加确认信息"; job.updatedAt = nowIso(); this.repo.saveJob(job);
      let imageArtifact: ReturnType<CommerceService["createArtifact"]>;
      if (generated.model === "mock-text-v1") {
        const visual = await providerRegistry.image.generate({ prompt: campaign.imagePrompt, width: 1024, height: 1024 });
        imageArtifact = this.createArtifact(projectId, "image", "本地构图预览", JSON.stringify({ assetUri: visual.assetUri, metadata: visual.metadata, factSnapshotId: context.snapshot.id }), context.snapshot.id, prompt.spec.id, { type: "platform-ai", id: providerRegistry.image.name });
      } else {
        imageArtifact = (await this.runImagePrompt(projectId, prompt.spec.id, context)).artifact;
      }
      let imageUri: string | undefined;
      try { imageUri = JSON.parse(imageArtifact.version.content).assetUri as string | undefined; } catch { imageUri = undefined; }

      job.progress = 78; job.stage = "建立真实 MP4 渲染配置与可下载成果"; job.updatedAt = nowIso(); this.repo.saveJob(job);
      const items: Array<{ type: z.infer<typeof ArtifactTypeValidator>; content: string }> = [
        { type: "proposal", content: campaign.proposal },
        { type: "script", content: campaign.script },
        { type: "storyboard", content: JSON.stringify(campaign.storyboard, null, 2) },
        { type: "image-prompt", content: campaign.imagePrompt },
        { type: "video-storyboard", content: JSON.stringify(campaign.videoStoryboard, null, 2) },
        { type: "video", content: this.buildVideoContent(context, campaign.script, imageUri) },
        { type: "caption", content: campaign.caption },
        { type: "schedule", content: JSON.stringify(campaign.schedule, null, 2) },
        { type: "report", content: campaign.report }
      ];
      const artifacts = items.map((item) => this.createArtifact(projectId, item.type, this.titleForArtifact(item.type), item.content, context.snapshot.id, prompt.spec.id, { type: "platform-ai", id: item.type === "video" ? `remotion-real-mp4-v1+${generated.model}` : generated.model }));
      artifacts.push(imageArtifact);
      job.status = prompt.evaluation.blockers.length ? "needs-review" : "succeeded"; job.progress = 100; job.stage = prompt.evaluation.blockers.length ? "成果已生成，等待人工确认高风险字段" : "真实成果已全部生成"; job.resultArtifactIds = artifacts.map((item) => item.id); job.updatedAt = nowIso(); this.repo.saveJob(job);
      const bundle = { id: newId("bundle"), projectId, factSnapshotId: context.snapshot.id, jobId: job.id, artifactIds: job.resultArtifactIds, provider: textProvider.name, model: generated.model, createdAt: nowIso(), updatedAt: nowIso() };
      this.repo.save("campaign_bundles", bundle, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: job.status });
      return bundle;
    } catch (error) {
      job.status = "failed"; job.progress = 100; job.stage = "真实产出失败，未使用 Mock 替代"; job.error = error instanceof Error ? error.message : "未知生成错误"; job.updatedAt = nowIso(); this.repo.saveJob(job);
      throw error;
    }
  }

  requestReview(projectId: string, artifactId: string, requestedBy = "user_lai") {
    const artifact = this.repo.get<Artifact>("artifacts", artifactId);
    if (!artifact || artifact.projectId !== projectId) throw new CommerceError("ARTIFACT_NOT_FOUND", "没有找到这个成果", 404);
    const now = nowIso();
    const review = { id: newId("review"), workspaceId: DEMO_WORKSPACE_ID, projectId, artifactId, status: "pending", requestedBy, riskFields: ["价格", "规格", "活动时间", "资质", "功效", "对外发布"], createdAt: now, updatedAt: now };
    this.repo.save("review_requests", review, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: "pending", parentId: artifactId });
    this.repo.saveArtifact({ ...artifact, status: "needs-review", updatedAt: now });
    audit("review.requested", { reviewId: review.id, artifactId }, { actorId: requestedBy, actorType: requestedBy.startsWith("agent") ? "agent" : "human", projectId, repo: this.repo });
    return review;
  }

  decideReview(reviewId: string, decision: "approved" | "rejected", note: string) {
    const review = this.repo.get<any>("review_requests", reviewId);
    if (!review) throw new CommerceError("REVIEW_NOT_FOUND", "没有找到这个审核任务", 404);
    const updated = { ...review, status: decision, note, decidedBy: "user_lai", decidedAt: nowIso(), updatedAt: nowIso() };
    this.repo.save("review_requests", updated, { workspaceId: DEMO_WORKSPACE_ID, projectId: review.projectId, status: decision, parentId: review.artifactId });
    const artifact = this.repo.get<Artifact>("artifacts", review.artifactId);
    if (artifact) this.repo.saveArtifact({ ...artifact, status: decision, updatedAt: nowIso() });
    audit("review.decided", { reviewId, decision }, { actorId: "user_lai", actorType: "human", projectId: review.projectId, repo: this.repo });
    return updated;
  }

  createAgentConnection(input: { name: string; projectIds?: string[]; scopes?: Scope[]; expiresAt?: string }) {
    const projectIds = input.projectIds?.length ? input.projectIds : this.listProjects().slice(0, 1).map((project) => project.id);
    if (!input.name?.trim()) throw new CommerceError("INVALID_AGENT_NAME", "请填写智能体名称", 400);
    if (!projectIds.length || projectIds.some((projectId) => !this.repo.get<Project>("projects", projectId))) throw new CommerceError("INVALID_AGENT_PROJECT", "请选择一个真实存在的项目", 400);
    const token = createAgentToken(); const now = nowIso(); const account = { id: newId("agent"), workspaceId: DEMO_WORKSPACE_ID, name: input.name.trim(), scopes: input.scopes ?? defaultAgentPrincipal("temp").scopes, projectIds, tokenLast4: token.slice(-4), status: "active", expiresAt: input.expiresAt, createdAt: now, updatedAt: now };
    this.repo.save("agent_service_accounts", account, { workspaceId: DEMO_WORKSPACE_ID, status: "active", tokenHash: hashToken(token), expiresAt: input.expiresAt });
    const publiclyAvailableProtocols = ["REST", process.env.MCP_PUBLIC_URL && "MCP", process.env.A2A_PUBLIC_URL && "A2A"].filter(Boolean).join(" / ");
    const connection = { id: newId("conn"), workspaceId: DEMO_WORKSPACE_ID, agentServiceAccountId: account.id, name: account.name, protocol: publiclyAvailableProtocols, status: "active", createdAt: now, updatedAt: now };
    this.repo.save("agent_connections", connection, { workspaceId: DEMO_WORKSPACE_ID, status: "active", parentId: account.id });
    audit("agent.connection.created", { agentId: account.id, scopes: account.scopes, projectIds: account.projectIds }, { actorId: "user_lai", actorType: "human", repo: this.repo });
    return { account, connection, token };
  }

  authenticate(token: string): AgentPrincipal {
    const account = this.repo.getByTokenHash<any>(hashToken(token));
    if (!account) throw new CommerceError("UNAUTHORIZED", "智能体凭证无效、已过期或已撤销", 401);
    return { id: account.id, workspaceId: account.workspaceId, scopes: account.scopes, projectIds: account.projectIds, expiresAt: account.expiresAt, revokedAt: account.revokedAt, ipAllowlist: account.ipAllowlist };
  }

  assert(principal: AgentPrincipal, scope: Scope, projectId?: string, ip?: string) {
    const result = authorize(principal, scope, { workspaceId: DEMO_WORKSPACE_ID, projectId, ip });
    if (!result.allowed) throw new CommerceError(result.code, result.reason, 403);
  }

  revokeAgent(agentId: string) {
    const account = this.repo.get<any>("agent_service_accounts", agentId);
    const revoked = this.repo.revokeToken(agentId);
    if (account) this.repo.save("agent_service_accounts", { ...account, status: "revoked", revokedAt: nowIso(), updatedAt: nowIso() }, { workspaceId: DEMO_WORKSPACE_ID, status: "revoked", revokedAt: nowIso() });
    this.repo.list<any>("agent_connections").filter((connection) => connection.agentServiceAccountId === agentId).forEach((connection) => this.repo.save("agent_connections", { ...connection, status: "revoked", updatedAt: nowIso() }, { workspaceId: DEMO_WORKSPACE_ID, status: "revoked", parentId: agentId }));
    audit("agent.token.revoked", { agentId }, { actorId: "user_lai", actorType: "human", repo: this.repo });
    return revoked;
  }

  buildHandoff(projectId: string, promptSpecId: string, objective: string, scopes: Scope[] = ["project:read", "source:read", "fact:read", "artifact:write"]) {
    const project = this.getProject(projectId).project;
    const spec = this.repo.get<PromptSpec>("prompt_specs", promptSpecId);
    if (!spec) throw new CommerceError("PROMPT_NOT_FOUND", "请先生成提示词", 404);
    const handoff: AgentHandoff = AgentHandoffSchema.parse({ handoffId: newId("handoff"), taskId: newId("task"), objective, projectId, projectContextUri: `laicommerce://projects/${projectId}`, sourceUris: this.repo.listSources(projectId).map((source) => `laicommerce://projects/${projectId}/sources/${source.id}`), factSnapshotId: project.currentFactSnapshotId, promptSpecId, constraints: ["只能回写草稿", "不得确认事实", "不得批准或发布", "不得覆盖人工内容"], expectedOutputSchema: spec.outputSchema, allowedTools: ["project.get", "fact.list", "artifact.create", "review.request_human_approval"], permissionScope: scopes, approvalPolicy: "always-human", createdBy: "user_lai", createdAt: nowIso(), expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() });
    this.repo.save("agent_handoffs", { id: handoff.handoffId, ...handoff, updatedAt: handoff.createdAt }, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: "active" });
    return handoff;
  }

  getResource(uri: string, principal?: AgentPrincipal) {
    const projectMatch = uri.match(/^laicommerce:\/\/projects\/([^/]+)(?:\/(facts|sources|artifacts|prompt-specs|brief))?$/);
    if (projectMatch) {
      const projectId = projectMatch[1]!; if (principal) this.assert(principal, "project:read", projectId);
      const data = this.getProject(projectId); const part = projectMatch[2];
      if (part === "facts") return data.facts; if (part === "sources") return data.sources; if (part === "artifacts") return data.artifacts; if (part === "prompt-specs") return this.repo.list<PromptSpec>("prompt_specs", { projectId }); if (part === "brief") return { objective: data.project.objective, businessGoal: data.project.businessGoal, targetPlatforms: data.project.targetPlatforms, targetAudience: data.project.targetAudience };
      return data;
    }
    if (uri === "laicommerce://skills") return SKILL_CATALOG;
    if (uri === "laicommerce://templates") return this.repo.list("templates");
    if (uri === `laicommerce://workspaces/${DEMO_WORKSPACE_ID}/summary`) return this.dashboard();
    const brand = uri.match(/^laicommerce:\/\/brands\/([^/]+)$/); if (brand) return this.repo.get("brands", brand[1]!);
    const product = uri.match(/^laicommerce:\/\/products\/([^/]+)$/); if (product) return this.repo.get("products", product[1]!);
    const job = uri.match(/^laicommerce:\/\/jobs\/([^/]+)$/); if (job) return this.repo.get("generation_jobs", job[1]!);
    throw new CommerceError("RESOURCE_NOT_FOUND", "没有找到这个资源", 404);
  }

  async runTool(name: string, args: Record<string, any>, principal: AgentPrincipal) {
    const projectId = String(args.projectId || DEMO_PROJECT_ID);
    const requireScope = (scope: Scope) => this.assert(principal, scope, projectId);
    switch (name) {
      case "workspace.list": this.assert(principal, "workspace:read"); return [{ id: DEMO_WORKSPACE_ID, name: "小赖的电商工作区" }];
      case "project.list": this.assert(principal, "project:read"); return this.listProjects().filter((project) => principal.projectIds.length === 0 || principal.projectIds.includes(project.id));
      case "project.get": requireScope("project:read"); return this.getProject(projectId);
      case "project.create": this.assert(principal, "project:write"); return this.createProject(args);
      case "project.update": requireScope("project:write"); { const current = this.getProject(projectId).project; const updated = ProjectSchema.parse({ ...current, ...args.patch, id: current.id, workspaceId: current.workspaceId, updatedAt: nowIso() }); return this.repo.saveProject(updated); }
      case "source.list": requireScope("source:read"); return this.repo.listSources(projectId);
      case "source.get": requireScope("source:read"); return this.repo.get("source_documents", String(args.sourceId));
      case "source.delete": requireScope("source:upload"); return this.repo.delete("source_documents", String(args.sourceId));
      case "source.reprocess": requireScope("source:upload"); return this.extractFacts(projectId, String(args.sourceId));
      case "source.create_upload": case "source.complete_upload": requireScope("source:upload"); return { uploadUrl: `${process.env.WEB_URL || "http://127.0.0.1:3000"}/api/v1/projects/${projectId}/sources`, method: "POST", status: "awaiting-upload" };
      case "fact.list": requireScope("fact:read"); return this.repo.listFacts(projectId);
      case "fact.extract": requireScope("fact:propose"); return this.extractFacts(projectId, String(args.sourceId));
      case "fact.confirm": case "fact.reject": case "fact.resolve_conflict": requireScope("fact:confirm"); throw new CommerceError("HUMAN_REQUIRED", "已确认事实必须由人类用户在工作台处理", 409);
      case "fact.create_snapshot": requireScope("fact:read"); return createFactSnapshot(projectId, principal.id, this.repo);
      case "prompt.list": requireScope("prompt:read"); return this.repo.list<PromptSpec>("prompt_specs", { projectId });
      case "prompt.get": requireScope("prompt:read"); return this.repo.get("prompt_specs", String(args.promptSpecId));
      case "prompt.generate": requireScope("prompt:write"); return this.generatePrompt(projectId, String(args.objective || "生成新品上市方案"));
      case "prompt.explain": case "prompt.evaluate": requireScope("prompt:read"); { const spec = this.repo.get<PromptSpec>("prompt_specs", String(args.promptSpecId)); if (!spec) throw new CommerceError("PROMPT_NOT_FOUND", "没有找到提示词", 404); const snap = this.repo.get<FactSnapshot>("fact_snapshots", spec.factSnapshotId); if (!snap) throw new CommerceError("SNAPSHOT_NOT_FOUND", "事实快照不存在", 404); return evaluatePrompt(spec, snap); }
      case "prompt.save": requireScope("prompt:write"); return { saved: true, promptSpecId: args.promptSpecId };
      case "prompt.run": requireScope("prompt:run"); return this.runPrompt(projectId, String(args.promptSpecId), ArtifactTypeValidator.parse(args.artifactType || "proposal"));
      case "prompt.export": requireScope("prompt:read"); { const spec = this.repo.get<PromptSpec>("prompt_specs", String(args.promptSpecId)); return { format: args.format || "json", content: JSON.stringify(spec, null, 2) }; }
      case "prompt.build_handoff": requireScope("prompt:read"); return this.buildHandoff(projectId, String(args.promptSpecId), String(args.objective || "继续完成项目"));
      case "skill.list": this.assert(principal, "skill:run"); return SKILL_CATALOG;
      case "skill.get": this.assert(principal, "skill:run"); return SKILL_CATALOG.find((skill) => skill.name === args.name);
      case "skill.run": requireScope("skill:run"); return this.generatePrompt(projectId, String(args.objective || `运行 ${args.name}`));
      case "artifact.list": requireScope("artifact:read"); return this.repo.listArtifacts(projectId);
      case "artifact.get": requireScope("artifact:read"); return { artifact: this.repo.get("artifacts", String(args.artifactId)), versions: this.repo.listArtifactVersions(String(args.artifactId)) };
      case "artifact.create": requireScope("artifact:write"); { const project = this.getProject(projectId).project; return this.createArtifact(projectId, ArtifactTypeValidator.parse(args.type || "report"), String(args.title || "外部智能体草稿"), String(args.content || ""), String(project.currentFactSnapshotId), undefined, { type: "external-agent", id: principal.id }); }
      case "artifact.update": case "artifact.create_version": requireScope("artifact:write"); return this.updateArtifact(projectId, String(args.artifactId), String(args.content || ""), { id: principal.id, type: "external-agent" });
      case "artifact.compare_versions": requireScope("artifact:read"); return this.repo.listArtifactVersions(String(args.artifactId));
      case "artifact.submit_review": requireScope("artifact:review"); return this.requestReview(projectId, String(args.artifactId), principal.id);
      case "artifact.export": requireScope("artifact:export"); return { status: "ready", downloadUrl: `${process.env.WEB_URL || "http://127.0.0.1:3000"}/api/v1/artifacts/${args.artifactId}/export` };
      case "campaign.create_bundle": requireScope("campaign:run"); return this.createCampaignBundle(projectId, String(args.objective || "一键生成整套活动"));
      case "campaign.get_bundle": requireScope("artifact:read"); return this.repo.get("campaign_bundles", String(args.bundleId));
      case "job.get": requireScope("job:read"); return this.repo.get("generation_jobs", String(args.jobId));
      case "job.cancel": requireScope("job:cancel"); { const job = this.repo.get<GenerationJob>("generation_jobs", String(args.jobId)); if (!job) throw new CommerceError("JOB_NOT_FOUND", "任务不存在", 404); job.status = "cancelled"; job.stage = "用户已取消"; job.updatedAt = nowIso(); return this.repo.saveJob(job); }
      case "job.retry": requireScope("campaign:run"); return this.createCampaignBundle(projectId, "重试整套活动任务");
      case "review.run": requireScope("artifact:review"); return { status: "checked", blockers: this.getProject(projectId).facts.filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status)).map((fact) => fact.type) };
      case "review.request_human_approval": case "review.get_status": requireScope("artifact:review"); return name.endsWith("status") ? this.repo.get("review_requests", String(args.reviewId)) : this.requestReview(projectId, String(args.artifactId), principal.id);
      default: throw new CommerceError("TOOL_NOT_FOUND", `未知工具：${name}`, 404);
    }
  }
}

export const SKILL_NAMES = ["commerce-source-intake", "evidence-grounding", "brand-style-lock", "intent-to-brief", "beginner-prompt-builder", "prompt-reviewer", "agent-handoff-builder", "ecommerce-plan-generator", "selling-point-translator", "ecommerce-script-writer", "visual-campaign-director", "image-prompt-and-production", "video-storyboard-director", "video-renderer", "platform-adapter", "campaign-orchestrator", "artifact-qa-and-compliance"] as const;
export const SKILL_CATALOG = SKILL_NAMES.map((name, index) => ({ id: `skill_${index + 1}`, name, version: "1.0.0", sideEffect: ["image-prompt-and-production", "video-renderer", "campaign-orchestrator"].includes(name), requiresHumanReview: ["video-renderer", "campaign-orchestrator", "artifact-qa-and-compliance"].includes(name), description: ({
  "commerce-source-intake": "整理品牌、商品、运营与竞品资料", "evidence-grounding": "建立事实、结论与来源映射", "brand-style-lock": "锁定品牌语言和视觉边界", "intent-to-brief": "把一句话转成电商任务简报", "beginner-prompt-builder": "为 AI 新手生成专业提示词", "prompt-reviewer": "检查提示词完整度和风险", "agent-handoff-builder": "生成最小权限智能体交接包", "ecommerce-plan-generator": "生成可执行电商方案", "selling-point-translator": "把商品特征转成有证据的用户利益点", "ecommerce-script-writer": "生成短视频、直播与广告脚本", "visual-campaign-director": "生成视觉策略与 Storyboard", "image-prompt-and-production": "生成图片提示词并进入生产", "video-storyboard-director": "生成镜头、素材与节奏规划", "video-renderer": "调用确定性视频模板渲染", "platform-adapter": "适配主要中文电商与内容平台", "campaign-orchestrator": "编排整套营销活动内容", "artifact-qa-and-compliance": "复核事实、品牌、平台与合规风险"
} as Record<string,string>)[name] }));

export const MCP_TOOL_NAMES = ["workspace.list", "project.list", "project.get", "project.create", "project.update", "source.list", "source.create_upload", "source.complete_upload", "source.get", "source.delete", "source.reprocess", "fact.list", "fact.extract", "fact.confirm", "fact.reject", "fact.resolve_conflict", "fact.create_snapshot", "prompt.list", "prompt.get", "prompt.generate", "prompt.explain", "prompt.evaluate", "prompt.save", "prompt.run", "prompt.export", "prompt.build_handoff", "skill.list", "skill.get", "skill.run", "artifact.list", "artifact.get", "artifact.create", "artifact.update", "artifact.create_version", "artifact.compare_versions", "artifact.submit_review", "artifact.export", "campaign.create_bundle", "campaign.get_bundle", "job.get", "job.cancel", "job.retry", "review.run", "review.request_human_approval", "review.get_status"] as const;
export const MCP_PROMPT_NAMES = ["build_ecommerce_prompt", "create_campaign_plan", "write_short_video_script", "write_live_script", "create_image_brief", "create_image_prompt", "create_video_storyboard", "adapt_content_for_platform", "review_ecommerce_artifact", "build_agent_handoff"] as const;

export function webhookEnvelope(event: string, payload: unknown) {
  const timestamp = nowIso(); const body = JSON.stringify({ id: newId("evt"), event, timestamp, payload });
  return { body, headers: { "content-type": "application/json", "x-lai-timestamp": timestamp, "x-lai-signature": signWebhook(body, timestamp) } };
}

declare global { var __laiService: CommerceService | undefined; }
export const getCommerceService = () => globalThis.__laiService ??= new CommerceService();
