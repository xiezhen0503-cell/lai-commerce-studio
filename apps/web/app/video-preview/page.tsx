import Link from "next/link";
import { CommerceVideoPlayer } from "@/components/video-player";
import { PageHead } from "@/components/ui";

export default async function VideoPreviewPage({ searchParams }: { searchParams: Promise<{ template?: "SellingPoint15" | "Ugc30" | "Promo30" }> }) {
  const { template } = await searchParams;
  return <>
    <PageHead
      eyebrow="Remotion Studio"
      title="商品视频工作室"
      subtitle="这里播放与服务端 MP4 相同的 Remotion 模板。实际生成时，工作台会使用你的资料、已确认事实、文案和商品图渲染成片。"
      action={<Link className="button primary" href="/">返回 AI 工作台</Link>}
    />
    <div className="grid-2">
      <div className="card card-pad" style={{ display: "grid", placeItems: "center", background: "#ebeaf5" }}><CommerceVideoPlayer template={template}/></div>
      <div className="stack">
        <div className="card card-pad"><h2>可真实下载的文件</h2><ul className="list"><li className="list-item"><strong>H.264 MP4 成片</strong></li><li className="list-item"><strong>PNG 视频封面</strong></li><li className="list-item"><strong>SRT 字幕文件</strong></li><li className="list-item"><strong>JSON / ZIP 项目资料</strong></li></ul></div>
        <div className="card card-pad"><h2>事实与安全区</h2><p className="subtitle">规格、价格、活动时间等文字只会使用资料中已确认的事实；缺失信息不会自动补造。9:16 安全区、字幕、CTA 和中文排版由程序稳定渲染。</p></div>
        <div className="card card-pad" style={{ background: "var(--jade-soft)" }}><strong>怎么生成自己的视频</strong><p className="hint" style={{ marginBottom: 0 }}>回到 AI 工作台，上传自己的商品资料，选择“视频成片”并生成；完成后可直接播放和下载 MP4。</p></div>
      </div>
    </div>
  </>;
}
