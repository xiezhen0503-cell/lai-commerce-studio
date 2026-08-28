"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Bot, Check, ChevronRight, Download, Eye, FileText, LoaderCircle, Pencil, Play, RefreshCcw, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, UploadCloud, X } from "lucide-react";
import { Badge, statusLabel, statusTone } from "./ui";

const tabs = ["总览","资料","事实卡","任务简报","提示词","方案","脚本","图片","视频","复核","智能体协作","导出"] as const;
type Tab = (typeof tabs)[number];

const artifactTypesByTab: Partial<Record<Tab,string[]>> = {
  方案:["proposal"],脚本:["script","caption"],图片:["image","storyboard","image-prompt"],视频:["video","video-storyboard"]
};

const exportOptions:Record<string,Array<[string,string]>>={
  proposal:[["Markdown","md"],["Word","docx"],["HTML","html"],["TXT","txt"],["JSON","json"]],script:[["Markdown","md"],["Word","docx"],["HTML","html"],["TXT","txt"],["JSON","json"]],"image-prompt":[["Markdown","md"],["Word","docx"],["HTML","html"],["TXT","txt"],["JSON","json"]],caption:[["Markdown","md"],["Word","docx"],["HTML","html"],["TXT","txt"],["JSON","json"]],report:[["Markdown","md"],["Word","docx"],["HTML","html"],["TXT","txt"],["JSON","json"]],prompt:[["Markdown","md"],["Word","docx"],["HTML","html"],["TXT","txt"],["JSON","json"]],storyboard:[["JSON","json"],["Excel","xlsx"],["CSV","csv"],["Word","docx"]],"video-storyboard":[["JSON","json"],["Excel","xlsx"],["CSV","csv"],["Word","docx"]],schedule:[["JSON","json"],["Excel","xlsx"],["CSV","csv"],["Word","docx"]],handoff:[["JSON","json"],["Excel","xlsx"],["CSV","csv"],["Word","docx"]],image:[["原图","original"],["生成记录","json"]],video:[["MP4 成片","mp4"],["PNG 封面","png"],["SRT 字幕","srt"],["项目包 ZIP","zip"],["配置 JSON","json"]]
};

