import Link from "next/link";
import { providerRegistry } from "@lai/providers";
import { PlugZap } from "lucide-react";
import { Badge, PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  const providers = Object.entries(providerRegistry).filter(([, provider]: any) => !provider.name?.startsWith("mock"));
  return <>
    <PageHead eyebrow="Providers" title="模型与外部服务" subtitle="只展示真实能力与明确未配置的外部适配器；Mock 不会出现在生产功能中。"/>
    <div className="grid-3">{providers.map(([key, provider]: any) => {
      const local = provider.name?.startsWith("local") || provider.name?.startsWith("deterministic") || key === "remotion";
      const label = !provider.configured ? "未配置" : local ? "本地真实能力" : "已连接";
      return <div className="card card-pad" key={key}>
        <div className="row between"><div className="list-icon"><PlugZap size={17}/></div><Badge tone={!provider.configured ? "gray" : "jade"}>{label}</Badge></div>
        <h2 style={{margin:"17px 0 7px"}}>{provider.name}</h2>
        <p className="subtitle">{!provider.configured ? "这个适配器尚未接入，不会在生产入口中伪装成可用。" : local ? "服务器会真实执行解析、合成或渲染。" : "外部适配器已配置，凭证只保存在服务端。"}</p>
        <Link className="button secondary" href="/api-docs" style={{marginTop:16}}>查看接入与能力说明</Link>
      </div>;
    })}</div>
  </>;
}
