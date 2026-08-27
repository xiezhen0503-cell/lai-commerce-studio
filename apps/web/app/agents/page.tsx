import Link from "next/link";
import { Bot, FileKey2, ScrollText, ShieldCheck } from "lucide-react";
import { AgentConnectionForm } from "@/components/agent-connection-form";
import { PageHead } from "@/components/ui";
import { getCommerceService } from "@lai/shared";
export const dynamic="force-dynamic";
export default function AgentsPage(){const projects=getCommerceService().listProjects().map(({id,name})=>({id,name}));return <><PageHead eyebrow="Agent Gateway" title="智能体接入中心" subtitle="用普通语言说明能看什么、能做什么、不能做什么，并保留完整审计记录。" action={<AgentConnectionForm projects={projects}/>}/><div className="grid-3">{[["已连接智能体","创建、测试或撤销真实 Token",Bot,"/agents/connections"],["权限管理","查看每个 Token 的真实项目与操作范围",ShieldCheck,"/agents/permissions"],["调用日志","查看工具、输入摘要、成果与 Trace ID",ScrollText,"/agents/logs"]].map(([title,note,Icon,href]:any)=><Link className="card card-pad" href={href} key={title}><div className="list-icon"><Icon size={18}/></div><h2 style={{margin:"18px 0 7px"}}>{title}</h2><p className="subtitle">{note}</p></Link>)}</div><div className="card card-pad" style={{marginTop:18,background:"#222057",color:"white"}}><div className="row"><FileKey2 color="#a9f0d2"/><div><strong style={{fontSize:13}}>当前公开链接真实开放 REST API</strong><div className="list-meta" style={{color:"#b9b8da"}}>MCP 与 A2A 已有可运行服务代码，但未部署公网端口；接口页会如实显示状态。</div></div></div></div></>}
