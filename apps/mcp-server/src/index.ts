import express from "express";
import cors from "cors";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { CommerceError, DEMO_PROJECT_ID, DEMO_WORKSPACE_ID, MCP_PROMPT_NAMES, MCP_TOOL_NAMES, getCommerceService, type CommerceService } from "@lai/shared";
import type { AgentPrincipal } from "@lai/permissions";

const service = getCommerceService();
const descriptions: Record<string,string> = {
  "workspace.list":"列出当前智能体可访问的工作区", "project.list":"列出获准项目", "project.get":"读取项目及其事实、资料与成果", "project.create":"创建电商项目草稿", "project.update":"更新获准项目",
  "source.list":"列出项目资料", "source.create_upload":"创建受控上传入口", "source.complete_upload":"完成上传", "source.get":"读取资料元信息", "source.delete":"删除资料", "source.reprocess":"重新解析资料",
  "fact.list":"读取项目事实卡", "fact.extract":"从资料提出事实候选", "fact.confirm":"确认事实（默认禁止智能体）", "fact.reject":"拒绝事实候选", "fact.resolve_conflict":"解决事实冲突", "fact.create_snapshot":"建立事实快照",
  "prompt.list":"列出项目提示词", "prompt.get":"读取提示词", "prompt.generate":"从一句话目标生成三个提示词版本", "prompt.explain":"解释提示词", "prompt.evaluate":"逐项评分", "prompt.save":"保存提示词", "prompt.run":"运行提示词并创建成果草稿", "prompt.export":"导出提示词", "prompt.build_handoff":"创建智能体交接包",
  "skill.list":"列出电商技能", "skill.get":"读取技能说明", "skill.run":"运行获准技能", "artifact.list":"列出成果", "artifact.get":"读取成果及版本", "artifact.create":"回写新成果草稿", "artifact.update":"更新成果草稿", "artifact.create_version":"创建成果版本", "artifact.compare_versions":"比较成果版本", "artifact.submit_review":"请求人工审核", "artifact.export":"导出成果",
  "campaign.create_bundle":"生成整套活动", "campaign.get_bundle":"读取活动包", "job.get":"查询任务进度", "job.cancel":"取消任务", "job.retry":"重试任务", "review.run":"运行质量复核", "review.request_human_approval":"请求人工批准", "review.get_status":"查询审核状态"
};

const inputSchema = z.object({ projectId:z.string().optional(), sourceId:z.string().optional(), factId:z.string().optional(), promptSpecId:z.string().optional(), artifactId:z.string().optional(), bundleId:z.string().optional(), jobId:z.string().optional(), reviewId:z.string().optional(), objective:z.string().optional(), type:z.string().optional(), title:z.string().optional(), content:z.string().optional(), format:z.string().optional(), name:z.string().optional(), patch:z.record(z.string(),z.unknown()).optional() }).catchall(z.unknown());

function textResult(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] }; }
function errorResult(error: unknown) { const code=error instanceof CommerceError?error.code:"MCP_TOOL_ERROR";const message=error instanceof Error?error.message:"工具调用失败";return { isError:true, content:[{type:"text" as const,text:JSON.stringify({error:{code,message}})}]}; }

