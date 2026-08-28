import fs from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { inspectPlayableMp4, renderCommercePoster, renderCommerceVideo } from "../../apps/web/app/api/_lib/video-render";

const runRealRender = process.env.RUN_VIDEO_RENDER_TESTS === "true";

describe.skipIf(!runRealRender)("真实视频渲染验收", () => {
  test("生成带中文字体、H.264 轨道和完整 MP4 容器的可播放视频", async () => {
    const spec = {
      template: "SellingPoint15" as const,
      props: {
        brandName: "跨平台中文字体",
        product: "真实商品视频",
        specification: "规格待确认",
        cta: "查看商品详情",
        headline: "这是实际 MP4 文件",
        subheadline: "不是预览配置，也不是网页动画",
        brandColor: "#242064",
        accentColor: "#a9f0d2",
        factSnapshotId: "snapshot_video_render_test"
      }
    };
    const videoPath = await renderCommerceVideo(spec, { frameRange: [0, 59] });
    const posterPath = await renderCommercePoster(spec);
    const qa = await inspectPlayableMp4(videoPath);
    const poster = await fs.readFile(posterPath);

    expect(qa).toMatchObject({ passed: true, hasFtyp: true, hasMovieIndex: true, hasMediaData: true, hasH264Track: true });
    expect(poster.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }, 180_000);
});