export function ProjectWorkspace({ initial }: { initial: any }) {
  const [data,setData]=useState(initial);
  const [selected,setSelected]=useState<any>(initial.artifacts?.[0]);
  const [activeTab,setActiveTab]=useState<Tab>("总览");
  const [loading,setLoading]=useState("");
  const [toast,setToast]=useState("");
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState("");

  const projectId=initial.project.id as string;
  const snapshot=data.snapshots?.find((item:any)=>item.id===data.project.currentFactSnapshotId)||data.snapshots?.[0];
  const version=useMemo(()=>data.artifactVersions?.find((item:any)=>item.artifactId===selected?.id&&item.version===selected?.currentVersion)||selected?.version,[selected,data.artifactVersions]);
  const pendingFacts=data.facts.filter((fact:any)=>["missing","conflicting","expired"].includes(fact.status));
  const groundedFacts=data.facts.filter((fact:any)=>["verified","user-confirmed"].includes(fact.status));
  const sourcedFacts=groundedFacts.filter((fact:any)=>fact.sourceDocumentId||fact.confirmedByUser);
  const coverage=groundedFacts.length?Math.round(sourcedFacts.length/groundedFacts.length*100):0;

  useEffect(()=>{setDraft(version?.content||"");setEditing(false);},[selected?.id,selected?.currentVersion,version?.content]);
  useEffect(()=>{const notice=sessionStorage.getItem("lai-project-notice");if(notice){setToast(notice);sessionStorage.removeItem("lai-project-notice");}},[]);

  async function refresh(preferredArtifactId?:string){
    const response=await fetch(`/api/v1/projects/${projectId}`);
    const json=await response.json();
    if(!response.ok){setToast(json.error?.message||"项目刷新失败");return;}
    setData(json.data);
    setSelected((current:any)=>json.data.artifacts.find((item:any)=>item.id===(preferredArtifactId||current?.id))||json.data.artifacts[0]);
  }

  function showTab(tab:Tab){
    setActiveTab(tab);
    const types=artifactTypesByTab[tab];
    if(types){const next=types.map((type)=>data.artifacts.find((artifact:any)=>artifact.type===type)).find(Boolean);if(next)setSelected(next);}
  }

  async function confirm(fact:any){
    setLoading(fact.id);
    const value=fact.value||window.prompt(`请填写${fact.type}`)||"";
    if(!value){setLoading("");return;}
    const response=await fetch(`/api/v1/projects/${projectId}/facts/${fact.id}/confirm`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({value})});
    const json=await response.json();setLoading("");
    if(response.ok){setToast(`${fact.type}已确认，并建立新事实快照`);await refresh();}else setToast(json.error?.message||"事实确认失败");
  }

  async function bundle(){
    setLoading("bundle");
    const response=await fetch("/api/v1/campaigns",{method:"POST",headers:{"content-type":"application/json","idempotency-key":`project-${Date.now()}`},body:JSON.stringify({projectId})});
    const json=await response.json();setLoading("");
    if(response.ok){await refresh(json.data.artifactIds?.[0]);setToast(`整套活动已生成 ${json.data.artifactIds?.length||0} 项；高风险字段仍需人工审核`);}else setToast(json.error?.message||"整套活动生成失败");
  }

  async function review(){
    if(!selected)return;
    setLoading("review");
    const response=await fetch("/api/v1/reviews",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,artifactId:selected.id})});
    const json=await response.json();setLoading("");
    if(response.ok){setToast("已提交人工审核");await refresh(selected.id);}else setToast(json.error?.message||"提交审核失败");
  }

  async function upload(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files||[]);event.target.value="";if(!files.length)return;
    setActiveTab("资料");let completed=0;let extracted=0;const failures:string[]=[];
    for(const file of files){
      setLoading(`upload:${file.name}`);
      const form=new FormData();form.set("file",file);
      const response=await fetch(`/api/v1/projects/${projectId}/sources`,{method:"POST",body:form});
      const json=await response.json();
      if(response.ok){completed+=1;extracted+=json.data.facts?.length||0;}else failures.push(`${file.name}：${json.error?.message||json.data?.source?.error||"上传失败"}`);
    }
    setLoading("");setToast(failures.length?`成功 ${completed} 份；${failures.join("；")}`:`已解析 ${completed} 份资料，提取 ${extracted} 条事实候选`);await refresh();
  }

  async function reprocess(source:any){
    setLoading(`source:${source.id}`);
    const response=await fetch(`/api/v1/projects/${projectId}/sources/${source.id}/reprocess`,{method:"POST"});
    const json=await response.json();setLoading("");
    if(response.ok){setToast(`已重新解析 ${source.fileName}，提取 ${json.data.facts?.length||0} 条事实候选`);await refresh();}else setToast(json.error?.message||json.data?.source?.error||"重新解析失败");
  }

  async function removeSource(source:any){
    if(!window.confirm(`删除“${source.fileName}”？由它支持且尚未人工确认的事实会标记为已过期。`))return;
    setLoading(`source:${source.id}`);
    const response=await fetch(`/api/v1/projects/${projectId}/sources/${source.id}`,{method:"DELETE"});
    const json=await response.json();setLoading("");
    if(response.ok){setToast(`已删除 ${source.fileName}，相关成果已标记为可能过期`);await refresh();}else setToast(json.error?.message||"资料删除失败");
  }

  async function saveArtifact(){
    if(!selected||!draft.trim())return;
    setLoading("save");
    const response=await fetch(`/api/v1/projects/${projectId}/artifacts/${selected.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({content:draft})});
    const json=await response.json();setLoading("");
    if(response.ok){setToast(`人工修改已保存为 v${json.data.version}`);setEditing(false);await refresh(selected.id);}else setToast(json.error?.message||"保存失败");
  }

  async function restore(versionId:string){
    if(!selected)return;setLoading(versionId);
    const response=await fetch(`/api/v1/projects/${projectId}/artifacts/${selected.id}/versions/${versionId}/restore`,{method:"POST"});
    const json=await response.json();setLoading("");
    if(response.ok){setToast(`已恢复为新版本 v${json.data.version}`);await refresh(selected.id);}else setToast(json.error?.message||"恢复版本失败");
  }

  async function decide(reviewItem:any,decision:"approved"|"rejected"){
    const note=window.prompt(decision==="approved"?"批准备注（可留空）":"请填写驳回原因")||"";
    if(decision==="rejected"&&!note)return;
    setLoading(`review:${reviewItem.id}`);
    const response=await fetch(`/api/v1/reviews/${reviewItem.id}/decision`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision,note})});
    const json=await response.json();setLoading("");
    if(response.ok){setToast(decision==="approved"?"成果已批准":"成果已驳回并保留原版本");await refresh(selected?.id);}else setToast(json.error?.message||"审核操作失败");
  }

  function ArtifactView(){
    if(!selected)return <div className="editor" style={{display:"grid",placeItems:"center",textAlign:"center"}}><div><Sparkles size={36} color="var(--indigo)" style={{margin:"0 auto 14px"}}/><h2>从同一事实快照开始生产</h2><p className="subtitle">先上传资料、确认事实，再生成方案、脚本、图片规划和视频草稿。</p></div></div>;
    if(selected.type==="image"&&!editing){
      try{
        const image=JSON.parse(version?.content||"{}");
        if(image.assetUri){
          const real=Boolean(image.metadata?.externalGeneration);
          const warnings=Array.isArray(image.production?.warnings)?image.production.warnings:[];
          const legacyRealImage=real&&image.metadata?.imagePipelineVersion!=="image-v2-font-ocr";
          if(legacyRealImage)return <div className="card-pad"><div className="card" style={{padding:22,background:"#fff7ed",border:"1px solid #fdba74"}}><div className="eyebrow">旧版图片已停止交付</div><h2>这张图没有经过中文字体和乱码质检</h2><p className="subtitle">它是修复前保存的历史结果，不会自动变成新版。请回到 AI 工作台重新选择“AI 商品图”生成；新版本会使用内置中文字体，并自动拒收带有伪文字的底图。</p><Link className="button primary" href="/" style={{marginTop:12}}>返回 AI 工作台重新生成</Link><details style={{marginTop:16}}><summary className="small muted">仅查看旧图（不可作为验收结果）</summary><img src={image.assetUri} alt={`${selected.title}旧版结果`} style={{display:"block",width:"100%",maxWidth:680,margin:"16px auto 0",borderRadius:18,opacity:.62}}/></details></div></div>;
          return <div className="card-pad"><img src={image.assetUri} alt={selected.title} style={{display:"block",width:"100%",maxWidth:680,margin:"0 auto",borderRadius:18,boxShadow:"var(--shadow)"}}/><div className="grid-2" style={{marginTop:16}}><Brief label="图片来源" value={real?`${image.metadata?.service||"外部图片模型"} · ${image.metadata?.model||""}`:"确定性 SVG 构图预览"}/><Brief label="中文排版与质检" value={real?`${image.metadata?.overlayFont||"Noto Sans SC"} · ${image.metadata?.typographyQa?.status==="passed"?"本地 OCR 已通过":"无需底图 OCR"}`:"确定性排版"}/><Brief label="商品照片参考" value={image.production?.referenceSourceId?"已使用上传照片":"未使用商品照片"}/></div>{warnings.map((warning:string)=><p className="hint" key={warning} style={{marginTop:8}}>{warning}</p>)}</div>;
        }
      }catch{/* 非结构化历史版本继续按文本显示 */}
    }
    if(selected.type==="video"&&!editing)return <div className="card-pad"><div className="card" style={{padding:22,background:"var(--surface-soft)"}}><div className="eyebrow">Real MP4 Render</div><h2>可下载商品视频成片</h2><p className="subtitle">商品名、规格、CTA、事实快照和用户素材进入同一渲染配置；服务器会逐帧编码成真实 MP4。</p><video controls playsInline preload="none" src={`/api/v1/artifacts/${selected.id}/export?format=mp4`} style={{width:"100%",maxHeight:620,background:"#111",borderRadius:16,marginTop:16}}/><div className="row" style={{marginTop:14,flexWrap:"wrap"}}><a className="button primary" href={`/api/v1/artifacts/${selected.id}/export?format=mp4`}><Download size={14}/>下载 MP4</a><a className="button secondary" href={`/api/v1/artifacts/${selected.id}/export?format=srt`}><Download size={14}/>字幕</a><a className="button secondary" href={`/api/v1/artifacts/${selected.id}/export?format=png`}><Download size={14}/>封面</a></div></div><details style={{marginTop:14}}><summary className="small muted">查看渲染配置</summary><pre className="editor">{version?.content}</pre></details></div>;
    return editing?<div className="card-pad"><textarea className="textarea" style={{minHeight:520,fontFamily:"inherit",lineHeight:1.75}} value={draft} onChange={(event)=>setDraft(event.target.value)}/><div className="row" style={{marginTop:12}}><button className="button primary" onClick={saveArtifact} disabled={loading==="save"}>{loading==="save"?<LoaderCircle size={14}/>:<Save size={14}/>}保存新版本</button><button className="button secondary" onClick={()=>{setDraft(version?.content||"");setEditing(false);}}><X size={14}/>取消</button></div></div>:<div className="editor" style={{whiteSpace:"pre-wrap"}}>{version?.content||"选择成果查看内容"}</div>;
  }

  function MainPanel(){
    if(activeTab==="资料")return <div className="card"><div className="card-head"><div><h2>项目资料</h2><div className="list-meta">原文件、解析正文、警告与事实候选都可追踪</div></div><label className="button primary" style={{cursor:"pointer"}}><UploadCloud size={14}/>批量上传<input aria-label="上传项目资料" type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png" onChange={upload} style={{display:"none"}}/></label></div><div className="card-pad" style={{paddingTop:4,paddingBottom:4}}><ul className="list">{data.sources.map((source:any)=><li className="list-item" key={source.id}><div className="list-icon"><FileText size={17}/></div><div className="list-copy"><div className="list-title">{source.fileName}</div><div className="list-meta">{source.parser} · {Math.max(1,Math.round(source.size/1024))} KB · 正文 {source.extractedText?.length||0} 字</div>{source.warnings?.length>0&&<div className="hint" style={{color:"var(--amber)",marginTop:4}}>{source.warnings.join("；")}</div>}{source.error&&<div className="hint" style={{color:"var(--risk)",marginTop:4}}>{source.error}</div>}</div><Badge tone={statusTone(source.status)}>{statusLabel(source.status)}</Badge><div className="row"><a className="icon-button" aria-label={`预览 ${source.fileName}`} title="预览原文件" target="_blank" rel="noreferrer" href={`/api/v1/projects/${projectId}/sources/${source.id}/preview`}><Eye size={14}/></a><a className="icon-button" aria-label={`查看解析正文 ${source.fileName}`} title="查看解析正文" target="_blank" rel="noreferrer" href={`/api/v1/projects/${projectId}/sources/${source.id}/preview?mode=text`}><FileText size={14}/></a><button className="icon-button" aria-label={`重新解析 ${source.fileName}`} title="重新解析" onClick={()=>reprocess(source)} disabled={loading===`source:${source.id}`}><RefreshCcw size={14}/></button><button className="icon-button" aria-label={`删除 ${source.fileName}`} title="删除" onClick={()=>removeSource(source)} disabled={loading===`source:${source.id}`}><Trash2 size={14}/></button></div></li>)}</ul></div></div>;
    if(activeTab==="事实卡")return <div className="card"><div className="card-head"><div><h2>事实卡与来源</h2><div className="list-meta">AI 提取的内容先作为候选，由人确认后进入新快照</div></div><Badge tone={pendingFacts.length?"amber":"jade"}>{pendingFacts.length?`${pendingFacts.length} 项待处理`:"可继续生产"}</Badge></div><div className="card-pad grid-2">{data.facts.map((fact:any)=><div className={`fact-card ${fact.status}`} key={fact.id}><div className="row between"><div className="fact-type">{fact.type}</div><Badge tone={fact.status==="missing"?"amber":fact.status==="conflicting"||fact.status==="expired"?"red":"jade"}>{statusLabel(fact.status)}</Badge></div><div className="fact-value">{fact.value||"等待补充"}</div>{fact.sourceQuote&&<div className="source-quote">“{fact.sourceQuote}”</div>}{["missing","inferred","conflicting"].includes(fact.status)&&<button className="button secondary" style={{marginTop:8}} onClick={()=>confirm(fact)} disabled={loading===fact.id}><Check size={12}/>人工确认</button>}</div>)}</div></div>;
    if(activeTab==="任务简报")return <div className="card card-pad"><div className="eyebrow">Campaign Brief</div><h2>{data.project.objective}</h2><div className="grid-2" style={{marginTop:20}}><Brief label="业务目标" value={data.project.businessGoal}/><Brief label="目标人群" value={data.project.targetAudience}/><Brief label="目标平台" value={data.project.targetPlatforms.join("、")}/><Brief label="预算与周期" value={`${data.project.budget??"待确认"} 元 · ${data.project.campaignStart||"待确认"} 至 ${data.project.campaignEnd||"待确认"}`}/></div></div>;
    if(activeTab==="提示词")return <div className="card card-pad"><div className="eyebrow">Prompt Lab</div><h2>提示词来自当前项目和事实快照</h2><p className="subtitle">进入引导式提示词工坊，可生成简易版、专业版和智能体交接版，并运行、保存、导出或交给其他智能体。</p><Link className="button primary" href="/prompt-lab" style={{marginTop:18}}><Sparkles size={14}/>打开提示词工坊</Link></div>;
    if(activeTab==="复核")return <div className="card"><div className="card-head"><div><h2>人工审核</h2><div className="list-meta">外部智能体只能请求审核，不能替小赖批准</div></div></div><div className="card-pad" style={{paddingTop:4,paddingBottom:4}}>{data.reviews.length?<ul className="list">{data.reviews.map((item:any)=><li className="list-item" key={item.id}><div className="list-icon"><ShieldCheck size={17}/></div><div className="list-copy"><div className="list-title">{data.artifacts.find((artifact:any)=>artifact.id===item.artifactId)?.title||item.artifactId}</div><div className="list-meta">风险字段：{item.riskFields.join("、")}</div>{item.note&&<div className="hint">备注：{item.note}</div>}</div><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>{item.status==="pending"&&<div className="row"><button className="button jade" onClick={()=>decide(item,"approved")} disabled={loading===`review:${item.id}`}>批准</button><button className="button secondary" onClick={()=>decide(item,"rejected")} disabled={loading===`review:${item.id}`}>驳回</button></div>}</li>)}</ul>:<p className="subtitle">尚无审核任务。先选择一个成果并点击“提交审核”。</p>}</div></div>;
    if(activeTab==="智能体协作")return <div className="card card-pad"><div className="eyebrow">Agent Collaboration</div><h2>连接其他智能体，但默认只允许读资料和回写草稿</h2><p className="subtitle">连接可同时用于 REST、MCP 与 A2A；Token 只显示一次，随时可撤销。</p><div className="row" style={{marginTop:18}}><Link className="button primary" href="/agents/connections"><Bot size={14}/>管理智能体连接</Link><Link className="button secondary" href="/api-docs">查看接入文档</Link></div></div>;
    if(activeTab==="导出")return <div className="card"><div className="card-head"><div><h2>导出成果</h2><div className="list-meta">每个下载都对应当前版本与事实快照，不包含服务端密钥</div></div>{data.artifacts.length>0&&<a className="button primary" href={`/api/v1/projects/${projectId}/export`}><Download size={14}/>下载全部 ZIP</a>}</div><div className="card-pad" style={{paddingTop:4,paddingBottom:4}}><ul className="list">{data.artifacts.map((artifact:any)=>{const options=exportOptions[artifact.type]||[["JSON","json"],["TXT","txt"]];return <li className="list-item" key={artifact.id}><div className="list-icon"><Download size={17}/></div><div className="list-copy"><div className="list-title">{artifact.title}</div><div className="list-meta">{options.map(([label])=>label).join(" / ")} · v{artifact.currentVersion} · {statusLabel(artifact.status)}</div></div><div className="row" style={{flexWrap:"wrap",justifyContent:"flex-end"}}>{options.map(([label,format],index)=><a className={`button ${index===0?"primary":"secondary"}`} style={{minHeight:30,padding:"0 10px"}} key={format} href={`/api/v1/artifacts/${artifact.id}/export?format=${format}`}><Download size={12}/>{label}</a>)}</div></li>})}</ul></div></div>;
    return <div className="card"><div className="card-head"><div><h2>{selected?.title||"项目尚无生成成果"}</h2><div className="list-meta">{selected?`${statusLabel(selected.status)} · 版本 v${selected.currentVersion}`:"点击生成整套活动开始"}</div></div><div className="row"><button className="button secondary" onClick={bundle} disabled={loading==="bundle"}>{loading==="bundle"?<LoaderCircle size={14}/>:<Sparkles size={14}/>}生成整套活动</button>{selected&&<><a className="button secondary" href={`/api/v1/artifacts/${selected.id}/export`}><Download size={14}/>下载</a><button className="button secondary" onClick={()=>setEditing(true)}><Pencil size={14}/>编辑</button><button className="button primary" onClick={review} disabled={loading==="review"}><ShieldCheck size={14}/>提交审核</button></>}</div></div><ArtifactView/></div>;
  }

  return <>{toast&&<div className="toast" role="status" onClick={()=>setToast("")}>{toast}</div>}
    <div className="snapshot-ribbon" style={{marginBottom:16}}>{["项目资料","事实快照",`v${snapshot?.version||1}`,"全部成果","人工审核"].map((label,index)=><div className="snapshot-node" key={`${label}-${index}`}><span className="snapshot-dot"/><div><strong>{label}</strong><small>{index===2?snapshot?.id?.slice(0,12):index<3?"已同步":"同一快照"}</small></div></div>)}</div>
    <div className="project-tabs">{tabs.map((tab)=><button key={tab} onClick={()=>showTab(tab)} className={`project-tab ${activeTab===tab?"active":""}`}>{tab}</button>)}</div>
    <div className="project-shell">
      <aside className="pane"><div className="card"><div className="card-head"><h3>项目资料</h3><Badge tone={statusTone(data.project.status)}>{statusLabel(data.project.status)}</Badge></div><div className="card-pad"><div className="fact-type">品牌 / 商品</div><div className="fact-value">{data.brand?.name} · {data.products?.[0]?.name}</div><div className="source-quote">{data.project.targetPlatforms.join(" / ")}<br/>{data.project.targetAudience}</div><label className="button secondary" style={{marginTop:12,width:"100%",cursor:"pointer"}}>{loading.startsWith("upload:")?<LoaderCircle size={13}/>:<UploadCloud size={13}/>}上传并解析资料<input aria-label="上传项目资料" type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png" onChange={upload} style={{display:"none"}}/></label><div className="hint" style={{marginTop:7}}>支持多文件，单个不超过 20MB；PDF、Office、文本和表格会提取正文，图片使用视觉模型。</div></div></div><div className="card"><div className="card-head"><h3>事实卡</h3><button className="button secondary" style={{minHeight:28,padding:"0 8px"}} onClick={()=>showTab("事实卡")}>查看全部</button></div><div className="card-pad stack" style={{paddingTop:12}}>{data.facts.slice(0,6).map((fact:any)=><div className={`fact-card ${fact.status}`} key={fact.id}><div className="row between"><div className="fact-type">{fact.type}</div><Badge tone={fact.status==="missing"?"amber":fact.status==="conflicting"||fact.status==="expired"?"red":"jade"}>{statusLabel(fact.status)}</Badge></div><div className="fact-value">{fact.value||"等待补充"}</div>{["missing","inferred","conflicting"].includes(fact.status)&&<button className="button secondary" style={{minHeight:30,padding:"0 10px",marginTop:8}} onClick={()=>confirm(fact)} disabled={loading===fact.id}><Check size={12}/>确认</button>}</div>)}</div></div></aside>
      <section className="pane"><MainPanel/>{data.artifacts.length>0&&!artifactTypesByTab[activeTab]&&!["资料","事实卡","任务简报","提示词","复核","智能体协作","导出"].includes(activeTab)&&<ArtifactList data={data} selected={selected} onSelect={setSelected}/>} {artifactTypesByTab[activeTab]&&<ArtifactList data={{...data,artifacts:data.artifacts.filter((artifact:any)=>artifactTypesByTab[activeTab]?.includes(artifact.type))}} selected={selected} onSelect={setSelected}/>}</section>
      <aside className="pane"><div className="card card-pad"><div className="row between"><h3 style={{margin:0}}>质量与风险</h3><ShieldCheck size={17} color="var(--jade)"/></div><div style={{marginTop:16}}><div className="row between small"><span>来源覆盖</span><strong>{coverage}%</strong></div><div className="progress" style={{marginTop:7}}><span style={{width:`${coverage}%`}}/></div></div><div className="card" style={{padding:12,marginTop:14,background:pendingFacts.length?"var(--amber-soft)":"var(--jade-soft)",borderColor:pendingFacts.length?"#f4d29f":"#bde9d8"}}><strong style={{fontSize:11}}>{pendingFacts.length?"仍有必须确认项":"当前无阻断事实"}</strong><p className="hint" style={{margin:"6px 0 0"}}>{pendingFacts.map((fact:any)=>fact.type).join("、")||"可以继续生成草稿，发布前仍需人工审核"}</p></div></div><div className="card card-pad"><h3>当前事实快照</h3><div className="mono small">{snapshot?.id}</div><div className="source-quote">校验：{snapshot?.checksum?.slice(0,24)}…<br/>共 {snapshot?.facts?.length||0} 条事实</div></div>{selected&&<div className="card card-pad"><h3>历史版本</h3><div className="stack" style={{gap:8}}>{data.artifactVersions?.filter((item:any)=>item.artifactId===selected.id).map((item:any)=><div className="row between" key={item.id}><span className="small">v{item.version} · {item.changeSummary}</span><button className="button secondary" style={{minHeight:28,padding:"0 8px"}} disabled={item.version===selected.currentVersion||loading===item.id} onClick={()=>restore(item.id)}>{loading===item.id?<LoaderCircle size={11}/>:<RotateCcw size={11}/>}恢复</button></div>)}</div></div>}<div className="card card-pad"><h3>视频预览</h3><div style={{aspectRatio:"9/16",maxHeight:230,borderRadius:12,background:"linear-gradient(160deg,#242064,#6657e8)",display:"grid",placeItems:"center",color:"white",position:"relative",overflow:"hidden"}}><div style={{textAlign:"center"}}><Play size={28} style={{margin:"0 auto 9px"}}/><strong style={{fontSize:11}}>Remotion 实时模板</strong><div style={{fontSize:9,color:"#cbc8ff",marginTop:5}}>价格与规格由确定性图层渲染</div></div><div style={{position:"absolute",inset:"8% 6%",border:"1px dashed rgba(255,255,255,.35)",borderRadius:8}}/></div><a className="button secondary" href="/video-preview" style={{width:"100%",marginTop:10}}><Play size={13}/>打开视频工作室</a></div></aside>
    </div>
  </>;
}

function Brief({label,value}:{label:string;value:string}){return <div className="card" style={{padding:14}}><div className="fact-type">{label}</div><div className="fact-value" style={{lineHeight:1.6}}>{value}</div></div>}

function ArtifactList({data,selected,onSelect}:{data:any;selected:any;onSelect:(artifact:any)=>void}){
  if(!data.artifacts.length)return null;
  return <div className="card"><div className="card-head"><h3>成果版本</h3><span className="small muted">人工内容不会被静默覆盖</span></div><div className="card-pad" style={{paddingTop:4,paddingBottom:4}}><ul className="list">{data.artifacts.map((artifact:any)=><li className="list-item" key={artifact.id} onClick={()=>onSelect(artifact)} style={{cursor:"pointer",background:selected?.id===artifact.id?"var(--surface-soft)":undefined}}><div className="list-icon"><FileText size={17}/></div><div className="list-copy"><div className="list-title">{artifact.title}</div><div className="list-meta">v{artifact.currentVersion} · 快照 {artifact.factSnapshotId.slice(0,12)}</div></div><Badge tone={statusTone(artifact.status)}>{statusLabel(artifact.status)}</Badge><ChevronRight size={14} color="var(--muted)"/></li>)}</ul></div></div>;
}
