import type { DocumentParserProvider, ImageGenerationProvider, PromptSpec, TextGenerationProvider, VideoRenderProvider, VoiceProvider } from "@lai/domain";
import { detectPromptInjection } from "@lai/security";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_INSTRUCTIONS = `你是 LaiCommerce Studio 的中文电商内容助手。

工作要求：
- 只使用用户输入中明确给出的事实，不补造价格、规格、活动日期、资质、功效或销量。
- 把已确认事实、创意建议和待确认信息分开表达；缺失信息明确标记“待确认”。
- 输出具体、可执行、适合新手继续修改的中文内容，避免模板化空话和夸大承诺。
- 保留输入中的品牌语气、平台要求、证据引用和合规边界。
- 只生成草稿，不声称已经发布、投放、扣费或修改店铺。`;

type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
type TextProviderMode = "auto" | "openai" | "mock";

type OpenAIResponsePayload = {
  model?: string;
  status?: string;
  error?: { message?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: { total_tokens?: number } | null;
};

function textProviderMode(): TextProviderMode {
  const value = process.env.LAI_TEXT_PROVIDER?.trim().toLowerCase();
  return value === "openai" || value === "mock" ? value : "auto";
}

function openAIModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function openAIReasoningEffort(): OpenAIReasoningEffort {
  const value = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  return value === "none" || value === "minimal" || value === "medium" || value === "high" || value === "xhigh" ? value : "low";
}

function openAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function shouldUseOpenAI() {
  const mode = textProviderMode();
  return mode === "openai" || (mode === "auto" && openAIConfigured());
}

function extractOpenAIText(payload: OpenAIResponsePayload) {
  return (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export class MockTextProvider implements TextGenerationProvider {
  name = "mock-text-v1";
  configured = true;
  async generate(spec: PromptSpec, _prompt: string) {
    const start = performance.now();
    await wait(20);
    const proposal = `# ${spec.objective}\n\n## 经营判断\n首轮不追求铺量，先用“真实原料与轻负担场景”验证目标人群的点击、加购与首购转化。所有数字均来自事实快照；未确认的活动价保持空缺。\n\n## 项目目标\n- 在 ${spec.targetPlatforms.join("、")} 完成新品认知与首轮转化验证\n- 用 7 天小样本验证内容钩子，14 天决定是否加码\n\n## 核心策略\n1. 用早餐、午后和轻运动三个具体场景承接需求。\n2. 每条内容只讲一个利益点，并附事实来源。\n3. 把规格、价格、日期放入确定性图层，发布前统一复核。\n\n## 内容矩阵\n- 认知：原料与制作过程\n- 理解：规格、食用方式与适用场景\n- 转化：限时机制（待人工确认活动价与日期）\n\n## 7 天动作\n- 第 1–2 天：完成 3 个开场 A/B 稿\n- 第 3–5 天：小流量测试点击率与完播率\n- 第 6–7 天：按加购成本决定继续加码或暂停\n\n## 风险与待确认\n- 活动价格、活动时间仍需人工确认\n- 不使用治疗、减肥保证或绝对化表述\n`;
    return { text: proposal, model: this.name, latencyMs: Math.round(performance.now() - start), tokenUsage: Math.ceil(proposal.length / 2.2) };
  }
}

export class OpenAIResponsesTextProvider implements TextGenerationProvider {
  name = "openai-responses";
  get configured() { return openAIConfigured(); }

  async generate(_spec: PromptSpec, prompt: string) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("Codex 模型尚未配置：请在服务端设置 OPENAI_API_KEY，密钥不要放进网页或提交到 GitHub。");

    const model = openAIModel();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          ...(process.env.OPENAI_ORG_ID?.trim() ? { "openai-organization": process.env.OPENAI_ORG_ID.trim() } : {}),
          ...(process.env.OPENAI_PROJECT_ID?.trim() ? { "openai-project": process.env.OPENAI_PROJECT_ID.trim() } : {})
        },
        body: JSON.stringify({
          model,
          instructions: OPENAI_INSTRUCTIONS,
          input: prompt,
          reasoning: { effort: openAIReasoningEffort() },
          text: { verbosity: "medium" },
          max_output_tokens: 4_500,
          store: false
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({})) as OpenAIResponsePayload;
      if (!response.ok) {
        const detail = payload.error?.message?.trim();
        throw new Error(`Codex 模型调用失败（${response.status}）${detail ? `：${detail}` : "，请检查服务端模型权限与额度"}`);
      }
      const text = extractOpenAIText(payload);
      if (!text) throw new Error(`Codex 模型没有返回可用文本${payload.status ? `（状态：${payload.status}）` : ""}，请稍后重试。`);
      return {
        text,
        model: payload.model?.trim() || model,
        latencyMs: Math.round(performance.now() - started),
        tokenUsage: payload.usage?.total_tokens ?? 0
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("Codex 模型响应超时，请稍后重试。");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class RoutedTextProvider implements TextGenerationProvider {
  private active() { return shouldUseOpenAI() ? new OpenAIResponsesTextProvider() : new MockTextProvider(); }
  get name() { return this.active().name; }
  get configured() { return this.active().configured; }
  generate(spec: PromptSpec, prompt: string) { return this.active().generate(spec, prompt); }
}

export function getTextProviderStatus() {
  const useOpenAI = shouldUseOpenAI();
  return {
    mode: useOpenAI ? "openai" as const : "mock" as const,
    provider: useOpenAI ? "openai-responses" : "mock-text-v1",
    model: useOpenAI ? openAIModel() : "mock-text-v1",
    configured: useOpenAI ? openAIConfigured() : true,
    live: useOpenAI && openAIConfigured()
  };
}

export class MockDocumentParser implements DocumentParserProvider {
  name = "mock-document-parser-v1";
  configured = true;
  async parse(input: { fileName: string; mimeType: string; bytes: Uint8Array }) {
    const textTypes = ["text/plain", "text/markdown", "text/csv"];
    const raw = textTypes.includes(input.mimeType) ? Buffer.from(input.bytes).toString("utf8") : `已接收 ${input.fileName}。本地 Mock 只提取文件元数据；配置 Docling 后可解析正文、页码、表格和图片说明。`;
    const warnings = detectPromptInjection(raw).length ? ["文档包含疑似指令注入文本，已作为不可信资料隔离，不会覆盖系统或权限规则。"] : [];
    return { text: raw, markdown: `# ${input.fileName}\n\n${raw}`, warnings };
  }
}

export class MockImageProvider implements ImageGenerationProvider {
  name = "mock-image-v1";
  configured = true;
  async generate(input: { prompt: string; width: number; height: number }) {
    const safe = input.prompt.slice(0, 56).replace(/[<>&]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#211f5f"/><stop offset="1" stop-color="#6657e8"/></linearGradient></defs><rect width="100%" height="100%" rx="36" fill="url(#g)"/><circle cx="${input.width * .7}" cy="${input.height * .42}" r="${Math.min(input.width,input.height)*.23}" fill="#d7f7e9" opacity=".92"/><rect x="${input.width*.58}" y="${input.height*.27}" width="${input.width*.24}" height="${input.height*.34}" rx="24" fill="#fff"/><text x="${input.width*.09}" y="${input.height*.18}" fill="#a9f0d2" font-size="${Math.max(20,input.width*.035)}" font-family="sans-serif">MOCK · STORYBOARD</text><text x="${input.width*.09}" y="${input.height*.72}" fill="white" font-size="${Math.max(24,input.width*.048)}" font-family="sans-serif">${safe}</text><text x="${input.width*.09}" y="${input.height*.81}" fill="#d6d5ff" font-size="${Math.max(16,input.width*.025)}" font-family="sans-serif">商品与中文信息将在确定性图层叠加</text></svg>`;
    return { assetUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, metadata: { provider: this.name, mock: true, width: input.width, height: input.height } };
  }
}

export class MockVideoProvider implements VideoRenderProvider {
  name = "mock-remotion-adapter-v1";
  configured = true;
  async render(input: { template: string; props: Record<string, unknown> }) {
    return { previewUri: `/video-preview?template=${encodeURIComponent(input.template)}` };
  }
}

export class MockVoiceProvider implements VoiceProvider {
  name = "mock-voice-v1";
  configured = true;
  async synthesize(input: { text: string; voice?: string; format?: "mp3" | "wav" }) {
    const durationMs = Math.max(800, Math.round(input.text.length / 4.2 * 1000));
    return { audioUri: `mock://voice/${Buffer.from(input.text.slice(0, 24)).toString("base64url")}.${input.format || "mp3"}`, durationMs };
  }
}

export class ExternalProviderAdapter {
  constructor(public name: string, public endpoint?: string, public configured = Boolean(endpoint)) {}
  assertConfigured() { if (!this.configured) throw new Error(`${this.name} 尚未配置；当前流程已回退到 Mock Provider`); }
}

export class OpenAIAdapter extends ExternalProviderAdapter {
  model = openAIModel();
  constructor() { super("OpenAI Responses", OPENAI_RESPONSES_URL, openAIConfigured()); }
}
export class AnthropicAdapter extends ExternalProviderAdapter { constructor() { super("Anthropic", undefined, Boolean(process.env.ANTHROPIC_API_KEY)); } }
export class GeminiAdapter extends ExternalProviderAdapter { constructor() { super("Gemini", undefined, Boolean(process.env.GEMINI_API_KEY)); } }
export class DoclingAdapter extends ExternalProviderAdapter { constructor() { super("Docling", process.env.DOCLING_URL); } }
export class DifyAdapter extends ExternalProviderAdapter { constructor() { super("Dify", process.env.DIFY_URL); } }
export class RAGFlowAdapter extends ExternalProviderAdapter { constructor() { super("RAGFlow", process.env.RAGFLOW_URL); } }
export class ComfyUIAdapter extends ExternalProviderAdapter { constructor() { super("ComfyUI", process.env.COMFYUI_URL); } }
export class RemotionAdapter extends MockVideoProvider {}
export class N8nWebhookAdapter extends ExternalProviderAdapter { constructor() { super("n8n", process.env.N8N_WEBHOOK_URL); } }
export class PromptfooAdapter extends ExternalProviderAdapter { constructor() { super("Promptfoo CLI"); } }
export class LangfuseAdapter extends ExternalProviderAdapter { constructor() { super("Langfuse", undefined, Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)); } }

export const providerRegistry = {
  text: new RoutedTextProvider(), image: new MockImageProvider(), document: new MockDocumentParser(), voice: new MockVoiceProvider(), video: new MockVideoProvider(),
  openai: new OpenAIAdapter(), anthropic: new AnthropicAdapter(), gemini: new GeminiAdapter(), docling: new DoclingAdapter(), dify: new DifyAdapter(),
  ragflow: new RAGFlowAdapter(), comfyui: new ComfyUIAdapter(), n8n: new N8nWebhookAdapter(), langfuse: new LangfuseAdapter(),
  promptfoo: new PromptfooAdapter(), remotion: new RemotionAdapter()
};
