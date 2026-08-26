import { webhookEnvelope } from "@lai/shared";
import { ok } from "../../../_lib/http";
export async function POST(){return ok(webhookEnvelope("artifact.needs-review",{projectId:"prj_qingmai_launch",artifactId:"art_example"}));}
