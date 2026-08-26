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
    expect(openai.instructions).toContain(context.snapshot.id);
    expect(openai.response_format).toBeTruthy();
    expect(buildPromptVariants(context).map((item) => item.kind)).toEqual(["simple", "professional", "handoff"]);
    expect(evaluatePrompt(context.spec, context.snapshot).total).toBeGreaterThan(50);
    service.repo.close();
  });
});
