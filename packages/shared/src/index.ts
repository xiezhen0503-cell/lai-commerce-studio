import crypto from "node:crypto";
import type { AgentHandoff, Artifact, ArtifactVersion, BrandProfile, CampaignBundleResult, Fact, FactSnapshot, GenerationJob, Product, Project, PromptGenerationResult, PromptSpec, Scope, SourceDocument } from "@lai/domain";
import { AgentHandoffSchema, ArtifactTypeSchema as ArtifactTypeValidator, FactSchema, ProjectSchema, PromptSpecSchema, newId, nowIso } from "@lai/domain";
import { getRepository, type CommerceRepository } from "@lai/database";
import { authorize, defaultAgentPrincipal, type AgentPrincipal } from "@lai/permissions";
import { buildPromptVariants, compilePrompt, evaluatePrompt, retrieveSourceExcerpts, type CompileContext } from "@lai/prompt-engine";
import { providerRegistry } from "@lai/providers";
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

const checksumFacts = (facts: Fact[]) => crypto.createHash("sha256").update(JSON.stringify(facts.map((fact) => ({ id: fact.id, value: fact.value, status: fact.status, updatedAt: fact.updatedAt })))).digest("hex");

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

  createProject(input: Partial<Project>) {
    const now = nowIso();
    const project = ProjectSchema.parse({ id: newId("prj"), workspaceId: DEMO_WORKSPACE_ID, name: input.name || "未命名电商项目", type: input.type || PROJECT_TEMPLATE.type, brandId: input.brandId || DEMO_BRAND_ID, productIds: input.productIds?.length ? input.productIds : [DEMO_PRODUCT_ID], objective: input.objective || PROJECT_TEMPLATE.objective, businessGoal: input.businessGoal || PROJECT_TEMPLATE.businessGoal, targetPlatforms: input.targetPlatforms?.length ? input.targetPlatforms : PROJECT_TEMPLATE.targetPlatforms, targetAudience: input.targetAudience || PROJECT_TEMPLATE.targetAudience, budget: input.budget, campaignStart: input.campaignStart, campaignEnd: input.campaignEnd, status: "draft", createdAt: now, updatedAt: now });
    this.repo.saveProject(project);
    const product = this.repo.get<Product>("products", project.productIds[0]!);
    if (product) {
      [
        { type: "商品名称", value: product.name, status: "verified" as const, quote: "来自已确认商品资料" },
        { type: "规格", value: product.specification, status: "user-confirmed" as const, quote: "来自已确认商品资料" },
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

  makeCompileContext(projectId: string, objective: string): CompileContext {
    const data = this.getProject(projectId);
    const brand = data.brand;
    const products = data.products as Product[];
    if (!brand || products.length === 0) throw new CommerceError("PROJECT_CONTEXT_INCOMPLETE", "项目缺少品牌或商品资料");
    const snapshot = data.snapshots.find((item) => item.id === data.project.currentFactSnapshotId) ?? data.snapshots[0] ?? createFactSnapshot(projectId, "platform", this.repo);
    const taskType = objective.includes("脚本") ? "short-video-script" : objective.includes("图片") || objective.includes("海报") ? "image-creative" : objective.includes("视频") ? "video-storyboard" : "campaign-plan";
    const now = nowIso();
    const sourceExcerpts = retrieveSourceExcerpts(data.sources, objective);
    const retrievedSourceIds = [...new Set(sourceExcerpts.map((item) => item.sourceId))];
    const sourceNames = [...new Set(sourceExcerpts.map((item) => item.fileName))];
    const confirmedValues = snapshot.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status) && fact.value).map((fact) => fact.value);
    const spec = PromptSpecSchema.parse({ id: newId("ps"), name: `${data.project.name} · ${objective.slice(0, 24)}`, version: 1, taskType, objective, businessGoal: data.project.businessGoal, projectId, brandId: brand.id, productIds: products.map((item) => item.id), targetAudience: data.project.targetAudience, targetPlatforms: data.project.targetPlatforms, contextReferences: [`laicommerce://projects/${projectId}`, `laicommerce://projects/${projectId}/facts`, ...retrievedSourceIds.map((id) => `laicommerce://sources/${id}`)], sourceDocumentIds: retrievedSourceIds, factSnapshotId: snapshot.id, requiredFacts: ["商品名称", "规格", "活动价", "活动时间"], creativePreferences: ["具体场景", "一条内容只讲一个利益点", "避免模板化三段式"], tone: brand.tone, style: "清醒、具体、有生活场景", deliverables: taskType === "short-video-script" ? ["30 秒短视频脚本", "3 个 A/B 开场", "事实来源与风险提示"] : taskType === "image-creative" ? ["5 张主图 Storyboard", "图片提示词", "确定性叠字清单"] : taskType === "video-storyboard" ? ["30 秒视频分镜", "素材清单", "字幕与安全区"] : ["新品上市方案", "短视频脚本", "5 张主图 Storyboard", "视频分镜", "风险清单"], outputFormat: "使用中文 Markdown，并为每个事实型结论标注来源；最后列出待确认事项。", outputSchema: { executiveSummary: { type: "string" }, strategy: { type: "array" }, deliverables: { type: "array" }, evidence: { type: "array" }, risks: { type: "array" } }, constraints: ["不改变已确认规格", "事实变化后必须重新复核", "人工内容不可静默覆盖"], mustInclude: confirmedValues.slice(0, 12), mustAvoid: [...brand.bannedWords, ...products.flatMap((item) => item.prohibitedClaims)], evidencePolicy: "事实型宣称必须引用当前事实快照或本次检索的资料片段；缺失就是缺失。", brandPolicy: `遵循${brand.name}的品牌语气：${brand.tone.join("、")}。`, compliancePolicy: "价格、规格、日期、资质、功效和发布动作必须人工确认。", qualityRubric: ["事实准确", "来源完整", "品牌一致", "利益点清楚", "平台适配", "可执行", "无高风险宣称"], variables: { objective, retrieval: { sourceIds: retrievedSourceIds, excerptCount: sourceExcerpts.length } }, examples: [], providerHints: { temperature: "隐藏高级项，由适配器决定" }, createdBy: "user_lai", createdAt: now, updatedAt: now });
    return { spec, snapshot, brand, products, sourceNames, sourceExcerpts };
  }

  generatePrompt(projectId: string, objective: string): PromptGenerationResult {
    const context = this.makeCompileContext(projectId, objective);
    const variants = buildPromptVariants(context);
    const evaluation = evaluatePrompt(context.spec, context.snapshot);
    const missing = context.snapshot.facts.filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status));
    const result = { spec: context.spec, variants, explanation: { objective, sources: context.sourceNames, confirmedFacts: context.snapshot.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status)).map((fact) => `${fact.type}：${fact.value}`), missing: missing.map((fact) => `${fact.type}：${fact.status === "missing" ? "缺失" : fact.status}`), outputs: context.spec.deliverables, risks: evaluation.blockers.length ? evaluation.blockers : ["发布前仍需人工复核"], advice: ["先处理活动价等必须确认项", "简易版适合快速复制，专业版适合正式生产", "交接版只给获得项目权限的智能体"] }, evaluation };
    this.repo.save("prompt_specs", context.spec, { workspaceId: DEMO_WORKSPACE_ID, projectId, version: context.spec.version });
    variants.forEach((variant) => this.repo.save("prompt_versions", { ...variant, promptSpecId: context.spec.id, projectId, factSnapshotId: context.snapshot.id, updatedAt: variant.createdAt }, { workspaceId: DEMO_WORKSPACE_ID, projectId, parentId: context.spec.id, version: context.spec.version }));
    this.repo.save("evaluations", evaluation, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: evaluation.risk, parentId: context.spec.id });
    audit("prompt.generated", { promptSpecId: context.spec.id, objective }, { actorId: "user_lai", actorType: "human", projectId, repo: this.repo });
    return result;
  }

  async runPrompt(projectId: string, promptSpecId: string, artifactType: z.infer<typeof ArtifactTypeValidator> = "proposal") {
    const spec = this.repo.get<PromptSpec>("prompt_specs", promptSpecId);
    if (!spec || spec.projectId !== projectId) throw new CommerceError("PROMPT_NOT_FOUND", "没有找到这个项目的提示词", 404);
    const context = this.makeCompileContext(projectId, spec.objective); context.spec = spec;
    const prompt = compilePrompt(context, "markdown");
    const started = Date.now();
    const textProvider = providerRegistry.text;
    const generated = await textProvider.generate(spec, prompt);
    const content = generated.model === "mock-text-v1" && artifactType === "script"
      ? this.mockScript(context)
      : generated.model === "mock-text-v1" && (artifactType === "storyboard" || artifactType === "video-storyboard")
        ? JSON.stringify(this.mockStoryboard(context, artifactType === "video-storyboard"), null, 2)
        : generated.text;
    const artifact = this.createArtifact(projectId, artifactType, this.titleForArtifact(artifactType), content, context.snapshot.id, promptSpecId, { type: "platform-ai", id: generated.model });
    const run = { id: newId("run"), promptVersionId: promptSpecId, provider: textProvider.name, model: generated.model, inputSnapshot: context.snapshot.id, factSnapshotId: context.snapshot.id, output: content, latency: Date.now() - started, tokenUsage: generated.tokenUsage, estimatedCost: 0, qualityScore: evaluatePrompt(spec, context.snapshot).total, errors: [], createdAt: nowIso(), updatedAt: nowIso() };
    this.repo.save("prompt_runs", run, { workspaceId: DEMO_WORKSPACE_ID, projectId, parentId: promptSpecId });
    return { artifact, run };
  }

  titleForArtifact(type: z.infer<typeof ArtifactTypeValidator>) { return ({ proposal: "新品上市方案", script: "30秒短视频脚本", storyboard: "五张主图 Storyboard", "image-prompt": "图片生成提示词", image: "模拟主图", "video-storyboard": "30秒视频分镜", video: "Remotion 视频草稿", caption: "平台文案", schedule: "内容排期", report: "质量报告", prompt: "专业提示词", handoff: "智能体交接包" } as Record<string, string>)[type] || type; }

  mockScript(context: CompileContext) {
    const product = context.products[0]!;
    return `# 30 秒短视频脚本｜${product.name}\n\n| 时间 | 画面 | 人物动作 | 口播 | 屏幕文字 | 来源 / 风险 |\n|---|---|---|---|---|---|\n| 0–3s | 通勤包里露出独立杯 | 拿出产品 | 早上又来不及？先别空着手出门。 | 一杯带走 | 创意场景 |\n| 3–10s | 包装原样特写 | 镜头沿背标移动 | 这杯先把配料写清楚：燕麦片、冻干草莓粒和乳粉。 | 配料看得懂 | ${context.sourceNames[0] || "事实卡"} |\n| 10–18s | 冲泡与搅拌 | 加水、搅拌 | ${product.specification}，独立杯装，办公桌上也好处理。 | ${product.specification} | 规格事实卡 |\n| 18–25s | 三个生活场景切换 | 早餐、午后、加班 | 不替你承诺神奇效果，只给忙碌的一天多一个具体选择。 | 不夸大，只讲清楚 | 合规表达 |\n| 25–30s | 商品卡与 CTA | 指向商品卡 | 活动价确认后再上屏。先看清配料，再决定要不要带走。 | 活动价：待确认 | 未确认价格不得发布 |\n`;
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

  async createCampaignBundle(projectId: string, objective = "一键生成整套新品上市活动"): Promise<CampaignBundleResult> {
    const context = this.makeCompileContext(projectId, objective);
    const job: GenerationJob = { id: newId("job"), workspaceId: DEMO_WORKSPACE_ID, projectId, type: "campaign-bundle", status: "running", progress: 15, stage: "建立事实快照与任务简报", resultArtifactIds: [], createdAt: nowIso(), updatedAt: nowIso() };
    this.repo.saveJob(job);
    const prompt = this.generatePrompt(projectId, objective);
    const textProvider = providerRegistry.text;
    const generated = await textProvider.generate(prompt.spec, compilePrompt(context));
    const storyboard = this.mockStoryboard(context) as Array<{ index: number; headline: string; composition: string; overlay: string }>;
    const visualPreviews = await Promise.all(storyboard.map(async (frame) => ({ frame, image: await providerRegistry.image.generate({ prompt: `${frame.headline}｜${frame.composition}`, width: 1080, height: 1080 }) })));
    const items: Array<{ type: z.infer<typeof ArtifactTypeValidator>; content: string; title?: string }> = [
      { type: "proposal", content: generated.text }, { type: "script", content: this.mockScript(context) }, { type: "storyboard", content: JSON.stringify(storyboard, null, 2) },
      { type: "image-prompt", content: `保持真实商品包装不变。场景：晨间通勤桌面；光线：柔和侧光；品牌色：${context.brand.colors.join("、")}；价格、规格、Logo、CTA 不进入生成画面，交由程序化图层叠加。` },
      { type: "video-storyboard", content: JSON.stringify(this.mockStoryboard(context, true), null, 2) }, { type: "video", content: JSON.stringify({ template: "Promo30", props: { product: context.products[0]?.name, specification: context.products[0]?.specification, factSnapshotId: context.snapshot.id } }, null, 2) },
      { type: "schedule", content: "第1–2天：素材与开场稿；第3–5天：小流量测试；第6–7天：复盘；第8–14天：胜出内容扩量。" }, { type: "report", content: `事实快照：${context.snapshot.id}\n阻断项：${prompt.evaluation.blockers.join("、") || "无"}\n人工审核：必需` },
      ...visualPreviews.map(({ frame, image }) => ({ type: "image" as const, title: `主图预览 ${frame.index}｜${frame.headline}`, content: JSON.stringify({ assetUri: image.assetUri, metadata: image.metadata, storyboard: frame, factSnapshotId: context.snapshot.id }) }))
    ];
    const artifacts = items.map((item) => {
      const creatorId = item.type === "proposal" ? generated.model : item.type === "image" ? providerRegistry.image.name : item.type === "video" ? "remotion-template-v1" : "deterministic-campaign-engine-v1";
      return this.createArtifact(projectId, item.type, item.title || this.titleForArtifact(item.type), item.content, context.snapshot.id, prompt.spec.id, { type: "platform-ai", id: creatorId });
    });
    job.status = prompt.evaluation.blockers.length ? "needs-review" : "succeeded"; job.progress = 100; job.stage = prompt.evaluation.blockers.length ? "等待人工确认高风险字段" : "已完成"; job.resultArtifactIds = artifacts.map((item) => item.id); job.updatedAt = nowIso(); this.repo.saveJob(job);
    const bundle = { id: newId("bundle"), projectId, factSnapshotId: context.snapshot.id, jobId: job.id, artifactIds: job.resultArtifactIds, provider: textProvider.name, model: generated.model, createdAt: nowIso(), updatedAt: nowIso() };
    this.repo.save("campaign_bundles", bundle, { workspaceId: DEMO_WORKSPACE_ID, projectId, status: job.status });
    return bundle;
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
    const token = createAgentToken(); const now = nowIso(); const account = { id: newId("agent"), workspaceId: DEMO_WORKSPACE_ID, name: input.name, scopes: input.scopes ?? defaultAgentPrincipal("temp").scopes, projectIds: input.projectIds?.length ? input.projectIds : [DEMO_PROJECT_ID], tokenLast4: token.slice(-4), status: "active", expiresAt: input.expiresAt, createdAt: now, updatedAt: now };
    this.repo.save("agent_service_accounts", account, { workspaceId: DEMO_WORKSPACE_ID, status: "active", tokenHash: hashToken(token), expiresAt: input.expiresAt });
    const connection = { id: newId("conn"), workspaceId: DEMO_WORKSPACE_ID, agentServiceAccountId: account.id, name: account.name, protocol: "MCP / REST / A2A", status: "active", createdAt: now, updatedAt: now };
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