function createMcpServer(principal: AgentPrincipal, commerce: CommerceService) {
  const server = new McpServer({ name:"lai-commerce-studio", version:"0.1.0" }, { capabilities:{ logging:{} } });
  server.registerResource("workspace-summary",`laicommerce://workspaces/${DEMO_WORKSPACE_ID}/summary`,{title:"工作区概况",description:"项目、待确认事实、任务、审核和智能体连接概况",mimeType:"application/json"},async(uri)=>({contents:[{uri:uri.href,mimeType:"application/json",text:JSON.stringify(commerce.getResource(uri.href,principal),null,2)}]}));
  server.registerResource("skills","laicommerce://skills",{title:"电商技能",description:"平台可调用的17个电商技能",mimeType:"application/json"},async(uri)=>({contents:[{uri:uri.href,mimeType:"application/json",text:JSON.stringify(commerce.getResource(uri.href,principal),null,2)}]}));
  server.registerResource("templates","laicommerce://templates",{title:"内容模板",description:"提示词、方案、脚本、图片和视频模板",mimeType:"application/json"},async(uri)=>({contents:[{uri:uri.href,mimeType:"application/json",text:JSON.stringify(commerce.getResource(uri.href,principal),null,2)}]}));
  const resourcePatterns=["laicommerce://projects/{projectId}","laicommerce://projects/{projectId}/brief","laicommerce://projects/{projectId}/facts","laicommerce://projects/{projectId}/sources","laicommerce://projects/{projectId}/artifacts","laicommerce://projects/{projectId}/prompt-specs","laicommerce://brands/{brandId}","laicommerce://products/{productId}","laicommerce://jobs/{jobId}"];
  resourcePatterns.forEach((pattern,index)=>server.registerResource(`dynamic-${index+1}`,new ResourceTemplate(pattern,{list:undefined}),{title:`LaiCommerce resource ${index+1}`,description:"按授权读取平台资源",mimeType:"application/json"},async(uri)=>({contents:[{uri:uri.href,mimeType:"application/json",text:JSON.stringify(commerce.getResource(uri.href,principal),null,2)}]})));
  MCP_TOOL_NAMES.forEach((name)=>{
    const readOnly=/^(workspace\.list|project\.(list|get)|source\.(list|get)|fact\.list|prompt\.(list|get|explain|evaluate|export)|skill\.(list|get)|artifact\.(list|get|compare_versions|export)|campaign\.get_bundle|job\.get|review\.(run|get_status))$/.test(name);
    const destructive=/^(source\.delete|job\.cancel|fact\.(confirm|reject|resolve_conflict))$/.test(name);
    server.registerTool(name,{title:name,description:`${descriptions[name]||name}。权限不足时返回明确错误；写操作只创建或更新获准范围内的草稿。`,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:destructive,idempotentHint:readOnly,openWorldHint:false}},async(args)=>{try{return textResult(await commerce.runTool(name,args as Record<string,unknown>,principal));}catch(error){return errorResult(error);}});
  });
  MCP_PROMPT_NAMES.forEach((name)=>server.registerPrompt(name,{title:name,description:`${name}：使用当前项目事实快照生成有来源、可复核的电商任务提示词。`,argsSchema:{projectId:z.string().optional(),objective:z.string().optional()}},async(args)=>{const result=commerce.generatePrompt(args.projectId||DEMO_PROJECT_ID,args.objective||descriptions[name]||name);return {description:`${name} · 事实快照 ${result.spec.factSnapshotId}`,messages:[{role:"user",content:{type:"text",text:result.variants[1]!.content}}]};}));
  return server;
}

const app=express();
app.disable("x-powered-by");
app.use(cors({origin:["http://127.0.0.1:3000","http://localhost:3000"],methods:["GET","POST","DELETE"],allowedHeaders:["content-type","authorization","mcp-session-id","mcp-protocol-version"]}));
app.use(express.json({limit:"2mb"}));
app.get("/health",(_,res)=>res.json({status:"ok",protocol:"MCP 2025-11-25",transport:"Streamable HTTP",tools:MCP_TOOL_NAMES.length}));

app.all("/mcp",async(req,res)=>{
  try {
    const origin=req.headers.origin;
    if(origin&&!['http://127.0.0.1:3000','http://localhost:3000'].includes(origin))return res.status(403).json({error:"Origin not allowed"});
    const auth=req.headers.authorization;
    if(!auth?.startsWith("Bearer "))return res.status(401).json({error:"Bearer agent token required"});
    const principal=service.authenticate(auth.slice(7));
    const rate=service.repo.checkRateLimit(`mcp:${principal.id}`);
    if(!rate.allowed)return res.status(429).json({error:"Rate limit exceeded"});
    const server=createMcpServer(principal,service);
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
    res.on("close",()=>{void transport.close();void server.close();});
  } catch(error) { const status=error instanceof CommerceError?error.status:500;res.status(status).json({error:{code:error instanceof CommerceError?error.code:"MCP_ERROR",message:error instanceof Error?error.message:"MCP request failed"}}); }
});

const port=Number(process.env.MCP_PORT||3101);
app.listen(port,"127.0.0.1",()=>console.log(`LaiCommerce MCP listening on http://127.0.0.1:${port}/mcp`));

export { app, createMcpServer };
