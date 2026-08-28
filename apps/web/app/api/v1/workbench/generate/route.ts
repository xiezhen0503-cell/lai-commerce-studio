import { ArtifactTypeSchema } from "@lai/domain";
import { CommerceError, getCommerceService } from "@lai/shared";
import { z } from "zod";
import { fail, ok, requireWorkbenchAccess, withIdempotency } from "../../../_lib/http";
import { inspectPlayableMp4, parseCommerceVideoSpec, renderCommercePoster, renderCommerceVideo } from "../../../_lib/video-render";

export const runtime = "nodejs";
export const maxDuration = 300;

const WorkbenchGenerateBodySchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(8).max(2_200),
  task: z.enum(["single", "bundle"]).default("single"),
  artifactType: ArtifactTypeSchema.default("proposal"),
  generationMode: z.enum(["creative", "grounded"]).default("creative")
});

export async function POST(request: Request) {
  try {
    requireWorkbenchAccess(request);
    const parsed = WorkbenchGenerateBodySchema.safeParse(await request.clone().json());
    if (!parsed.success) throw new CommerceError("WORKBENCH_INPUT_INVALID", "请把任务目标写得更具体一些", 400, parsed.error.flatten());
    const body = parsed.data;
    const { projectId, objective, task, artifactType, generationMode } = body;
    const result = await withIdempotency(request, async () => {
      const service = getCommerceService();
      const prompt = service.generatePrompt(projectId, objective, generationMode);
      if (task === "bundle") {
        const bundle = await service.createCampaignBundle(projectId, objective, generationMode);
        const videoArtifact = bundle.artifactIds.map((id) => service.repo.get<any>("artifacts", id)).find((artifact) => artifact?.type === "video");
        let videoRender;
        if (videoArtifact) {
          const version = service.repo.listArtifactVersions(videoArtifact.id).find((item) => item.version === videoArtifact.currentVersion);
          if (!version) throw new CommerceError("VIDEO_VERSION_MISSING", "视频成果缺少可渲染版本", 500);
          const spec = parseCommerceVideoSpec(version.content);
          const [videoPath] = await Promise.all([renderCommerceVideo(spec), renderCommercePoster(spec)]);
          videoRender = await inspectPlayableMp4(videoPath, true);
        }
        return { prompt, bundle, production: { video: videoRender } };
      }
      const run = await service.runPrompt(projectId, prompt.spec.id, artifactType);
      let videoRender;
      if (run.artifact.type === "video") {
        const spec = parseCommerceVideoSpec(run.artifact.version.content);
        const [videoPath] = await Promise.all([renderCommerceVideo(spec), renderCommercePoster(spec)]);
        videoRender = await inspectPlayableMp4(videoPath, true);
      }
      return { prompt, result: run, production: { video: videoRender } };
    });
    return ok(result.value, result.replayed ? 200 : 201, { "idempotency-replayed": String(result.replayed) });
  } catch (error) {
    return fail(error);
  }
}
