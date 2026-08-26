import { CommerceError, getCommerceService } from "@lai/shared";
import { fail } from "../../../../_lib/http";
export const runtime="nodejs";
export async function GET(_:Request,{params}:{params:Promise<{artifactId:string}>}){try{const {artifactId}=await params;const service=getCommerceService();const artifact=service.repo.get<any>("artifacts",artifactId);if(!artifact)throw new CommerceError("ARTIFACT_NOT_FOUND","没有找到成果",404);const versions=service.repo.listArtifactVersions(artifactId);const version=versions.find(item=>item.version===artifact.currentVersion)||versions[0];return new Response(version?.content||"",{headers:{"content-type":"text/markdown; charset=utf-8","content-disposition":`attachment; filename="${artifactId}.md"`}});}catch(error){return fail(error)}}
