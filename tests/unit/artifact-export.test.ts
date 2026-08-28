import JSZip from "jszip";
import { describe, expect, test } from "vitest";
import { artifactExportFormats, buildArtifactExport } from "../../apps/web/app/api/_lib/artifact-export";

function input(type: string, content: string) {
  return {
    artifact: {
      id: `artifact_${type}`,
      projectId: "project_export_test",
      type,
      title: `中文${type}成果`,
      currentVersion: 2,
      factSnapshotId: "snapshot_export_test",
      status: "draft"
    },
    version: {
      id: `version_${type}`,
      artifactId: `artifact_${type}`,
      version: 2,
      content,
      factSnapshotId: "snapshot_export_test",
      changeSummary: "导出测试",
      createdBy: "test",
      createdAt: "2026-08-26T00:00:00.000Z"
    }
  };
}

describe("成果类型化下载", () => {
  test("文本成果可下载真实 DOCX，并在 JSON 中保留版本和事实快照", async () => {
    const source = input("proposal", "# 新品上市方案\n\n活动价待人工确认。");
    const docx = await buildArtifactExport(source, "docx");
    expect(docx.extension).toBe("docx");
    expect(docx.bytes.subarray(0, 2).toString()).toBe("PK");

    const json = JSON.parse((await buildArtifactExport(source, "json")).bytes.toString("utf8"));
    expect(json.artifact).toMatchObject({ id: "artifact_proposal", currentVersion: 2, factSnapshotId: "snapshot_export_test" });
    expect(json.version).toMatchObject({ version: 2, factSnapshotId: "snapshot_export_test" });
  });

  test("结构化成果可下载真实 XLSX 与带 BOM 的 CSV", async () => {
    const source = input("storyboard", JSON.stringify([{ index: 1, headline: "早八早餐", overlay: "规格 50 克" }]));
    const xlsx = await buildArtifactExport(source, "xlsx");
    expect(xlsx.bytes.subarray(0, 2).toString()).toBe("PK");
    expect(xlsx.contentType).toContain("spreadsheetml");
    const csv = await buildArtifactExport(source, "csv");
    expect(csv.bytes.toString("utf8")).toContain("﻿index,headline,overlay");
  });

  test("图片下载原生资产，视频同时支持 MP4 与可编辑项目包", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>主图预览</text></svg>';
    const image = await buildArtifactExport(input("image", JSON.stringify({ assetUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` })), "svg");
    expect(image.bytes.toString("utf8")).toContain("<svg");
    const original = await buildArtifactExport(input("image", JSON.stringify({ assetUri: `data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10]).toString("base64")}` })), "original");
    expect(original).toMatchObject({ contentType: "image/png", extension: "png", format: "original" });
    expect(artifactExportFormats("image")).toContain("original");

    const video = await buildArtifactExport(input("video", JSON.stringify({ template: "Promo30", props: { product: "燕麦杯", specification: "50克×6杯" } })), "zip");
    const archive = await JSZip.loadAsync(video.bytes);
    expect(Object.keys(archive.files)).toEqual(expect.arrayContaining(["README.md", "remotion-project.json", "preview.html"]));
    expect(await archive.file("README.md")!.async("string")).toContain("MP4 成片");
    expect(artifactExportFormats("video")).toEqual(expect.arrayContaining(["mp4", "png", "srt", "zip", "json"]));
  });
});
