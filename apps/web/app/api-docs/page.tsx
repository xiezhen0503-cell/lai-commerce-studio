import { MCP_PROMPT_NAMES, MCP_TOOL_NAMES } from "@lai/shared";
import { Braces, ExternalLink } from "lucide-react";
import { Badge, PageHead } from "@/components/ui";

export default function ApiDocsPage() {
  const mcpUrl = process.env.MCP_PUBLIC_URL;
  const a2aUrl = process.env.A2A_PUBLIC_URL;
  return <>
    <PageHead eyebrow="Interoperability" title="接口与智能体接入" subtitle="公开工作台当前提供真实 REST API；MCP 与 A2A 只有配置公开服务地址后才会标为在线。" action={<a className="button primary" href="/api/openapi"><Braces size={15}/>下载 OpenAPI</a>}/>
    <div className="grid-3">
      <Protocol title="REST API" badge="当前公网可用" endpoint="/api/v1" note="项目、资料、事实、提示词、成果、审核与智能体 Token 均调用同一真实业务层。" live/>
      <Protocol title="Remote MCP" badge={mcpUrl ? "已配置" : "仅本地开发"} endpoint={mcpUrl || "http://127.0.0.1:3101/mcp"} note={mcpUrl ? `${MCP_TOOL_NAMES.length} 个工具、资源与提示词已开放。` : "协议服务已有可运行代码与测试，但当前公开 Render 链接没有暴露独立 MCP 端口。"} live={Boolean(mcpUrl)}/>
      <Protocol title="A2A 1.0" badge={a2aUrl ? "已配置" : "仅本地开发"} endpoint={a2aUrl || "http://127.0.0.1:3102/.well-known/agent-card.json"} note={a2aUrl ? "Agent Card、消息、任务、Artifact 与流式事件已开放。" : "协议服务已有可运行代码与测试，但当前公开 Render 链接没有暴露独立 A2A 端口。"} live={Boolean(a2aUrl)}/>
    </div>
    <div className="card card-pad" style={{ marginTop: 18, background: "var(--amber-soft)" }}><strong>不把“代码里有”冒充“公网能调”</strong><p className="hint" style={{ marginBottom: 0 }}>小赖通过页面测试不受影响。外部智能体在当前公开链接上应使用 REST API；MCP / A2A 会在部署独立公网服务后自动显示为在线。</p></div>
    <div className="grid-2" style={{ marginTop: 18 }}><div className="card card-pad"><h2>MCP 工具定义</h2><div className="row" style={{ flexWrap: "wrap" }}>{MCP_TOOL_NAMES.map((name) => <Badge tone="gray" key={name}>{name}</Badge>)}</div></div><div className="card card-pad"><h2>可发现提示词定义</h2><div className="row" style={{ flexWrap: "wrap" }}>{MCP_PROMPT_NAMES.map((name) => <Badge tone="indigo" key={name}>{name}</Badge>)}</div></div></div>
  </>;
}

function Protocol({ title, badge, endpoint, note, live }: { title: string; badge: string; endpoint: string; note: string; live: boolean }) {
  return <div className="card card-pad"><div className="row between"><h2 style={{ margin: 0 }}>{title}</h2><Badge tone={live ? "jade" : "gray"}>{badge}</Badge></div><p className="subtitle" style={{ marginTop: 14 }}>{note}</p><div className="mono small" style={{ marginTop: 18, padding: 10, borderRadius: 8, background: "#f1f2f8", wordBreak: "break-all" }}>{endpoint}</div><a className="button secondary" href="/api/openapi" style={{ marginTop: 14 }}><ExternalLink size={13}/>打开接口规范</a></div>;
}
