import { describe, expect, it } from "vitest";
import { CommerceRepository } from "@lai/database";
import { defaultAgentPrincipal } from "@lai/permissions";
import { CommerceError, CommerceService, DEMO_PROJECT_ID, SKILL_CATALOG } from "@lai/shared";

const setup = () => new CommerceService(new CommerceRepository(":memory:"));

describe("端到端领域工作流", () => {
  it("资料→事实→确认→快照→提示词→方案→版本", async () => {
    const service = setup();
    const before = service.getProject(DEMO_PROJECT_ID);
    const extracted = service.extractFacts(DEMO_PROJECT_ID, before.sources[0]!.id);
    expect(extracted.length).toBeGreaterThan(0);
    const price = before.facts.find((fact) => fact.type === "活动价")!;
    const confirmed = service.confirmFact(DEMO_PROJECT_ID, price.id, "29.9");
    expect(confirmed.snapshot.version).toBeGreaterThan(1);
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "生成新品上市方案");
    const run = await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "proposal");
    const second = service.updateArtifact(DEMO_PROJECT_ID, run.artifact.id, "人工修改后的方案");
    expect(second.version).toBe(2);
    const restored = service.restoreArtifactVersion(DEMO_PROJECT_ID, run.artifact.id, run.artifact.version.id);
    expect(restored.version).toBe(3);
    const template = service.savePromptTemplate(DEMO_PROJECT_ID, prompt.spec.id);
    const handoff = service.buildHandoff(DEMO_PROJECT_ID, prompt.spec.id, "继续生成获准草稿");
    expect(template.factSnapshotId).toBe(prompt.spec.factSnapshotId);
    expect(handoff.approvalPolicy).toBe("always-human");
    expect(service.repo.listArtifactVersions(run.artifact.id)).toHaveLength(3);
    service.repo.close();
  });

  it("事实变化会使未人工修改的旧产物过期", async () => {
    const service = setup();
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "写一个短视频脚本");
    const run = await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "script");
    const fact = service.getProject(DEMO_PROJECT_ID).facts.find((item) => item.type === "规格")!;
    const impact = service.confirmFact(DEMO_PROJECT_ID, fact.id, fact.value);
    expect(impact.affectedArtifactIds).toContain(run.artifact.id);
    expect(service.repo.get<{ status: string }>("artifacts", run.artifact.id)?.status).toBe("stale");
    service.repo.close();
  });

  it("清空测试项目后只保留空白项目骨架，并可重新上传自己的资料", async () => {
    const service = setup();
    const prompt = service.generatePrompt(DEMO_PROJECT_ID, "生成旧项目方案");
    await service.runPrompt(DEMO_PROJECT_ID, prompt.spec.id, "proposal");
    const reset = service.resetProjectForTesting(DEMO_PROJECT_ID);
    const data = service.getProject(DEMO_PROJECT_ID);
    expect(reset.project.name).toBe("我的资料测试项目");
    expect(data.sources).toHaveLength(0);
    expect(data.facts).toHaveLength(0);
    expect(data.artifacts).toHaveLength(0);
    expect(data.jobs).toHaveLength(0);
    expect(data.reviews).toHaveLength(0);
    expect(data.snapshots).toHaveLength(1);
    expect(data.snapshots[0]?.facts).toHaveLength(0);
    expect(data.products[0]?.name).toBe("待上传商品");
    service.repo.close();
  });

  it("Campaign Bundle 生成可追踪 Job 和多类型物料", async () => {
    const service = setup();
    const bundle = await service.createCampaignBundle(DEMO_PROJECT_ID);
    const job = service.repo.get<{ progress: number; resultArtifactIds: string[] }>("generation_jobs", bundle.jobId)!;
    expect(job.progress).toBe(100);
    expect(bundle.artifactIds.length).toBeGreaterThanOrEqual(7);
    expect(job.resultArtifactIds).toEqual(bundle.artifactIds);
    service.repo.close();
  });

  it("MCP 同名工具共享权限策略，事实确认强制转人工", async () => {
    const service = setup();
    const principal = defaultAgentPrincipal("integration-agent", [DEMO_PROJECT_ID]);
    const projects = await service.runTool("project.list", {}, principal);
    expect(projects).toHaveLength(1);
    await expect(service.runTool("fact.confirm", { projectId: DEMO_PROJECT_ID, factId: "fact_spec" }, { ...principal, scopes: [...principal.scopes, "fact:confirm"] })).rejects.toMatchObject({ code: "HUMAN_REQUIRED" } satisfies Partial<CommerceError>);
    await expect(service.runTool("artifact.create", { projectId: DEMO_PROJECT_ID, title: "外部草稿", content: "仅为草稿" }, { ...principal, scopes: ["project:read"] })).rejects.toMatchObject({ code: "SCOPE_FORBIDDEN" });
    expect(SKILL_CATALOG).toHaveLength(17);
    service.repo.close();
  });

  it("Agent Token 可限制项目、认证并撤销", () => {
    const service = setup();
    const created = service.createAgentConnection({ name: "测试智能体", projectIds: [DEMO_PROJECT_ID], scopes: ["project:read", "artifact:write"] });
    expect(service.authenticate(created.token).projectIds).toEqual([DEMO_PROJECT_ID]);
    expect(service.revokeAgent(created.account.id)).toBe(true);
    expect(() => service.authenticate(created.token)).toThrowError(CommerceError);
    service.repo.close();
  });
});
