import Link from "next/link";
import { Bot, ChevronRight, FileImage, FileText, Film, FolderKanban, PenLine, Sparkles, WandSparkles, Zap } from "lucide-react";
import { getCommerceService } from "@lai/shared";
import { Badge, statusLabel, statusTone } from "@/components/ui";
import { CampaignButton, IntentBar } from "@/components/home-actions";

export const dynamic = "force-dynamic";

const quick = [["做方案",FileText,"/prompt-lab?task=plan"],["写脚本",PenLine,"/prompt-lab?task=script"],["做图片",FileImage,"/prompt-lab?task=image"],["做视频",Film,"/prompt-lab?task=video"],["帮我写提示词",WandSparkles,"/prompt-lab"]] as const;

export default function HomePage() {
  const dashboard = getCommerceService().dashboard();
  return <>
    <section className="hero-workbench">
      <div className="hero-panel"><div className="eyebrow">今日工作台 · Project First</div><h1>小赖，今天准备完成什么？</h1><p>说清目标，选择商品和平台。系统会先找齐事实，再帮你把方案、脚本、图片和视频连成一套。</p><IntentBar/></div>
      <div className="campaign-cta"><div><div className="campaign-icon"><Zap size={28}/></div><h2>一键生成整套活动</h2><p>同一个事实快照，一次生成方案、脚本、五张主图规划、视频分镜、排期和风险清单。</p></div><CampaignButton/></div>
    </section>

    <section className="quick-actions" aria-label="常用入口">{quick.map(([label,Icon,href])=><Link className="quick-action" href={href} key={label}><Icon/><span>{label}</span></Link>)}</section>

    <section className="grid-4" style={{marginBottom:18}}>
      <div className="card metric-card"><div className="metric-label">待确认事实</div><div className="metric-value" style={{color:"var(--amber)"}}>{dashboard.counts.pendingFacts}</div><div className="metric-note">先确认，后生成</div></div>
      <div className="card metric-card"><div className="metric-label">生成中的任务</div><div className="metric-value">{dashboard.counts.activeJobs}</div><div className="metric-note">可取消与重试</div></div>
      <div className="card metric-card"><div className="metric-label">等待人工审核</div><div className="metric-value" style={{color:"var(--indigo)"}}>{dashboard.counts.pendingReviews}</div><div className="metric-note">高风险内容不自动通过</div></div>
      <div className="card metric-card"><div className="metric-label">已连接智能体</div><div className="metric-value" style={{color:"var(--jade)"}}>{dashboard.counts.agents}</div><div className="metric-note">默认最小权限</div></div>
    </section>

    <section className="snapshot-ribbon" aria-label="统一事实快照流程" style={{marginBottom:18}}>
      {["资料入库","事实确认","快照锁定","内容生产","人工审核"].map((label,index)=><div className="snapshot-node" key={label}><span className="snapshot-dot"/><div><strong>{label}</strong><small>{index<3?"事实层":"成果层"}</small></div></div>)}
    </section>

    <section className="grid-2">
      <div className="card"><div className="card-head"><h2>最近项目</h2><Link href="/projects" className="small muted">查看全部 <ChevronRight size={13} style={{display:"inline"}}/></Link></div><div className="card-pad" style={{paddingTop:4,paddingBottom:4}}><ul className="list">{dashboard.projects.map(project=><li className="list-item" key={project.id}><div className="list-icon"><FolderKanban size={18}/></div><div className="list-copy"><Link className="list-title" href={`/projects/${project.id}`}>{project.name}</Link><div className="list-meta">{project.type} · {project.targetPlatforms.join(" / ")}</div></div><Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge></li>)}</ul></div></div>
      <div className="card"><div className="card-head"><h2>外部智能体最近活动</h2><Link href="/agents/logs" className="small muted">调用日志 <ChevronRight size={13} style={{display:"inline"}}/></Link></div><div className="card-pad" style={{paddingTop:4,paddingBottom:4}}><ul className="list">{dashboard.connections.map(connection=><li className="list-item" key={connection.id}><div className="list-icon" style={{background:"var(--jade-soft)",color:"var(--jade)"}}><Bot size={18}/></div><div className="list-copy"><div className="list-title">{connection.name}</div><div className="list-meta">{connection.protocol} · 最近完成项目查询</div></div><Badge tone="jade">已授权</Badge></li>)}{dashboard.connections.length===0&&<li className="list-item"><div className="list-icon"><Sparkles size={18}/></div><div className="list-copy"><div className="list-title">还没有智能体活动</div><div className="list-meta">连接后，所有调用都会留下审计记录</div></div></li>}</ul></div></div>
    </section>
  </>;
}
