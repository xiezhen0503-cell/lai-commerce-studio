import { afterEach, describe, expect, it, vi } from "vitest";
import { CommerceRepository } from "@lai/database";
import { compilePrompt } from "@lai/prompt-engine";
import { MockTextProvider, providerRegistry } from "@lai/providers";
import { CommerceService, DEMO_PROJECT_ID, inspectCommercePlanArtifact, inspectVideoScriptArtifact } from "@lai/shared";

describe("短视频脚本生产质量门", () => {
  let repository: CommerceRepository | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    repository?.close();
  });

  it("Markdown 任务不再把通用 JSON 字段交给模型", () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const context = service.makeCompileContext(DEMO_PROJECT_ID, "写一条30秒短视频脚本", "creative");
    const prompt = compilePrompt(context, "markdown");

    expect(prompt).not.toContain("- executiveSummary");
    expect(prompt).not.toContain("- strategy");
    expect(prompt).toContain("30 秒短视频脚本");
  });

  it("拒绝只有 executiveSummary 的残缺摘要", () => {
    const qa = inspectVideoScriptArtifact("### executiveSummary\n- **项目**：抖音 30 秒短视频", 30);

    expect(qa.passed).toBe(false);
    expect(qa.score).toBeLessThan(30);
    expect(qa.issues).toContain("时间轴少于 5 个镜头段落");
    expect(qa.issues).toContain("缺少口播、台词或旁白");
  });

  it("完整脚本包含开场、时间轴、拍摄清单和待确认项", () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const context = service.makeCompileContext(DEMO_PROJECT_ID, "写一条30秒短视频脚本", "creative");
    const content = service.mockScript(context);
    const qa = inspectVideoScriptArtifact(content, 30);

    expect(qa).toMatchObject({ passed: true, score: 100, timelineSegments: 5, timelineEndSeconds: 30, openingVariants: 3 });
  });

  it("真实模型首版残缺时自动重写一次，只保存通过质量门的脚本", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "写一条30秒短视频脚本", "creative");
    const complete = service.mockScript(service.makeCompileContext(DEMO_PROJECT_ID, prompt.spec.objective, "creative"));
    const generate = vi.spyOn(providerRegistry.text, "generate")
      .mockResolvedValueOnce({ text: "### executiveSummary\n- **项目**：抖音 30 秒短视频", model: "test-live-model", latencyMs: 10, tokenUsage: 20 })
      .mockResolvedValueOnce({ text: complete, model: "test-live-model", latencyMs: 20, tokenUsage: 300 });

    const result = await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "script");

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.artifact.version.content).toContain("## 30 秒逐镜头脚本");
    expect(result.run.qualityScore).toBe(100);
    expect(result.run.qualityGate).toMatchObject({ type: "video-script-v1", passed: true, attempts: 2 });
  });

  it("连续两次残缺时明确失败且不保存坏成果", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "写一条30秒短视频脚本", "creative");
    vi.spyOn(providerRegistry.text, "generate").mockResolvedValue({ text: "### executiveSummary\n- **项目**：抖音 30 秒短视频", model: "test-live-model", latencyMs: 10, tokenUsage: 20 });

    await expect(service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "script")).rejects.toMatchObject({ code: "MODEL_SCRIPT_INCOMPLETE" });
    expect(service.getProject(DEMO_PROJECT_ID).artifacts.filter((artifact) => artifact.type === "script")).toHaveLength(0);
  });

  it("拒绝只有标题和口号的空泛活动方案", () => {
    const qa = inspectCommercePlanArtifact("# 新品上市方案\n\n## 策略\n打造爆款，实现品效合一。\n\n## 执行\n持续发布优质内容。");

    expect(qa.passed).toBe(false);
    expect(qa.score).toBeLessThan(40);
    expect(qa.issues).toContain("缺少可衡量目标或核心指标");
    expect(qa.issues).toContain("缺少至少 5 天有具体动作的 7 天执行排期");
  });

  it("完整活动方案包含指标、内容矩阵、逐日动作、资源与止损", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const context = service.makeCompileContext(DEMO_PROJECT_ID, "生成一份7天新品上市方案", "creative");
    const complete = (await new MockTextProvider().generate(context.spec, "")).text;
    const qa = inspectCommercePlanArtifact(complete);

    expect(qa).toMatchObject({ passed: true, score: 100, scheduledDays: 7 });
    expect(qa.actionCount).toBeGreaterThanOrEqual(7);
  });

  it("真实模型连续两次只给方案提纲时拒绝保存", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "生成一份7天新品上市方案", "creative");
    vi.spyOn(providerRegistry.text, "generate").mockResolvedValue({ text: "# 新品上市方案\n\n## 策略\n打造爆款。", model: "test-live-model", latencyMs: 10, tokenUsage: 20 });

    await expect(service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "proposal")).rejects.toMatchObject({ code: "MODEL_PLAN_INCOMPLETE" });
    expect(service.getProject(DEMO_PROJECT_ID).artifacts.filter((artifact) => artifact.type === "proposal")).toHaveLength(0);
  });
});
