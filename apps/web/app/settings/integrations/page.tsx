import Link from "next/link";
import { providerRegistry } from "@lai/providers";
import { PlugZap } from "lucide-react";
import { Badge, PageHead } from "@/components/ui";
export const dynamic="force-dynamic";
export default function IntegrationsPage(){const providers=Object.entries(providerRegistry);return <><PageHead eyebrow="Providers" title="模型与外部服务" subtitle="所有第三方能力都在适配器后面；真实、本地确定性、演示替代和未配置状态明确分开。"/><div className="grid-3">{providers.map(([key,provider]:any)=>{const demo=provider.name?.startsWith("mock");const local=provider.name?.startsWith("local")||provider.name?.startsWith("deterministic")||key==="remotion";const label=!provider.configured?"未配置":demo?"演示替代":local?"本地真实能力":"已连接";return <div className="card card-pad" key={key}><div className="row between"><div className="list-icon"><PlugZap size={17}/></div><Badge tone={!provider.configured?"gray":demo?"amber":"jade"}>{label}</Badge></div><h2 style={{margin:"17px 0 7px"}}>{provider.name}</h2><p className="subtitle">{demo?"保证完整演示流程，但不冒充外部生成服务。":local?"无需外部密钥，服务器会真实执行解析或确定性渲染。":"外部适配器已配置，凭证只保存在服务端。"}</p><Link className="button secondary" href="/api-docs" style={{marginTop:16}}>查看接入与能力说明</Link></div>})}</div></>}
