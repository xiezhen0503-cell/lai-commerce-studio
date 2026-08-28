import path from "node:path";
import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";

const accessPath = "/access/e2e-workbench-access";

function dataIdFromExportHref(href: string | null) {
  const id = href?.match(/\/artifacts\/([^/]+)\/export/)?.[1];
  if (!id) throw new Error(`无法从下载链接识别成果 ID：${href}`);
  return id;
}

async function createIsolatedProject(page: import("@playwright/test").Page, suffix: string) {
  const response = await page.request.post("/api/v1/projects", {
    data: {
      name: `商业 Demo 验收 ${suffix}`,
      type: "新品上市",
      brandId: "brand_wuqinggu",
      productIds: ["product_qingmaicui"],
      objective: "验证资料上传到成果审核导出的完整商业链路",
      businessGoal: "工程验收",
      targetPlatforms: ["小红书", "抖音"],
      targetAudience: "商业 Demo 测试用户"
    }
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data.id as string;
}

test("新手工作台可以从一句话生成第一版内容", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "请使用小赖的专属测试链接" })).toBeVisible();
  const unauthorized = await page.request.post("/api/v1/workbench/generate", {
    data: {
      projectId: "prj_qingmai_launch",
      objective: "验证没有专属访问凭证时不能调用生成模型",
      task: "single",
      artifactType: "script"
    }
  });
  expect(unauthorized.status()).toBe(401);

  await page.goto(accessPath);
  await expect(page.getByRole("heading", { name: /不用学提示词/ })).toBeVisible();
  await expect(page.getByLabel("当前 AI 模型")).toContainText(/Codex|免费测试模型|演示模式/);
  await expect(page.getByLabel("AI 内容生成工作台")).toContainText(/本次使用的资料|本次创作上下文/);
  const creativeProjectId = await createIsolatedProject(page, `无资料自由创作-${Date.now()}`);
  const creativeResponse = await page.request.post("/api/v1/workbench/generate", {
    data: {
      projectId: creativeProjectId,
      objective: "为一款东方茶饮设计小红书新品创意，不使用任何参考资料",
      task: "single",
      artifactType: "proposal",
      generationMode: "creative"
    }
  });
  expect(creativeResponse.status()).toBe(201);
  const creativeJson = await creativeResponse.json();
  expect(creativeJson.data.prompt.spec.variables.generationMode).toBe("creative");
  expect(creativeJson.data.prompt.spec.sourceDocumentIds).toEqual([]);
  await page.getByRole("button", { name: /自由创作/ }).click();
  await expect(page.getByRole("button", { name: /自由创作/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/无需资料|具体商品事实统一标为待确认/).first()).toBeVisible();
  await page.getByRole("button", { name: /活动方案/ }).click();
  await page.getByLabel("用一句话说说你的要求").fill("为草莓燕麦杯做一份 7 天新品上市方案，价格未确认时必须留空");
  await page.getByRole("button", { name: "帮我生成第一版" }).click();
  await expect(page.getByText("第一版已完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新品上市方案", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 这次依据了什么" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载结果" })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制结果" })).toBeVisible();

  await page.getByRole("button", { name: /短视频脚本/ }).click();
  await page.getByLabel("用一句话说说你的要求").fill("写一条 30 秒短视频脚本，必须包含画面、口播、字幕和三个开场版本");
  await page.getByRole("button", { name: "帮我生成第一版" }).click();
  await expect(page.getByRole("heading", { name: "A/B/C 前 3 秒开场" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "30 秒逐镜头脚本" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("成果质量分", { exact: true })).toBeVisible();
  await expect(page.getByText("executiveSummary", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /AI 商品图/ }).click();
  await page.getByLabel("用一句话说说你的要求").fill("生成一张方形商品主图，不要编造价格、规格和功效文字");
  await page.getByRole("button", { name: "帮我生成第一版" }).click();
  await expect(page.getByRole("img", { name: "AI 生成并完成中文信息排版的商品主图" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载原图" })).toBeVisible();

  await page.getByRole("link", { name: /进入专业模式/ }).click();
  await expect(page.getByRole("heading", { name: "先选业务任务，不从空白提示词开始" })).toBeVisible();
  await page.getByPlaceholder("例如：根据我上传的资料写一个30秒短视频脚本").fill("为草莓燕麦杯生成30秒短视频脚本，价格未确认时必须留空");
  await page.getByRole("button", { name: "生成专业提示词" }).click();
  await expect(page.getByRole("heading", { name: "提示词结果" })).toBeVisible();
  await expect(page.getByText("同一事实快照", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "保存为模板" }).click();
  await expect(page.getByText("已保存模板", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "交给其他智能体" }).click();
  await expect(page.getByText("交接包已创建", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "立即运行" }).click();
  await expect(page.getByText("演示模式 生成成果草稿", { exact: false })).toBeVisible();
});

test("项目事实和 API 文档页面可访问", async ({ page }) => {
  await page.goto(accessPath);
  const projectId = await createIsolatedProject(page, `事实与接口-${Date.now()}`);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: /商业 Demo 验收 事实与接口/ })).toBeVisible();
  const uploadResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/sources"));
  await page.getByLabel("上传项目资料").setInputFiles(path.resolve("tests/fixtures/e2e-product-sheet.md"));
  expect((await uploadResponse).ok()).toBeTruthy();
  await expect(page.getByRole("status")).toContainText("已解析 1 份资料", { timeout: 15_000 });
  await expect(page.getByText("e2e-product-sheet.md", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "事实卡", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "当前事实快照", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "总览", exact: true }).click();
  await page.getByRole("button", { name: "生成整套活动" }).click();
  await expect(page.getByText("整套活动已生成", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText("已提交人工审核", { exact: true })).toBeVisible();
  await page.goto("/api-docs");
  await expect(page.getByRole("heading", { name: "接口与智能体接入", exact: true })).toBeVisible();
  const response = await page.request.get("/api/v1/health");
  expect(response.ok()).toBeTruthy();
  const health = await response.json();
  expect(health.data.providers.text).toMatchObject({ mode: "mock", model: "mock-text-v1", live: false });
});

test("商业 Demo 的资料、事实、版本、图片、视频、审核和导出均可操作", async ({ page }, testInfo) => {
  test.slow();
  const fileName = `商业验收-${testInfo.project.name}.md`;
  await page.goto(accessPath);
  const projectId = await createIsolatedProject(page, `${testInfo.project.name}-${Date.now()}`);
  await page.goto(`/projects/${projectId}`);
  await page.getByLabel("上传项目资料").setInputFiles({
    name: fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from("商品名称：商业验收燕麦杯\n规格：50克×6杯\n活动价：29.9元\n活动时间：2026-10-01 至 2026-10-07\n主要配料：燕麦片、草莓粒", "utf8")
  });
  await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 15_000 });

  const textPreview = page.getByRole("link", { name: `查看解析正文 ${fileName}` });
  const previewHref = await textPreview.getAttribute("href");
  expect(previewHref).toBeTruthy();
  const previewResponse = await page.request.get(previewHref!);
  expect(previewResponse.ok()).toBeTruthy();
  expect(await previewResponse.text()).toContain("活动价：29.9元");

  await page.getByRole("button", { name: "事实卡", exact: true }).click();
  const extractedPrice = page.locator("section.pane .fact-card").filter({ hasText: "活动价" }).filter({ hasText: "29.9" }).first();
  await expect(extractedPrice).toBeVisible();
  await extractedPrice.getByRole("button", { name: "人工确认" }).click();
  await expect(page.getByText("活动价已确认", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "总览", exact: true }).click();
  await page.getByRole("button", { name: "生成整套活动" }).click();
  await expect(page.getByText("整套活动已生成", { exact: false })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "图片", exact: true }).click();
  await expect(page.locator("img").last()).toBeVisible();
  await page.getByRole("button", { name: "视频", exact: true }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect(page.getByRole("link", { name: "下载 MP4" })).toHaveAttribute("href", /format=mp4/);
  const videoArtifactId = dataIdFromExportHref(await page.getByRole("link", { name: "下载 MP4" }).getAttribute("href"));
  const mp4Response = await page.request.get(`/api/v1/artifacts/${videoArtifactId}/export?format=mp4`);
  if (!mp4Response.ok()) throw new Error(`MP4 下载失败（${mp4Response.status()}）：${await mp4Response.text()}`);
  expect(mp4Response.headers()["content-type"]).toContain("video/mp4");
  expect(mp4Response.headers()["content-disposition"]).toContain("attachment");
  const mp4 = await mp4Response.body();
  expect(mp4.byteLength).toBeGreaterThan(16_384);
  expect(mp4.subarray(4, 8).toString("ascii")).toBe("ftyp");
  expect(mp4.includes(Buffer.from("moov"))).toBe(true);
  expect(mp4.includes(Buffer.from("mdat"))).toBe(true);
  expect(mp4.includes(Buffer.from("avc1"))).toBe(true);
  const rangeResponse = await page.request.get(`/api/v1/artifacts/${videoArtifactId}/export?format=mp4&inline=1`, { headers: { range: "bytes=0-1023" } });
  expect(rangeResponse.status()).toBe(206);
  expect(rangeResponse.headers()["content-range"]).toMatch(/^bytes 0-1023\//);
  expect(rangeResponse.headers()["content-disposition"]).toContain("inline");

  await page.getByRole("button", { name: "方案", exact: true }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const editor = page.locator("textarea").last();
  await editor.fill("# 人工修订商业验收方案\n\n这段内容由测试用户保存，用于验证版本化编辑。 ");
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(page.getByText("人工修改已保存为", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText("已提交人工审核", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "复核", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept("商业 Demo 工程验收"));
  await page.getByRole("button", { name: "批准", exact: true }).first().click();
  await expect(page.getByText("成果已批准", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "导出", exact: true }).click();
  const proposalRow = page.locator("li.list-item").filter({ hasText: "新品上市方案" }).first();
  const markdownHref = await proposalRow.getByRole("link", { name: "Markdown", exact: true }).getAttribute("href");
  const markdownResponse = await page.request.get(markdownHref!);
  expect(markdownResponse.ok()).toBeTruthy();
  expect(markdownResponse.headers()["content-type"]).toContain("text/markdown");
  expect(await markdownResponse.text()).toContain("人工修订商业验收方案");
  const wordLink = proposalRow.getByRole("link", { name: "Word", exact: true });
  const docxResponse = await page.request.get((await wordLink.getAttribute("href"))!);
  expect(docxResponse.headers()["content-type"]).toContain("wordprocessingml");
  expect((await docxResponse.body()).subarray(0, 2).toString()).toBe("PK");
  const downloadEvent = page.waitForEvent("download");
  await wordLink.click();
  const downloadedWord = await downloadEvent;
  expect(await downloadedWord.failure()).toBeNull();
  expect(downloadedWord.suggestedFilename()).toMatch(/\.docx$/);
  expect((await fs.readFile((await downloadedWord.path())!)).subarray(0, 2).toString()).toBe("PK");

  const storyboardRow = page.locator("li.list-item").filter({ hasText: "五张主图 Storyboard" }).first();
  const xlsxResponse = await page.request.get((await storyboardRow.getByRole("link", { name: "Excel", exact: true }).getAttribute("href"))!);
  expect(xlsxResponse.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsxResponse.body()).subarray(0, 2).toString()).toBe("PK");

  const imageRow = page.locator("li.list-item").filter({ hasText: "本地构图预览" }).first();
  const svgResponse = await page.request.get((await imageRow.getByRole("link", { name: "原图", exact: true }).getAttribute("href"))!);
  expect(svgResponse.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svgResponse.text()).toContain("<svg");

  const videoRow = page.locator("li.list-item").filter({ hasText: "可下载 MP4 商品视频" }).first();
  const posterResponse = await page.request.get((await videoRow.getByRole("link", { name: "PNG 封面", exact: true }).getAttribute("href"))!);
  expect(posterResponse.headers()["content-type"]).toContain("image/png");
  expect((await posterResponse.body()).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const subtitleResponse = await page.request.get((await videoRow.getByRole("link", { name: "SRT 字幕", exact: true }).getAttribute("href"))!);
  expect(subtitleResponse.headers()["content-type"]).toContain("application/x-subrip");
  expect(await subtitleResponse.text()).toContain("00:00:00,000 -->");
  const videoZipResponse = await page.request.get((await videoRow.getByRole("link", { name: "项目包 ZIP", exact: true }).getAttribute("href"))!);
  expect(videoZipResponse.headers()["content-type"]).toContain("application/zip");
  expect((await videoZipResponse.body()).subarray(0, 2).toString()).toBe("PK");

  const allZipResponse = await page.request.get((await page.getByRole("link", { name: "下载全部 ZIP", exact: true }).getAttribute("href"))!);
  expect(allZipResponse.headers()["content-type"]).toContain("application/zip");
  expect((await allZipResponse.body()).subarray(0, 2).toString()).toBe("PK");

  await page.getByRole("button", { name: "资料", exact: true }).click();
  const sourceRow = page.locator("li.list-item").filter({ hasText: fileName });
  page.once("dialog", (dialog) => dialog.accept());
  await sourceRow.getByRole("button", { name: `删除 ${fileName}` }).click();
  await expect(page.getByText(`已删除 ${fileName}`, { exact: false })).toBeVisible();
});
