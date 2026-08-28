import { afterEach, describe, expect, it } from "vitest";
import { CommerceRepository } from "@lai/database";
import { buildGroundedImagePrompt, CommerceService, composeUsableProductImage, DEMO_PROJECT_ID, inspectTextFreeImage, renderChineseTextLayer } from "@lai/shared";

describe("商品图片生成与辅助检查", () => {
  let repository: CommerceRepository | undefined;

  afterEach(() => repository?.close());

  it("把图片模型限制为零文字摄影底图", () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const context = service.makeCompileContext(DEMO_PROJECT_ID, "生成陶渊明主题茶礼盒小红书主图", "creative");
    const { prompt } = buildGroundedImagePrompt(context, false);

    expect(prompt).toContain("CRITICAL ZERO-TEXT RULE");
    expect(prompt).toContain("blank and unprinted");
    expect(prompt).toContain("never copy or render any words");
    expect(prompt).not.toContain("Chinese ecommerce hero image");
  });

  it("使用内置 Noto 字体渲染可被本地中文 OCR 识别的文字", async () => {
    const layer = await renderChineseTextLayer({
      text: "商品创意概念图",
      width: 720,
      height: 110,
      fontSize: 56,
      color: "#111111",
      weight: 700
    });
    const qa = await inspectTextFreeImage(`data:image/png;base64,${layer.toString("base64")}`);

    expect(layer.byteLength).toBeGreaterThan(2_000);
    expect(qa.passed).toBe(false);
    expect(qa.cjkCharacters).toBeGreaterThanOrEqual(2);
    expect(qa.recognizedText.replaceAll(" ", "")).toMatch(/创意|概念/);
  }, 20_000);

  it("纯摄影色块的辅助 OCR 不报告文字", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#eee9df"/><circle cx="320" cy="320" r="180" fill="#98a879"/></svg>';
    const qa = await inspectTextFreeImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);

    expect(qa).toMatchObject({ passed: true, cjkCharacters: 0, alphaNumericCharacters: 0 });
  }, 20_000);

  it("最终合成图固定为 1024 PNG，并记录内置中文字体", async () => {
    repository = new CommerceRepository(":memory:");
    const service = new CommerceService(repository);
    const context = service.makeCompileContext(DEMO_PROJECT_ID, "生成东方茶礼盒创意主图", "creative");
    const base = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#efe9dc"/><rect x="360" y="170" width="310" height="520" rx="52" fill="#9dac7c"/></svg>';
    const composed = await composeUsableProductImage(`data:image/svg+xml;base64,${Buffer.from(base).toString("base64")}`, context);
    const bytes = Buffer.from(composed.assetUri.split(",")[1] || "", "base64");

    expect(composed.assetUri).toMatch(/^data:image\/png;base64,/);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    expect(composed.overlayFont).toContain("Noto Sans SC");
  }, 20_000);
});
