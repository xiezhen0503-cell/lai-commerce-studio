import type { BrandProfile, Evaluation, FactSnapshot, Product, PromptSpec, PromptVariant } from "@lai/domain";
import { newId, nowIso } from "@lai/domain";

export interface CompileContext {
  spec: PromptSpec;
  snapshot: FactSnapshot;
  brand: BrandProfile;
  products: Product[];
  sourceNames: string[];
}

const factLines = (snapshot: FactSnapshot) => snapshot.facts
  .filter((fact) => ["verified", "user-confirmed"].includes(fact.status))
  .map((fact) => `- ${fact.type}：${fact.value}${fact.unit ? ` ${fact.unit}` : ""}（来源：${fact.sourceQuote || fact.sourceDocumentId || "用户确认"}）`)
  .join("\n");

const missingLines = (snapshot: FactSnapshot) => snapshot.facts
  .filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status))
  .map((fact) => `- ${fact.type}：${fact.status === "missing" ? "缺失" : fact.status === "conflicting" ? "存在冲突" : "已过期"}`)
  .join("\n") || "- 无";

function compileUniversalChineseBody(context: CompileContext) {
  const { spec, snapshot, brand, products, sourceNames } = context;
  return `# 任务\n${spec.objective}\n\n## 业务目标\n${spec.businessGoal}\n\n## 项目背景\n品牌：${brand.name}\n商品：${products.map((product) => `${product.name}（${product.specification}）`).join("、")}\n目标人群：${spec.targetAudience}\n目标平台：${spec.targetPlatforms.join("、")}\n使用资料：${sourceNames.join("、") || "无上传资料"}\n\n## 已确认事实（不得改写数值，不得补造）\n${factLines(snapshot) || "- 暂无已确认事实"}\n\n## 缺失或待确认\n${missingLines(snapshot)}\n\n## 必须完成\n${spec.deliverables.map((item) => `- ${item}`).join("\n")}\n\n## 必须包含\n${spec.mustInclude.map((item) => `- ${item}`).join("\n") || "- 遵循已确认事实"}\n\n## 禁止事项\n${spec.mustAvoid.map((item) => `- ${item}`).join("\n")}\n- 不得把创意建议写成商品事实\n- 不得编造价格、规格、销量、评价、资质或检测数据\n\n## 品牌与合规\n品牌语气：${brand.tone.join("、")}\n禁用词：${brand.bannedWords.join("、") || "无额外词表"}\n${spec.brandPolicy}\n${spec.compliancePolicy}\n\n## 输出结构\n${spec.outputFormat}\n${Object.keys(spec.outputSchema).map((key) => `- ${key}`).join("\n")}\n\n## 交付前自检\n${spec.qualityRubric.map((item) => `- ${item}`).join("\n")}`;
}

export function compileUniversalChinese(context: CompileContext) {
  return `事实快照：${context.snapshot.id}\n证据策略：${context.spec.evidencePolicy}\n\n${compileUniversalChineseBody(context)}`;
}

export function compileUniversalEnglish(context: CompileContext) {
  const { spec, snapshot, brand, products } = context;
  return `# Task\n${spec.objective}\n\n## Business goal\n${spec.businessGoal}\n\n## Grounded context\nBrand: ${brand.name}\nProducts: ${products.map((p) => `${p.name} (${p.specification})`).join(", ")}\nAudience: ${spec.targetAudience}\nPlatforms: ${spec.targetPlatforms.join(", ")}\nFact snapshot: ${snapshot.id}\n\n## Confirmed facts\n${factLines(snapshot)}\n\n## Missing or conflicted information\n${missingLines(snapshot)}\n\n## Deliverables\n${spec.deliverables.map((item) => `- ${item}`).join("\n")}\n\n## Guardrails\n- Do not invent price, specifications, sales, reviews, certifications, or test results.\n- Keep factual statements separate from creative recommendations.\n${spec.mustAvoid.map((item) => `- Avoid: ${item}`).join("\n")}\n\n## Output format\n${spec.outputFormat}`;
}

export function compilePrompt(context: CompileContext, target: "markdown" | "json" | "openai" | "anthropic" | "gemini" | "handoff" = "markdown") {
  const chinese = compileUniversalChinese(context);
  const invariants = {
    factSnapshotId: context.snapshot.id,
    requiredFacts: context.spec.requiredFacts,
    mustInclude: context.spec.mustInclude,
    mustAvoid: context.spec.mustAvoid,
    outputSchema: context.spec.outputSchema,
    evidencePolicy: context.spec.evidencePolicy,
    approvalPolicy: "价格、规格、日期、资质、功效和对外发布必须人工确认"
  };
  if (target === "markdown") return chinese;
  if (target === "json" || target === "handoff") return JSON.stringify({ task: context.spec.objective, contextUri: `laicommerce://projects/${context.spec.projectId}`, prompt: chinese, invariants }, null, 2);
  const adapters = {
    openai: { instructions: chinese, response_format: { type: "json_schema", json_schema: { name: "ecommerce_artifact", schema: context.spec.outputSchema } } },
    anthropic: { system: "遵循事实快照与人工审核边界。", messages: [{ role: "user", content: chinese }], output_schema: context.spec.outputSchema },
    gemini: { systemInstruction: "遵循事实快照与人工审核边界。", contents: [{ role: "user", parts: [{ text: chinese }] }], responseSchema: context.spec.outputSchema }
  };
  return JSON.stringify({ ...adapters[target], invariants }, null, 2);
}

