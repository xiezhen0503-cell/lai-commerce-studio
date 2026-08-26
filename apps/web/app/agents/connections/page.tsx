import { getCommerceService } from "@lai/shared";
import { Bot, Cable } from "lucide-react";
import { AgentConnectionForm } from "@/components/agent-connection-form";
import { Badge, PageHead, statusLabel, statusTone } from "@/components/ui";
export const dynamic="force-dynamic";
export default function ConnectionsPage(){const connections=getCommerceService().repo.list<any>("agent_connections");return <><PageHead eyebrow="Connections" title="已连接智能体" subtitle="Token 原文不回显；暂停或撤销后，MCP、REST 与 A2A 同时失效。" action={<AgentConnectionForm/>}/><div className="grid-3">{connections.map(connection=><div className="card card-pad" key={connection.id}><div className="row between"><div className="list-icon" style={{background:"var(--jade-soft)",color:"var(--jade)"}}><Bot size={18}/></div><Badge tone={statusTone(connection.status)}>{statusLabel(connection.status)}</Badge></div><h2 style={{margin:"17px 0 7px"}}>{connection.name}</h2><p className="subtitle">{connection.protocol}</p><div className="list-meta" style={{marginTop:15}}>只能访问获准项目 · 所有调用有审计</div><button className="button secondary" style={{width:"100%",marginTop:16}}><Cable size={13}/>测试连接</button></div>)}</div></>}
