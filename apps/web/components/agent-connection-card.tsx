"use client";

import { useState } from "react";
import { Bot, Cable, LoaderCircle, ShieldX } from "lucide-react";
import { Badge, statusLabel, statusTone } from "./ui";

export function AgentConnectionCard({ connection }: { connection: any }) {
  const [status,setStatus]=useState(connection.status);
  const [loading,setLoading]=useState("");
  const [message,setMessage]=useState("");
  const agentId=connection.agentServiceAccountId as string;

  async function testConnection(){
    setLoading("test");setMessage("");
    const response=await fetch(`/api/v1/agents/${agentId}/test`,{method:"POST"});
    const json=await response.json();setLoading("");
    if(response.ok)setMessage(`连接正常：REST、MCP、A2A 可发现，${json.data.discovery.tools} 个工具、${json.data.discovery.prompts} 个提示词。`);
    else setMessage(json.error?.message||"连接测试失败");
  }

  async function revoke(){
    if(!window.confirm(`撤销“${connection.name}”？它的 REST、MCP 和 A2A Token 会立即失效。`))return;
    setLoading("revoke");
    const response=await fetch(`/api/v1/agents/${agentId}/revoke`,{method:"POST"});
    const json=await response.json();setLoading("");
    if(response.ok&&json.data.revoked){setStatus("revoked");setMessage("连接已撤销，旧 Token 已失效。 ");}
    else setMessage(json.error?.message||"撤销失败");
  }

  return <div className="card card-pad"><div className="row between"><div className="list-icon" style={{background:"var(--jade-soft)",color:"var(--jade)"}}><Bot size={18}/></div><Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></div><h2 style={{margin:"17px 0 7px"}}>{connection.name}</h2><p className="subtitle">{connection.protocol}</p><div className="list-meta" style={{marginTop:15}}>只能访问获准项目 · 所有调用有审计</div>{message&&<div className="hint" role="status" style={{marginTop:12}}>{message}</div>}<div className="row" style={{marginTop:16}}><button className="button secondary" style={{flex:1}} onClick={testConnection} disabled={status!=="active"||Boolean(loading)}>{loading==="test"?<LoaderCircle size={13}/>:<Cable size={13}/>}测试连接</button><button className="button secondary" onClick={revoke} disabled={status!=="active"||Boolean(loading)}>{loading==="revoke"?<LoaderCircle size={13}/>:<ShieldX size={13}/>}撤销</button></div></div>;
}