export function buildPromptVariants(context: CompileContext): PromptVariant[] {
  const createdAt = nowIso();
  const simpleFacts = context.snapshot.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status)).slice(0, 6);
  const simple = `请为${context.products.map((product) => product.name).join("、")}完成“${context.spec.objective}”。目标平台是${context.spec.targetPlatforms.join("、")}，面向${context.spec.targetAudience}。只使用这些已确认事实：${simpleFacts.map((fact) => `${fact.type}=${fact.value}`).join("；")}。不要编造缺失信息，输出${context.spec.deliverables.join("、")}，并标出待确认项。`;
  return [
    { id: newId("promptv"), kind: "simple", title: "简易版", content: simple, createdAt },
    { id: newId("promptv"), kind: "professional", title: "专业版", content: compileUniversalChinese(context), createdAt },
    { id: newId("promptv"), kind: "handoff", title: "智能体交接版", content: compilePrompt(context, "handoff"), createdAt }
  ];
}

const dimension = (key: string, label: string, score: number, issue: string, suggestion: string) => ({ key, label, score, issue, suggestion });

export function evaluatePrompt(spec: PromptSpec, snapshot: FactSnapshot): Evaluation {
  const confirmed = snapshot.facts.filter((fact) => ["verified", "user-confirmed"].includes(fact.status));
  const risky = snapshot.facts.filter((fact) => ["missing", "conflicting", "expired"].includes(fact.status));
  const sourceCoverage = Math.round(confirmed.length === 0 ? 0 : confirmed.filter((fact) => fact.sourceDocumentId || fact.confirmedByUser).length / confirmed.length * 100);
  const dimensions = [
    dimension("objective", "目标清晰度", spec.objective.length > 12 ? 92 : 68, spec.objective.length > 12 ? "目标可直接执行" : "目标过短", "补充具体业务结果"),
    dimension("context", "背景完整度", spec.projectId && spec.brandId && spec.productIds.length ? 90 : 55, "已关联项目、品牌和商品", "保持项目上下文"),
    dimension("sources", "资料引用完整度", sourceCoverage, sourceCoverage >= 80 ? "关键事实已有来源" : "部分事实缺少来源", "补充检测报告或用户确认"),
    dimension("facts", "商品事实完整度", Math.max(40, 100 - risky.length * 12), risky.length ? `仍有 ${risky.length} 项待处理` : "事实完整", "先解决价格、规格和活动时间"),
    dimension("audience", "目标人群清晰度", spec.targetAudience.length > 4 ? 88 : 60, "已定义目标人群", "补充购买场景"),
    dimension("platform", "平台适配度", spec.targetPlatforms.length ? 90 : 45, "已指定发布平台", "至少选择一个平台"),
    dimension("structure", "输出结构清晰度", Object.keys(spec.outputSchema).length >= 3 ? 94 : 72, "输出结构可校验", "增加章节或字段"),
    dimension("constraints", "约束完整度", spec.mustAvoid.length >= 3 ? 91 : 70, "事实与禁用项已设置", "补充平台禁用词"),
    dimension("brand", "品牌一致性", spec.brandPolicy.length > 10 ? 89 : 65, "已应用品牌规则", "确认品牌语气与禁用词"),
    dimension("compliance", "合规风险", risky.some((fact) => ["价格", "资质", "活动时间"].includes(fact.type)) ? 58 : 88, "高风险字段受人工审核保护", "对无来源宣称保持阻断"),
    dimension("handoff", "智能体可理解度", spec.outputSchema && spec.factSnapshotId ? 95 : 65, "交接包包含快照和结构", "限制回写为草稿")
  ];
  const total = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const blockers = risky.filter((fact) => ["价格", "规格", "活动时间", "资质"].includes(fact.type)).map((fact) => `${fact.type}${fact.status === "missing" ? "缺失" : "存在冲突"}`);
  return { id: newId("eval"), promptVersionId: spec.id, total, risk: blockers.length ? "blocked" : total >= 85 ? "low" : "medium", dimensions, blockers, createdAt: nowIso() };
}
