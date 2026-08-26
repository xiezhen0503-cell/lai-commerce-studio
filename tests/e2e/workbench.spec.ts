import path from "node:path";
import { expect, test } from "@playwright/test";

const accessPath = "/access/e2e-workbench-access";

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
  await expect(page.getByLabel("AI 内容生成工作台")).toContainText("本次使用的资料");
  await page.getByRole("button", { name: /活动方案/ }).click();
  await page.getByLabel("用一句话说说你的要求").fill("为草莓燕麦杯做一份 7 天新品上市方案，价格未确认时必须留空");
  await page.getByRole("button", { name: "帮我生成第一版" }).click();
  await expect(page.getByText("第一版已完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "新品上市方案" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 这次依据了什么" })).toBeVisible();
  await expect(page.getByRole("link", { name: "下载结果" })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制结果" })).toBeVisible();

  await page.getByRole("link", { name: /进入专业模式/ }).click();
  await expect(page.getByRole("heading", { name: "先选业务任务，不从空白提示词开始" })).toBeVisible();
  await page.getByPlaceholder("例如：给这款燕麦杯写一个30秒短视频脚本").fill("为草莓燕麦杯生成30秒短视频脚本，价格未确认时必须留空");
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
  await page.goto("/projects/prj_qingmai_launch");
  await expect(page.getByRole("heading", { name: "青麦脆夏日上新" })).toBeVisible();
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
  await expect(page.getByRole("img", { name: /主图预览/ })).toBeVisible();
  await page.getByRole("button", { name: "视频", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开可播放预览" })).toHaveAttribute("href", /video-preview/);

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

  const storyboardRow = page.locator("li.list-item").filter({ hasText: "五张主图 Storyboard" }).first();
  const xlsxResponse = await page.request.get((await storyboardRow.getByRole("link", { name: "Excel", exact: true }).getAttribute("href"))!);
  expect(xlsxResponse.headers()["content-type"]).toContain("spreadsheetml");
  expect((await xlsxResponse.body()).subarray(0, 2).toString()).toBe("PK");

  const imageRow = page.locator("li.list-item").filter({ hasText: "主图预览" }).first();
  const svgResponse = await page.request.get((await imageRow.getByRole("link", { name: "SVG", exact: true }).getAttribute("href"))!);
  expect(svgResponse.headers()["content-type"]).toContain("image/svg+xml");
  expect(await svgResponse.text()).toContain("<svg");

  const videoRow = page.locator("li.list-item").filter({ hasText: "Remotion 视频草稿" }).first();
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
