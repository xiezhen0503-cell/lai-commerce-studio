import { getCommerceService } from "@lai/shared";
import { AgentConnectionForm } from "@/components/agent-connection-form";
import { AgentConnectionCard } from "@/components/agent-connection-card";
import { PageHead } from "@/components/ui";
export const dynamic="force-dynamic";
export default function ConnectionsPage(){const service=getCommerceService();const connections=service.repo.list<any>("agent_connections");const projects=service.listProjects().map(({id,name})=>({id,name}));return <><PageHead eyebrow="Connections" title="已连接智能体" subtitle="Token 原文不回显；撤销后，所有使用该 Token 的接口会立即拒绝访问。" action={<AgentConnectionForm projects={projects}/>}/>{connections.length?<div className="grid-3">{connections.map(connection=><AgentConnectionCard connection={connection} key={connection.id}/>)}</div>:<div className="card empty"><strong>还没有连接任何智能体</strong><p>先创建项目，再按项目签发一次性 Token。</p></div>}</>}
