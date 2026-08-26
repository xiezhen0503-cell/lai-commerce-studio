"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, Bot, Check, ChevronRight, Clipboard, FileCheck2, FileText, Film, Image as ImageIcon, Layers3, LoaderCircle, Package, Paperclip, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import styles from "./beginner-workbench.module.css";

type InitialContext = {
  projectId: string;
  projectName: string;
  productName: string;
  specification: string;
  platforms: string[];
  sourceNames: string[];
  confirmedFacts: Array<{ type: string; value: string }>;
  pendingFactNames: string[];
  ai: { mode: "openai" | "mock"; provider: string; model: string; configured: boolean; live: boolean };
};

type WorkbenchResponse = {
  data?: {
    prompt: {
      evaluation: { total: number; blockers: string[] };
      explanation: { sources: string[]; confirmedFacts: string[]; missing: string[] };
    };
    result?: {
      artifact: { id: string; title: string; version: { content: string } };
      run: { provider: string; model: string };
    };
    bundle?: { artifactIds?: string[]; provider?: string; model?: string };
  };
  error?: { message?: string };
};

type Result = {
  title: string;
  content: string;
  score: number;
  sources: string[];
  facts: string[];
  missing: string[];
  artifactId?: string;
  bundleCount?: number;
  provider: string;
  model: string;
  live: boolean;
};

const taskOptions = [
  { id: "plan", label: "活动方案", description: "目标、策略与 7 天动作", icon: FileText, artifactType: "proposal", example: "帮我做一份新品上市方案，要写清目标人群、内容方向和未来 7 天怎么执行" },
  { id: "script", label: "短视频脚本", description: "画面、口播与字幕", icon: Film, artifactType: "script", example: "写一条 30 秒短视频脚本，开头要抓人，但不要夸大商品功效" },
  { id: "image", label: "商品主图", description: "五张图的内容规划", icon: ImageIcon, artifactType: "storyboard", example: "规划 5 张商品主图，分别讲清使用场景、配料、规格和购买理由" },
  { id: "video", label: "视频分镜", description: "镜头、动作与节奏", icon: Layers3, artifactType: "video-storyboard", example: "做一条 30 秒商品视频分镜，适合手机竖屏观看，价格先留空" },
  { id: "bundle", label: "整套活动", description: "方案到视频一次整理", icon: Sparkles, artifactType: "proposal", example: "为这个商品生成一整套新品上市内容，包含方案、脚本、主图、视频和排期" }
] as const;

