import { ArtifactTypeSchema } from "@lai/domain";
import { CommerceError, getCommerceService } from "@lai/shared";
import { z } from "zod";
import { fail, ok, requireWorkbenchAccess, withIdempotency } from "../../../_lib/http";

export const runtime = "nodejs";

const WorkbenchGenerateBodySchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(8).max(500),
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
        return { prompt, bundle };
      }
      const run = await service.runPrompt(projectId, prompt.spec.id, artifactType);
      return { prompt, result: run };
    });
    return ok(result.value, result.replayed ? 200 : 201, { "idempotency-replayed": String(result.replayed) });
  } catch (error) {
    return fail(error);
  }
}
