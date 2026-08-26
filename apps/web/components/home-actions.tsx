"use client";
import { useState } from "react";
import { ArrowRight, LoaderCircle, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export function IntentBar() {
  const [value,setValue] = useState("帮我做一个有事实依据的新品上市方案");
  const [loading,setLoading] = useState(false);
  const router = useRouter();
  async function go() {
    setLoading(true);
    const response = await fetch("/api/v1/prompts/generate", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ projectId:"prj_qingmai_launch", objective:value }) });
    setLoading(false);
    if (response.ok) router.push(`/prompt-lab?projectId=prj_qingmai_launch&objective=${encodeURIComponent(value)}&ready=1`);
  }
  return <div className="intent-bar"><input aria-label="一句话描述今天想做什么" value={value} onChange={(event)=>setValue(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter") void go();}}/><button className="button primary" onClick={go} disabled={loading}>{loading?<LoaderCircle size={16} className="animate-spin"/>:<ArrowRight size={16}/>}整理任务</button></div>;
}

export function CampaignButton() {
  const [status,setStatus] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [message,setMessage] = useState("");
  const router = useRouter();
  async function create() {
    setStatus("loading");
    const response = await fetch("/api/v1/campaigns", { method:"POST", headers:{"content-type":"application/json","idempotency-key":`home-${Date.now()}`}, body:JSON.stringify({projectId:"prj_qingmai_launch",objective:"一键生成整套新品上市活动"}) });
    const json = await response.json();
    if (!response.ok) { setStatus("error"); setMessage(json.error?.message || "生成失败"); return; }
    setStatus("done"); setMessage(`已生成 ${json.data.artifactIds.length} 项内容，等待人工复核`);
    setTimeout(()=>router.push("/projects/prj_qingmai_launch"),1000);
  }
  return <><button className="button jade" style={{width:"100%"}} onClick={create} disabled={status==="loading"}>{status==="loading"?<LoaderCircle size={16}/>:<PackageCheck size={16}/>} {status==="loading"?"正在建立整套内容…":"开始生成整套活动"}</button>{message&&<div className="toast">{message}</div>}</>;
}
