import { describe, expect, it } from "vitest";
import { FactSchema, FactSnapshotSchema, PromptSpecSchema } from "@lai/domain";
import { CommerceRepository } from "@lai/database";
import { CommerceService, DEMO_PROJECT_ID } from "@lai/shared";
import { buildPromptVariants, compilePrompt, evaluatePrompt } from "@lai/prompt-engine";

const serviceForTest = () => new CommerceService(new CommerceRepository(":memory:"));

describe("领域模型与提示词引擎", () => {
  it("拒绝超出 0–1 的事实置信度", () => {
    expect(() => FactSchema.parse({ id: "f", projectId: "p", type: "规格", value: "1件", status: "verified", confidence: 1.2, confirmedByUser: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })).toThrow();
  });

  it("生成可验证的事实快照和 PromptSpec", () => {
    const service = serviceForTest();
    const data = service.getProject(DEMO_PROJECT_ID);
    expect(FactSnapshotSchema.parse(data.snapshots[0]).checksum).toHaveLength(64);
    const result = service.generatePrompt(DEMO_PROJECT_ID, "写一个30秒新品短视频脚本");
    expect(PromptSpecSchema.parse(result.spec).factSnapshotId).toBe(data.project.currentFactSnapshotId);
    expect(result.variants).toHaveLength(3);
    expect(result.evaluation.dimensions).toHaveLength(11);
    service.repo.close();
  });

  it("编译结果绑定事实快照并提供模型专用格式", () => {
    const service = serviceForTest();
    const context = service.makeCompileContext(DEMO_PROJECT_ID, "生成新品方案");
    const markdown = compilePrompt(context, "markdown") as string;
    const openai = JSON.parse(compilePrompt(context, "openai") as string) as { instructions: string; response_format: unknown };
    expect(markdown).toContain(context.snapshot.id);
    expect(markdown).toContain("缺失就是缺失");
    expect(markdown).toContain("从上传资料正文检索到的相关片段");
    expect(markdown).toContain("商品名称：青麦脆·草莓燕麦杯");
    expect(context.sourceExcerpts.length).toBeGreaterThan(0);
    expect(openai.instructions).toContain(context.snapshot.id);
    expect(openai.response_format).toBeTruthy();
    expect(buildPromptVariants(context).map((item) => item.kind)).toEqual(["simple", "professional", "handoff"]);
    expect(evaluatePrompt(context.spec, context.snapshot).total).toBeGreaterThan(50);
    service.repo.close();
  });

  it("自由创作模式无需资料并把具体商品信息标为待确认", () => {
    const service = serviceForTest();
    const result = service.generatePrompt(DEMO_PROJECT_ID, "为一款东方茶饮设计小红书新品创意", "creative");
    const context = service.makeCompileContext(DEMO_PROJECT_ID, result.spec.objective, "creative");
    context.spec = result.spec;
    const markdown = compilePrompt(context, "markdown") as string;
    const evaluation = evaluatePrompt(context.spec, context.snapshot);
    expect(result.spec.variables.generationMode).toBe("creative");
    expect(result.spec.variables.activeSkills).toEqual(expect.arrayContaining(["intent-to-brief", "ecommerce-plan-generator", "platform-adapter", "artifact-qa-and-compliance"]));
    expect(result.spec.sourceDocumentIds).toEqual([]);
    expect(result.explanation.sources).toEqual([]);
    expect(result.explanation.confirmedFacts).toEqual([]);
    expect(result.explanation.missing.join(" ")).toContain("待确认");
    expect(markdown).toContain("自由创作模式");
    expect(markdown).toContain("已启用的专业技能");
    expect(markdown).toContain("ecommerce-plan-generator");
    expect(markdown).toContain("无需引用资料");
    expect(markdown).toContain("创意假设 / 待确认");
    expect(context.sourceExcerpts).toEqual([]);
    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.risk).not.toBe("blocked");
    service.repo.close();
  });
});