export function BeginnerWorkbench({ initial }: { initial: InitialContext }) {
  const [taskId,setTaskId] = useState<(typeof taskOptions)[number]["id"]>("script");
  const [objective,setObjective] = useState<string>(taskOptions[1].example);
  const [platforms,setPlatforms] = useState(initial.platforms);
  const [sourceCount,setSourceCount] = useState(initial.sourceNames.length);
  const [factCount,setFactCount] = useState(initial.confirmedFacts.length);
  const [pendingNames] = useState(initial.pendingFactNames);
  const [stage,setStage] = useState("");
  const [error,setError] = useState("");
  const [result,setResult] = useState<Result>();
  const [copied,setCopied] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const selectedTask = taskOptions.find((item) => item.id === taskId) ?? taskOptions[0];
  const ready = objective.trim().length >= 8 && platforms.length > 0;

  function chooseTask(id: (typeof taskOptions)[number]["id"]) {
    const next = taskOptions.find((item) => item.id === id) ?? taskOptions[0];
    setTaskId(next.id);
    setObjective(next.example);
    setResult(undefined);
    setError("");
  }

  function togglePlatform(platform: string) {
    setPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current,platform]);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setStage("正在读资料");
    const form = new FormData();
    form.set("file",file);
    const response = await fetch(`/api/v1/projects/${initial.projectId}/sources`,{method:"POST",body:form});
    const json = await response.json();
    event.target.value = "";
    setStage("");
    if (!response.ok) { setError(json.error?.message || "资料没有上传成功，请检查格式和大小"); return; }
    setSourceCount((count) => count + 1);
    setFactCount((count) => count + (json.data?.facts?.length || 0));
  }

  async function generate() {
    if (!ready) return;
    setError(""); setResult(undefined); setCopied(false);
    const fullObjective = `${objective.trim()}\n目标平台：${platforms.join("、")}`;
    setStage(taskId === "bundle" ? "正在生成整套内容" : "正在核对事实并生成");
    const response = await fetch("/api/v1/workbench/generate",{method:"POST",headers:{"content-type":"application/json","idempotency-key":`beginner-${Date.now()}`},body:JSON.stringify({projectId:initial.projectId,objective:fullObjective,task:taskId === "bundle" ? "bundle" : "single",artifactType:selectedTask.artifactType})});
    const json = await response.json() as WorkbenchResponse;
    setStage("");
    if (!response.ok || !json.data) { setError(json.error?.message || "内容没有生成成功，请再试一次"); return; }
    const prompt = json.data.prompt;

    if (taskId === "bundle" && json.data.bundle) {
      const model = String(json.data.bundle.model || initial.ai.model);
      setResult({title:"整套活动已经整理好",content:"方案、短视频脚本、五张主图规划、图片提示词、视频分镜、视频草稿、排期和质量报告已经放进项目。价格、活动时间等高风险字段仍会等待你确认。",score:prompt.evaluation.total,sources:prompt.explanation.sources,facts:prompt.explanation.confirmedFacts,missing:prompt.explanation.missing,bundleCount:json.data.bundle.artifactIds?.length || 0,provider:String(json.data.bundle.provider || initial.ai.provider),model,live:model!=="mock-text-v1"});
    } else {
      const generated = json.data.result;
      if (!generated) { setError("内容没有生成成功，请再试一次"); return; }
      setResult({title:generated.artifact.title,content:generated.artifact.version.content,score:prompt.evaluation.total,sources:prompt.explanation.sources,facts:prompt.explanation.confirmedFacts,missing:prompt.explanation.missing,artifactId:generated.artifact.id,provider:generated.run.provider,model:generated.run.model,live:generated.run.model!=="mock-text-v1"});
    }
    setTimeout(() => resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false),1600);
  }

  return <div className={styles.workbench}>
    <header className={styles.intro}>
      <div className={styles.introCopy}>
        <div className={styles.modeRow}>
          <div className={styles.modePill}><WandSparkles size={14}/> 新手 AI 工作台</div>
          <div className={`${styles.modelPill} ${initial.ai.live ? styles.modelLive : ""}`} aria-label="当前 AI 模型">
            <span aria-hidden="true"/>{initial.ai.live ? `Codex · ${initial.ai.model}` : "演示模式 · Codex 待配置"}
          </div>
        </div>
        <h1>不用学提示词，<br/><span>把想做的事说清楚就行。</span></h1>
        <p>选一个内容类型，确认商品和平台，再用一句话告诉 AI。工作台会自动带上资料、事实和风险边界。</p>
      </div>
      <div className={styles.promise} aria-label="使用步骤">
        <div><span>1</span><strong>你说目标</strong><small>不用专业术语</small></div>
        <ChevronRight aria-hidden="true"/>
        <div><span>2</span><strong>AI 查资料</strong><small>不凭空编数字</small></div>
        <ChevronRight aria-hidden="true"/>
        <div><span>3</span><strong>你拿结果</strong><small>高风险项再确认</small></div>
      </div>
    </header>

    <section className={styles.desk} aria-label="AI 内容生成工作台">
      <aside className={styles.factTicket}>
        <div className={styles.ticketTop}><span>本次使用的资料</span><ShieldCheck size={18}/></div>
        <div className={styles.productBlock}><div className={styles.productIcon}><Package size={21}/></div><div><small>当前商品</small><strong>{initial.productName}</strong><span>{initial.specification}</span></div></div>
        <div className={styles.ticketStats}>
          <div><strong>{sourceCount}</strong><span>份资料</span></div>
          <div><strong>{factCount}</strong><span>条可用事实</span></div>
        </div>
        <div className={styles.factList}>
          {initial.confirmedFacts.slice(0,4).map((fact) => <div key={fact.type}><Check size={12}/><span>{fact.type}</span><strong>{fact.value}</strong></div>)}
        </div>
        {pendingNames.length > 0 && <div className={styles.pending}><FileCheck2 size={14}/><span>{pendingNames.join("、")}仍待确认，AI 不会擅自补写</span></div>}
        <label className={styles.uploadButton}><Paperclip size={14}/>{stage === "正在读资料" ? "正在读资料…" : "再补一份商品资料"}<input type="file" accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png" onChange={upload}/></label>
      </aside>

      <main className={styles.composer}>
        <div className={styles.sectionLabel}><span>先选要做什么</span><small>一次只做一件，结果更清楚</small></div>
        <div className={styles.taskGrid}>{taskOptions.map(({id,label,description,icon:Icon}) => <button key={id} type="button" aria-pressed={taskId===id} className={`${styles.taskButton} ${taskId===id?styles.selected:""}`} onClick={() => chooseTask(id)}><Icon/><span><strong>{label}</strong><small>{description}</small></span>{taskId===id&&<Check className={styles.taskCheck}/>}</button>)}</div>

        <div className={styles.sectionLabel}><span>发到哪里</span><small>可以多选</small></div>
        <div className={styles.platforms}>{["小红书","抖音","微信私域","淘宝 / 天猫","京东"].map((platform) => <button type="button" key={platform} aria-pressed={platforms.includes(platform)} className={platforms.includes(platform)?styles.platformSelected:""} onClick={() => togglePlatform(platform)}>{platforms.includes(platform)&&<Check size={12}/>} {platform}</button>)}</div>

        <label className={styles.promptLabel} htmlFor="beginner-objective"><span>用一句话说说你的要求</span><small>{objective.length}/240</small></label>
        <div className={styles.promptBox}>
          <textarea id="beginner-objective" maxLength={240} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="例如：写一条 30 秒短视频脚本，开头抓人，但不要夸大功效"/>
          <div className={styles.promptFooter}><div><Sparkles size={13}/><span>{initial.ai.live ? "Codex 会自动加入商品事实、品牌语气和平台要求" : "演示 AI 会自动加入商品事实；配置服务端密钥后切换 Codex"}</span></div><button type="button" onClick={generate} disabled={!ready || Boolean(stage)}>{stage?<LoaderCircle className={styles.spin} size={16}/>:<ArrowRight size={16}/>} {stage || "帮我生成第一版"}</button></div>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.safeNote}><ShieldCheck size={14}/><span>先生成草稿，不会自动发布、花钱或修改店铺。</span><Link href="/prompt-lab">进入专业模式 <ChevronRight size={12}/></Link></div>
      </main>
    </section>

    {result && <section className={styles.result} ref={resultRef} aria-live="polite">
      <div className={styles.resultHead}><div><div className={styles.resultEyebrow}><Check size={13}/> 第一版已完成</div><h2>{result.title}</h2><p>{result.bundleCount ? `共整理 ${result.bundleCount} 项内容，已放入当前项目。` : "你可以直接复制，也可以进入完整工作台继续修改。"}</p></div><div className={styles.score}><strong>{result.score}</strong><span>任务完整度</span></div></div>
      <div className={styles.resultBody}>
        <article className={styles.output}><div className={styles.outputToolbar}><div className={styles.outputIdentity}><span>{selectedTask.label}</span><small><Bot size={12}/>{result.live ? "Codex" : "演示模式"} · {result.model}</small></div><button type="button" onClick={copyResult}><Clipboard size={13}/>{copied?"已复制":"复制结果"}</button></div><pre>{result.content}</pre></article>
        <aside className={styles.evidence}><h3>AI 这次依据了什么</h3><div className={styles.evidenceRow}><span>当前模型</span><strong>{result.live ? "Codex" : "演示"}</strong></div><div className={styles.evidenceRow}><span>已确认事实</span><strong>{result.facts.length} 条</strong></div><div className={styles.evidenceRow}><span>引用资料</span><strong>{result.sources.length} 份</strong></div><div className={styles.evidenceRow}><span>待确认</span><strong>{result.missing.length} 项</strong></div>{result.missing.length>0&&<div className={styles.missingBox}>{result.missing.join("；")}</div>}<Link className={styles.projectLink} href={`/projects/${initial.projectId}`}>打开完整项目 <ChevronRight size={13}/></Link></aside>
      </div>
    </section>}

    <footer className={styles.footerLine}><span>{initial.projectName}</span><span>演示数据 · 可替换成你的品牌与商品</span></footer>
  </div>;
}
