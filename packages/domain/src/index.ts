import { z } from "zod";

export const FactStatusSchema = z.enum(["verified", "inferred", "missing", "conflicting", "expired", "user-confirmed"]);
export type FactStatus = z.infer<typeof FactStatusSchema>;

export const FactSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  type: z.string().min(1),
  value: z.string(),
  unit: z.string().optional(),
  status: FactStatusSchema,
  confidence: z.number().min(0).max(1),
  sourceDocumentId: z.string().optional(),
  sourceChunkId: z.string().optional(),
  sourcePosition: z.string().optional(),
  sourceQuote: z.string().optional(),
  confirmedByUser: z.boolean().default(false),
  confirmedAt: z.string().datetime().optional(),
  conflictGroupId: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type Fact = z.infer<typeof FactSchema>;

export const FactSnapshotSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  version: z.number().int().positive(),
  factIds: z.array(z.string()),
  facts: z.array(FactSchema),
  checksum: z.string().min(8),
  createdAt: z.string().datetime(),
  createdBy: z.string().min(1)
});
export type FactSnapshot = z.infer<typeof FactSnapshotSchema>;

export const BrandProfileSchema = z.object({
  id: z.string(), workspaceId: z.string(), name: z.string().min(1), positioning: z.string(), audience: z.string(), story: z.string(),
  tone: z.array(z.string()), preferredWords: z.array(z.string()), bannedWords: z.array(z.string()), colors: z.array(z.string()), fonts: z.array(z.string()),
  allowedClaims: z.array(z.string()), forbiddenClaims: z.array(z.string()), ctas: z.array(z.string()), status: z.enum(["draft", "confirmed"]), updatedAt: z.string().datetime()
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export const ProductSchema = z.object({
  id: z.string(), workspaceId: z.string(), brandId: z.string(), name: z.string(), category: z.string(), sku: z.string(), specification: z.string(),
  price: z.number().nonnegative().optional(), cost: z.number().nonnegative().optional(), inventory: z.number().int().nonnegative().optional(),
  features: z.array(z.string()), evidence: z.array(z.string()), prohibitedClaims: z.array(z.string()), status: z.enum(["draft", "confirmed"]), updatedAt: z.string().datetime()
});
export type Product = z.infer<typeof ProductSchema>;

export const ProjectSchema = z.object({
  id: z.string(), workspaceId: z.string(), name: z.string().min(1), type: z.string(), brandId: z.string(), productIds: z.array(z.string()),
  objective: z.string(), businessGoal: z.string(), targetPlatforms: z.array(z.string()), targetAudience: z.string(), budget: z.number().nonnegative().optional(),
  campaignStart: z.string().optional(), campaignEnd: z.string().optional(), status: z.enum(["draft", "needs-input", "active", "needs-review", "completed"]),
  currentFactSnapshotId: z.string().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type Project = z.infer<typeof ProjectSchema>;

export const SourceDocumentSchema = z.object({
  id: z.string(), workspaceId: z.string(), projectId: z.string(), fileName: z.string(), mimeType: z.string(), size: z.number().int().nonnegative(),
  parser: z.string(), status: z.enum(["uploaded", "parsing", "parsed", "failed", "quarantined"]), storagePath: z.string(), extractedText: z.string().optional(),
  createdAt: z.string().datetime(), parsedAt: z.string().datetime().optional(), error: z.string().optional(), warnings: z.array(z.string()).optional()
});
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

export const PromptSpecSchema = z.object({
  id: z.string(), name: z.string(), version: z.number().int().positive(), taskType: z.string(), objective: z.string(), businessGoal: z.string(),
  projectId: z.string(), brandId: z.string(), productIds: z.array(z.string()), targetAudience: z.string(), targetPlatforms: z.array(z.string()),
  contextReferences: z.array(z.string()), sourceDocumentIds: z.array(z.string()), factSnapshotId: z.string(), requiredFacts: z.array(z.string()),
  creativePreferences: z.array(z.string()), tone: z.array(z.string()), style: z.string(), deliverables: z.array(z.string()), outputFormat: z.string(),
  outputSchema: z.record(z.string(), z.unknown()), constraints: z.array(z.string()), mustInclude: z.array(z.string()), mustAvoid: z.array(z.string()),
  evidencePolicy: z.string(), brandPolicy: z.string(), compliancePolicy: z.string(), qualityRubric: z.array(z.string()), variables: z.record(z.string(), z.unknown()),
  examples: z.array(z.string()), providerHints: z.record(z.string(), z.unknown()), createdBy: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type PromptSpec = z.infer<typeof PromptSpecSchema>;

export const PromptVariantSchema = z.object({ id: z.string(), kind: z.enum(["simple", "professional", "handoff"]), title: z.string(), content: z.string(), createdAt: z.string().datetime() });
export type PromptVariant = z.infer<typeof PromptVariantSchema>;

export const PromptExplanationSchema = z.object({
  objective: z.string(), sources: z.array(z.string()), confirmedFacts: z.array(z.string()), missing: z.array(z.string()), outputs: z.array(z.string()), risks: z.array(z.string()), advice: z.array(z.string())
});

export const EvaluationSchema = z.object({
  id: z.string(), artifactId: z.string().optional(), promptVersionId: z.string().optional(), total: z.number().min(0).max(100), risk: z.enum(["low", "medium", "high", "blocked"]),
  dimensions: z.array(z.object({ key: z.string(), label: z.string(), score: z.number().min(0).max(100), issue: z.string(), suggestion: z.string() })),
  blockers: z.array(z.string()), createdAt: z.string().datetime()
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const ArtifactTypeSchema = z.enum(["proposal", "script", "storyboard", "image-prompt", "image", "video-storyboard", "video", "caption", "schedule", "report", "prompt", "handoff"]);
export const ArtifactSchema = z.object({
  id: z.string(), workspaceId: z.string(), projectId: z.string(), type: ArtifactTypeSchema, title: z.string(), status: z.enum(["draft", "needs-review", "approved", "rejected", "stale"]),
  currentVersion: z.number().int().positive(), factSnapshotId: z.string(), createdByType: z.enum(["human", "platform-ai", "external-agent"]), createdById: z.string(),
  humanModified: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ArtifactVersionSchema = z.object({
  id: z.string(), artifactId: z.string(), version: z.number().int().positive(), content: z.string(), structuredContent: z.record(z.string(), z.unknown()).optional(),
  promptVersionId: z.string().optional(), factSnapshotId: z.string(), changeSummary: z.string(), createdBy: z.string(), createdAt: z.string().datetime()
});
export type ArtifactVersion = z.infer<typeof ArtifactVersionSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "needs-input", "needs-review", "succeeded", "failed", "cancelled"]);
export const GenerationJobSchema = z.object({
  id: z.string(), workspaceId: z.string(), projectId: z.string(), type: z.string(), status: JobStatusSchema, progress: z.number().min(0).max(100), stage: z.string(),
  idempotencyKey: z.string().optional(), resultArtifactIds: z.array(z.string()), error: z.string().optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export const ScopeSchema = z.enum([
  "workspace:read", "brand:read", "product:read", "project:read", "project:write", "source:read", "source:upload", "fact:read", "fact:propose", "fact:confirm",
  "prompt:read", "prompt:write", "prompt:run", "skill:run", "artifact:read", "artifact:write", "artifact:review", "artifact:approve", "artifact:export", "campaign:run", "job:read", "job:cancel", "admin:integrations"
]);
export type Scope = z.infer<typeof ScopeSchema>;
export const DEFAULT_AGENT_SCOPES: Scope[] = ["workspace:read", "brand:read", "product:read", "project:read", "source:read", "fact:read", "prompt:read", "prompt:write", "prompt:run", "skill:run", "artifact:read", "artifact:write", "artifact:review", "job:read"];

export const AgentHandoffSchema = z.object({
  handoffId: z.string(), taskId: z.string(), objective: z.string(), projectId: z.string(), projectContextUri: z.string(), sourceUris: z.array(z.string()),
  factSnapshotId: z.string(), promptSpecId: z.string(), constraints: z.array(z.string()), expectedOutputSchema: z.record(z.string(), z.unknown()), allowedTools: z.array(z.string()),
  permissionScope: z.array(ScopeSchema), approvalPolicy: z.enum(["always-human", "risk-based"]), callback: z.string().url().optional(), createdBy: z.string(), createdAt: z.string().datetime(), expiresAt: z.string().datetime()
});
export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;

export interface PromptGenerationResult {
  spec: PromptSpec;
  variants: PromptVariant[];
  explanation: z.infer<typeof PromptExplanationSchema>;
  evaluation: Evaluation;
}

export interface CampaignBundleResult {
  id: string;
  projectId: string;
  factSnapshotId: string;
  jobId: string;
  artifactIds: string[];
  createdAt: string;
}

export interface TextGenerationProvider { name: string; configured: boolean; generate(spec: PromptSpec, prompt: string): Promise<{ text: string; model: string; latencyMs: number; tokenUsage: number }> }
export interface EmbeddingProvider { name: string; configured: boolean; embed(texts: string[]): Promise<{ vectors: number[][]; model: string }> }
export interface DocumentParserProvider { name: string; configured: boolean; parse(input: { fileName: string; mimeType: string; bytes: Uint8Array }): Promise<{ text: string; markdown: string; warnings: string[] }> }
export interface KnowledgeRetrievalProvider { name: string; configured: boolean; search(query: string, options?: { projectId?: string; limit?: number }): Promise<Array<{ uri: string; text: string; score: number }>> }
export interface ImageGenerationProvider { name: string; configured: boolean; generate(input: { prompt: string; width: number; height: number; referenceImages?: Array<{ dataUri: string }> }): Promise<{ assetUri: string; metadata: Record<string, unknown> }> }
export interface ImageCompositionProvider { name: string; configured: boolean; compose(input: { layers: Array<{ uri?: string; text?: string; x: number; y: number }>; width: number; height: number }): Promise<{ assetUri: string }> }
export interface VoiceProvider { name: string; configured: boolean; synthesize(input: { text: string; voice?: string; format?: "mp3" | "wav" }): Promise<{ audioUri: string; durationMs: number }> }
export interface VideoGenerationProvider { name: string; configured: boolean; generate(input: { prompt: string; durationSeconds: number; aspectRatio: string }): Promise<{ previewUri: string; jobId?: string }> }
export interface VideoRenderProvider { name: string; configured: boolean; render(input: { template: string; props: Record<string, unknown> }): Promise<{ previewUri: string; outputUri?: string }> }
export interface AutomationProvider { name: string; configured: boolean; trigger(input: { workflow: string; payload: Record<string, unknown> }): Promise<{ runId: string; status: string }> }
export interface StorageProvider { name: string; configured: boolean; put(input: { key: string; bytes: Uint8Array; mimeType: string }): Promise<{ uri: string }>; get(uri: string): Promise<Uint8Array> }
export interface ObservabilityProvider { name: string; configured: boolean; record(event: { traceId: string; name: string; attributes: Record<string, unknown> }): Promise<void> }
export interface PromptEvaluationProvider { name: string; configured: boolean; evaluate(spec: PromptSpec, output: string): Promise<{ score: number; issues: string[] }> }

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
