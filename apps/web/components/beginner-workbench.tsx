"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, Bot, Check, ChevronRight, Clipboard, Download, FileCheck2, FileText, Film, Image as ImageIcon, Layers3, LoaderCircle, Package, Paperclip, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
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
  ai: { mode: "openai" | "openrouter" | "pollinations" | "mock"; provider: string; model: string; configured: boolean; live: boolean };
};

type WorkbenchResponse = {
  data?: {
    prompt: {
      evaluation: { total: number; blockers: string[] };
      explanation: { sources: string[]; confirmedFacts: string[]; missing: string[] };
    };
    result?: {
      artifact: { id: string; type: string; title: string; version: { content: string } };
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
  video?: boolean;
  image?: {
    assetUri: string;
    prompt: string;
    warnings: string[];
    referenceSourceId?: string;
  };
};

const taskOptions = [
  { id: "plan", label: "活动方案", description: "目标、策略与 7 天动作", icon: FileText, artifactType: "proposal", example: "帮我做一份新品上市方案，要写清目标人群、内容方向和未来 7 天怎么执行" },
  { id: "script", label: "短视频脚本", description: "画面、口播与字幕", icon: Film, artifactType: "script", example: "写一条 30 秒短视频脚本，开头要抓人，但不要夸大商品功效" },
  { id: "image", label: "AI 商品图", description: "真实生成 · 可预览下载", icon: ImageIcon, artifactType: "image", example: "生成 1 张方形商品主图，画面干净有质感，适合电商首图，不要在图片里编造价格和功效文字" },
  { id: "video", label: "视频成片", description: "真实 MP4 · 字幕与封面", icon: Layers3, artifactType: "video", example: "生成一条 15 秒竖屏商品视频成片，使用我上传的资料，价格没有确认就不要显示" },
  { id: "bundle", label: "整套活动", description: "方案到视频一次整理", icon: Sparkles, artifactType: "proposal", example: "为这个商品生成一整套新品上市内容，包含方案、脚本、主图、视频和排期" }
] as const;

function providerDisplayName(provider: string, live: boolean) {
  if (!live) return "演示模式";
  if (provider === "pollinations-image") return "免费生图模型";
  return provider === "openrouter-free" || provider === "pollinations-quest" ? "免费测试模型" : "Codex";
}

function imageResult(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      assetUri?: unknown;
      production?: { prompt?: unknown; warnings?: unknown; referenceSourceId?: unknown };
    };
    if (typeof parsed.assetUri !== "string" || !parsed.assetUri.startsWith("data:image/")) return undefined;
    return {
      assetUri: parsed.assetUri,
      prompt: typeof parsed.production?.prompt === "string" ? parsed.production.prompt : "",
      warnings: Array.isArray(parsed.production?.warnings) ? parsed.production.warnings.filter((item): item is string => typeof item === "string") : [],
      referenceSourceId: typeof parsed.production?.referenceSourceId === "string" ? parsed.production.referenceSourceId : undefined
    };
  } catch {
    return undefined;
  }
}

function providerHint(mode: InitialContext["ai"]["mode"]) {
  if (mode === "openrouter" || mode === "pollinations") return "免费测试模型会检索你上传的资料正文，再结合商品事实和平台要求生成";
  if (mode === "openai") return "Codex 会检索你上传的资料正文，再结合商品事实和平台要求生成";
  return "演示 AI 会检索已上传资料；配置服务端密钥后切换真实模型";
}

