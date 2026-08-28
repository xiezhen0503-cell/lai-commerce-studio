import { afterEach, describe, expect, it, vi } from "vitest";
import { CommerceRepository } from "@lai/database";
import { providerRegistry } from "@lai/providers";
import { CommerceService, DEMO_PROJECT_ID } from "@lai/shared";

function scriptPayload() {
  return JSON.stringify({
    title: "30 秒商品短视频脚本",
    creativeDirection: "从真实生活场景切入，先说用户困扰，再展示商品信息和下一步动作。",
    openings: [
      { label: "A版", visual: "闹钟与通勤包快切", spoken: "早上又来不及？", subtitle: "先别空着手出门" },
      { label: "B版", visual: "包装背标微距", spoken: "买之前先看这一行", subtitle: "信息先看清" },
      { label: "C版", visual: "办公桌落下商品", spoken: "忙，也要有个具体选择", subtitle: "给早餐留个位置" }
    ],
    shots: [
      { start: 0, end: 3, visual: "近景快切", action: "拿起商品", spoken: "早上又来不及？", subtitle: "3秒看懂", productBoundary: "创意场景" },
      { start: 3, end: 9, visual: "包装近景", action: "转动包装", spoken: "先把商品信息看清楚", subtitle: "商品信息待确认", productBoundary: "规格待确认" },
      { start: 9, end: 16, visual: "使用过程俯拍", action: "完成使用动作", spoken: "步骤要拍清楚", subtitle: "使用方式", productBoundary: "不暗示功效" },
      { start: 16, end: 24, visual: "生活场景中景", action: "放到桌面", spoken: "让用户知道什么时候会用到", subtitle: "具体场景", productBoundary: "场景是创意假设" },
      { start: 24, end: 30, visual: "商品卡定格", action: "指向商品卡", spoken: "确认信息后再决定", subtitle: "查看详情", productBoundary: "价格和日期待确认" }
    ],
    production: { scenes: ["玄关", "办公桌"], props: ["闹钟", "电脑"], camera: ["近景", "俯拍", "动作转场"], sound: ["口播清楚", "不使用夸张音效"] },
    creativeAssumptions: ["人物和生活场景属于创意假设"],
    pendingConfirmations: ["商品名称、规格、价格、活动日期和功效发布前确认"]
  });
}

function planPayload() {
  return JSON.stringify({
    title: "7 天新品活动方案",
    summary: "先用小样本内容验证目标人群是否愿意停留、理解并进一步了解商品。首轮聚焦一个明确场景和一个核心利益点，不追求铺量；第 5 天和第 7 天依据数据决定调整或加码。",
    goals: [{ goal: "完成新品认知与首轮转化验证", kpi: "点击率、3秒留存、完播率、互动率与加购率；历史基线待确认", observationPeriod: "7天", successCriteria: "找到至少一个可重复验证的内容角度" }],
    audience: { segment: "需要快速看懂商品信息的城市用户", scenes: ["通勤前", "午后", "加班时"], barriers: ["看不清商品信息", "不知道适合什么场景"] },
    platformStrategies: [{ platform: "小红书", approach: "用清单和细节图承接收藏" }, { platform: "抖音", approach: "用前3秒冲突和动作推进" }],
    strategies: ["每条内容只解决一个问题", "先测试开场再增加资源", "把事实与创意场景分开表达"],
    contentMatrix: [
      { theme: "认知", benefit: "快速认识商品", evidence: "真实包装或待确认", format: "15秒视频", cta: "查看详情" },
      { theme: "理解", benefit: "看懂使用场景", evidence: "真实使用素材", format: "图文清单", cta: "收藏对照" },
      { theme: "转化", benefit: "明确下一步", evidence: "确认后的商品卡", format: "短视频", cta: "进入商品页" }
    ],
    schedule: Array.from({ length: 7 }, (_, index) => ({ day: index + 1, owner: index < 2 ? "运营/编导" : "内容团队", action: `完成第${index + 1}天的内容准备、发布或复盘动作`, deliverable: `第${index + 1}天交付物`, metric: "按当天任务验收并记录数据" })),
    resources: [{ role: "运营", responsibility: "事实与排期", requirement: "商品资料和平台账号", budgetOrHours: "待确认" }, { role: "编导与剪辑", responsibility: "内容制作", requirement: "拍摄设备和真实商品", budgetOrHours: "待确认" }],
    review: { metrics: "点击率、留存、完播、互动和加购", reviewTimes: "第5天和第7天", scaleCondition: "核心指标连续两次高于账号基线", adjustCondition: "互动好但加购弱时补充商品信息", stopCondition: "连续两次低于基线时暂停同一内容角度" },
    boundaries: { confirmedFacts: [], creativeAssumptions: ["通勤、午后和加班场景属于创意假设"], pendingConfirmations: ["商品名称、规格、价格、日期、资质和功效"] }
  });
}

describe("结构化内容生产与非阻断整理", () => {
  let repository: CommerceRepository | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    repository?.close();
  });

  it("把结构化脚本数据排版为可读、可编辑的中文脚本", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "写一条30秒短视频脚本", "creative");
    vi.spyOn(providerRegistry.text, "generate").mockResolvedValue({ text: scriptPayload(), model: "test-live-model", latencyMs: 10, tokenUsage: 300 });

    const result = await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "script");

    expect(result.artifact.version.content).toContain("## A/B/C 前 3 秒开场");
    expect(result.artifact.version.content).toContain("## 30 秒逐镜头脚本");
    expect(result.run.generationMethod).toMatchObject({ type: "structured-generation", attempts: 1, structuredPresentation: true });
  });

  it("把结构化方案数据排版为目标、内容矩阵、排期和复盘方案", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "生成一份7天新品上市方案", "creative");
    vi.spyOn(providerRegistry.text, "generate").mockResolvedValue({ text: planPayload(), model: "test-live-model", latencyMs: 10, tokenUsage: 500 });

    const result = await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "proposal");

    expect(result.artifact.version.content).toContain("## 内容矩阵");
    expect(result.artifact.version.content).toContain("| 第 7 天 |");
    expect(result.artifact.version.content).toContain("## 数据复盘与止损");
    expect(result.run.generationMethod).toMatchObject({ attempts: 1, structuredPresentation: true });
  });

  it("格式没对齐时自动整理一次，但不会再用内容质量门拒绝模型原文", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "生成一份7天新品上市方案", "creative");
    const generate = vi.spyOn(providerRegistry.text, "generate")
      .mockResolvedValueOnce({ text: "# 初稿\n\n先测试一个内容方向。", model: "test-live-model", latencyMs: 10, tokenUsage: 20 })
      .mockResolvedValueOnce({ text: "# 整理稿\n\n这是模型第二次返回的可编辑草稿，即使格式不标准也交给用户继续修改。", model: "test-live-model", latencyMs: 20, tokenUsage: 30 });

    const result = await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "proposal");

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.artifact.version.content).toContain("整理稿");
    expect(result.run.generationMethod).toMatchObject({ attempts: 2, structuredPresentation: false });
    expect(service.getProject(DEMO_PROJECT_ID).artifacts.filter((artifact) => artifact.type === "proposal")).toHaveLength(1);
  });
});
