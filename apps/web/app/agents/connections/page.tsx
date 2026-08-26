import { getCommerceService } from "@lai/shared";
import { AgentConnectionForm } from "@/components/agent-connection-form";
import { AgentConnectionCard } from "@/components/agent-connection-card";
import { PageHead } from "@/components/ui";
export const dynamic="force-dynamic";
export default function ConnectionsPage(){const connections=getCommerceService().repo.list<any>("agent_connections");return <><PageHead eyebrow="Connections" title="已连接智能体" subtitle="Token 原文不回显；暂停或撤销后，MCP、REST 与 A2A 同时失效。" action={<AgentConnectionForm/>}/><div className="grid-3">{connections.map(connection=><AgentConnectionCard connection={connection} key={connection.id}/>)}</div></>}
