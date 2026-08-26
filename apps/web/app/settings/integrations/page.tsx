import { providerRegistry } from "@lai/providers";
import { PlugZap } from "lucide-react";
import { Badge, PageHead } from "@/components/ui";
export const dynamic="force-dynamic";
export default function IntegrationsPage(){const providers=Object.entries(providerRegistry);return <><PageHead eyebrow="Providers" title="模型与外部服务" subtitle="所有第三方能力都在适配器后面；未配置时明确显示，不会伪装成已连接。"/><div className="grid-3">{providers.map(([key,provider]:any)=><div className="card card-pad" key={key}><div className="row between"><div className="list-icon"><PlugZap size={17}/></div><Badge tone={provider.configured?"jade":"gray"}>{provider.configured?"已可用":"未配置"}</Badge></div><h2 style={{margin:"17px 0 7px"}}>{provider.name}</h2><p className="subtitle">{key.startsWith("mock")||provider.name?.startsWith("mock")?"本地可预测演示 Provider":"可选外部适配器，密钥只保存在服务端"}</p><button className="button secondary" style={{marginTop:16}}>{provider.configured?"测试连接":"配置"}</button></div>)}</div></>}
