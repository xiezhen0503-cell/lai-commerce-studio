import { getCommerceService } from "@lai/shared";
import { getImageProviderStatus, getTextProviderStatus, providerRegistry } from "@lai/providers";
import { ok } from "../../_lib/http";
import { getVideoRendererStatus } from "../../_lib/video-render";
export const runtime="nodejs";
export async function GET(){const service=getCommerceService();return ok({status:"ok",productionPolicy:{requireLiveOutputs:process.env.LAI_REQUIRE_LIVE_OUTPUTS==="true",mockFallbackAllowed:process.env.LAI_REQUIRE_LIVE_OUTPUTS!=="true"},database:{path:service.repo.filePath,persistent:!service.repo.filePath.startsWith("/tmp/")},providers:{text:getTextProviderStatus(),document:{provider:providerRegistry.document.name,live:true,formats:["pdf","docx","pptx","xlsx","csv","txt","md","jpg","png"]},image:getImageProviderStatus(),video:getVideoRendererStatus(),external:"optional"},time:new Date().toISOString()});}