export function BeginnerWorkbench({ initial }: { initial: InitialContext }) {
  const [taskId,setTaskId] = useState<(typeof taskOptions)[number]["id"]>("script");
  const [objective,setObjective] = useState<string>(taskOptions[1].example);
  const [platforms,setPlatforms] = useState(initial.platforms);
  const [sourceCount,setSourceCount] = useState(initial.sourceNames.length);
  const [factCount,setFactCount] = useState(initial.confirmedFacts.length);
  const [factRows,setFactRows] = useState(initial.confirmedFacts);
  const [productName,setProductName] = useState(initial.productName);
  const [specification,setSpecification] = useState(initial.specification);
  const [pendingNames,setPendingNames] = useState(initial.pendingFactNames);
  const [uploadSummary,setUploadSummary] = useState("");
  const [stage,setStage] = useState("");
  const [error,setError] = useState("");
  const [result,setResult] = useState<Result>();
  const [copied,setCopied] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const selectedTask = taskOptions.find((item) => item.id === taskId) ?? taskOptions[0];
  const ready = objective.trim().length >= 8 && platforms.length > 0 && sourceCount > 0;

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
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setUploadSummary("");
    let succeeded = 0;
    let extracted = 0;
    const failures: string[] = [];
    for (const [index,file] of files.entries()) {
      setStage(`正在读资料 ${index + 1}/${files.length}`);
      const form = new FormData();
      form.set("file",file);
      const response = await fetch(`/api/v1/projects/${initial.projectId}/sources`,{method:"POST",body:form});
      const json = await response.json();
      if (response.ok) { succeeded += 1; extracted += json.data?.facts?.length || 0; }
      else failures.push(`${file.name}：${json.error?.message || json.data?.source?.error || "上传失败"}`);
    }
    setStage("");
    if (failures.length) setError(failures.join("；"));
    setUploadSummary(`已保存并解析 ${succeeded} 份资料，新增 ${extracted} 条事实候选。生成时会按你的要求检索相关正文片段。`);
    const projectResponse = await fetch(`/api/v1/projects/${initial.projectId}`);
    const projectJson = await projectResponse.json();
    if (projectResponse.ok) {
      const facts = projectJson.data.facts as Array<{type:string;value:string;status:string}>;
      const confirmed = facts.filter((fact) => ["verified","user-confirmed","inferred"].includes(fact.status));
      setSourceCount(projectJson.data.sources.length);
      setFactCount(confirmed.length);
      setFactRows(confirmed.map((fact) => ({type:fact.type,value:fact.value})));
      setProductName(projectJson.data.products?.[0]?.name || "待上传商品");
      setSpecification(projectJson.data.products?.[0]?.specification || "规格待识别");
      setPendingNames(facts.filter((fact) => ["missing","conflicting","expired"].includes(fact.status)).map((fact) => fact.type));
    }
  }

  async function generate() {
    if (!ready) return;
    setError(""); setResult(undefined); setCopied(false);
    const fullObjective = `${objective.trim()}\n目标平台：${platforms.join("、")}`;
    setStage(taskId === "bundle" ? "正在生成整套真实内容，可能需要 2 分钟" : taskId === "image" ? "正在生成真实图片，可能需要 1 分钟" : taskId === "video" ? "正在生成脚本与视频渲染配置" : "正在核对事实并生成");
    const response = await fetch("/api/v1/workbench/generate",{method:"POST",headers:{"content-type":"application/json","idempotency-key":`beginner-${Date.now()}`},body:JSON.stringify({projectId:initial.projectId,objective:fullObjective,task:taskId === "bundle" ? "bundle" : "single",artifactType:selectedTask.artifactType})});
    const json = await response.json() as WorkbenchResponse;
    setStage("");
    if (!response.ok || !json.data) { setError(json.error?.message || "内容没有生成成功，请再试一次"); return; }
    const prompt = json.data.prompt;

    if (taskId === "bundle" && json.data.bundle) {
      const model = String(json.data.bundle.model || initial.ai.model);
      setResult({title:"整套真实成果已经生成",content:"方案、脚本、五张主图规划、真实商品图、图片提示词、视频分镜、可渲染 MP4、平台文案、排期和质量报告已经放进项目。价格、活动时间等高风险字段仍会等待你确认。",score:prompt.evaluation.total,sources:prompt.explanation.sources,facts:prompt.explanation.confirmedFacts,missing:prompt.explanation.missing,bundleCount:json.data.bundle.artifactIds?.length || 0,provider:String(json.data.bundle.provider || initial.ai.provider),model,live:model!=="mock-text-v1"});
    } else {
      const generated = json.data.result;
      if (!generated) { setError("内容没有生成成功，请再试一次"); return; }
      const image = generated.artifact.type === "image" ? imageResult(generated.artifact.version.content) : undefined;
      setResult({title:generated.artifact.title,content:generated.artifact.version.content,score:prompt.evaluation.total,sources:prompt.explanation.sources,facts:prompt.explanation.confirmedFacts,missing:prompt.explanation.missing,artifactId:generated.artifact.id,provider:generated.run.provider,model:generated.run.model,live:generated.run.model!=="mock-text-v1"&&generated.run.model!=="deterministic-storyboard-svg-v1",image,video:generated.artifact.type==="video"});
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
            <span aria-hidden="true"/>{initial.ai.live ? `${providerDisplayName(initial.ai.provider, true)} · ${initial.ai.model}` : "演示模式 · 真实模型待配置"}
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
        <div className={styles.productBlock}><div className={styles.productIcon}><Package size={21}/></div><div><small>当前商品</small><strong>{productName}</strong><span>{specification}</span></div></div>
        <div className={styles.ticketStats}>
          <div><strong>{sourceCount}</strong><span>份资料</span></div>
          <div><strong>{factCount}</strong><span>条识别事实</span></div>
        </div>
        <div className={styles.factList}>
          {factRows.slice(0,4).map((fact) => <div key={`${fact.type}-${fact.value}`}><Check size={12}/><span>{fact.type}</span><strong>{fact.value}</strong></div>)}
        </div>
        {pendingNames.length > 0 && <div className={styles.pending}><FileCheck2 size={14}/><span>{pendingNames.join("、")}仍待确认，AI 不会擅自补写</span></div>}
        <label className={styles.uploadButton}><Paperclip size={14}/>{stage.startsWith("正在读资料") ? `${stage}…` : "补充商品资料（可多选）"}<input type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.jpg,.jpeg,.png" onChange={upload}/></label>
        {uploadSummary&&<div className={styles.pending}><FileCheck2 size={14}/><span>{uploadSummary}</span></div>}
      </aside>

      <main className={styles.composer}>
        <div className={styles.sectionLabel}><span>先选要做什么</span><small>一次只做一件，结果更清楚</small></div>
        <div className={styles.taskGrid}>{taskOptions.map(({id,label,description,icon:Icon}) => <button key={id} type="button" aria-pressed={taskId===id} className={`${styles.taskButton} ${taskId===id?styles.selected:""}`} onClick={() => chooseTask(id)}><Icon/><span><strong>{label}</strong><small>{description}</small></span>{taskId===id&&<Check className={styles.taskCheck}/>}</button>)}</div>

        <div className={styles.sectionLabel}><span>发到哪里</span><small>可以多选</small></div>
        <div className={styles.platforms}>{["小红书","抖音","微信私域","淘宝 / 天猫","京东"].map((platform) => <button type="button" key={platform} aria-pressed={platforms.includes(platform)} className={platforms.includes(platform)?styles.platformSelected:""} onClick={() => togglePlatform(platform)}>{platforms.includes(platform)&&<Check size={12}/>} {platform}</button>)}</div>

        <label className={styles.promptLabel} htmlFor="beginner-objective"><span>用一句话说说你的要求</span><small>{objective.length}/240</small></label>
        <div className={styles.promptBox}>
          <textarea id="beginner-objective" maxLength={240} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="例如：写一条 30 秒短视频脚本，开头抓人，但不要夸大功效"/>
          <div className={styles.promptFooter}><div><Sparkles size={13}/><span>{sourceCount > 0 ? providerHint(initial.ai.mode) : "请先上传至少一份资料，AI 才会开始生成"}</span></div><button type="button" onClick={generate} disabled={!ready || Boolean(stage)}>{stage?<LoaderCircle className={styles.spin} size={16}/>:<ArrowRight size={16}/>} {stage || (sourceCount > 0 ? "帮我生成第一版" : "先上传资料")}</button></div>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.safeNote}><ShieldCheck size={14}/><span>先生成草稿，不会自动发布、花钱或修改店铺。</span><Link href="/prompt-lab">进入专业模式 <ChevronRight size={12}/></Link></div>
      </main>
    </section>

    {result && <section className={styles.result} ref={resultRef} aria-live="polite">
      <div className={styles.resultHead}><div><div className={styles.resultEyebrow}><Check size={13}/> 第一版已完成</div><h2>{result.title}</h2><p>{result.bundleCount ? `共整理 ${result.bundleCount} 项内容，已放入当前项目。` : result.image ? "这是真实图片模型返回的图片草稿，可直接预览和下载原图。" : "你可以直接复制，也可以进入完整工作台继续修改。"}</p></div><div className={styles.score}><strong>{result.score}</strong><span>任务完整度</span></div></div>
      <div className={styles.resultBody}>
        <article className={styles.output}><div className={styles.outputToolbar}><div className={styles.outputIdentity}><span>{selectedTask.label}</span><small><Bot size={12}/>{providerDisplayName(result.provider, result.live)} · {result.model}</small></div><div className={styles.outputActions}><a className={styles.downloadLink} href={result.artifactId?`/api/v1/artifacts/${result.artifactId}/export`:`/api/v1/projects/${initial.projectId}/export`}><Download size={13}/>{result.bundleCount?"下载全部":result.image?"下载原图":result.video?"下载 MP4":"下载结果"}</a>{!result.image&&!result.video&&<button type="button" onClick={copyResult}><Clipboard size={13}/>{copied?"已复制":"复制结果"}</button>}</div></div>{result.image?<div className={styles.generatedImage}><img src={result.image.assetUri} alt="AI 生成并完成中文信息排版的商品主图"/><div className={styles.imageNotes}>{result.image.warnings.map((warning)=><p key={warning}><ShieldCheck size={13}/>{warning}</p>)}<details><summary>查看本次图片提示词</summary><pre>{result.image.prompt}</pre></details></div></div>:result.video&&result.artifactId?<div className={styles.generatedImage}><video controls playsInline preload="none" src={`/api/v1/artifacts/${result.artifactId}/export?format=mp4`} style={{width:"100%",maxHeight:620,background:"#111",borderRadius:16}}/><div className={styles.imageNotes}><p><ShieldCheck size={13}/>首次打开会由服务器逐帧渲染真实 MP4；完成后可以下载同一文件。</p><p><Download size={13}/><a href={`/api/v1/artifacts/${result.artifactId}/export?format=srt`}>下载 SRT 字幕</a> · <a href={`/api/v1/artifacts/${result.artifactId}/export?format=png`}>下载 PNG 封面</a></p></div></div>:<pre>{result.content}</pre>}</article>
        <aside className={styles.evidence}><h3>AI 这次依据了什么</h3><div className={styles.evidenceRow}><span>当前模型</span><strong>{providerDisplayName(result.provider, result.live)}</strong></div><div className={styles.evidenceRow}><span>已确认事实</span><strong>{result.facts.length} 条</strong></div><div className={styles.evidenceRow}><span>引用资料</span><strong>{result.sources.length} 份</strong></div><div className={styles.evidenceRow}><span>待确认</span><strong>{result.missing.length} 项</strong></div>{result.missing.length>0&&<div className={styles.missingBox}>{result.missing.join("；")}</div>}<Link className={styles.projectLink} href={`/projects/${initial.projectId}`}>打开完整项目 <ChevronRight size={13}/></Link></aside>
      </div>
    </section>}

    <footer className={styles.footerLine}><span>{initial.projectName}</span><span>空白测试项目 · 仅检索你上传的资料，不联网抓取网页</span></footer>
  </div>;
}
