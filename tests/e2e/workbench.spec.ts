import path from "node:path";
import { expect, test } from "@playwright/test";

const accessPath = "/access/e2e-workbench-access";

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
  await expect(page.getByText("已解析 e2e-product-sheet.md", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "事实卡", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "当前事实快照", exact: true })).toBeVisible();
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
