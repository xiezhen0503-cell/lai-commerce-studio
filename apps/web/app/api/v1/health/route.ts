import { getCommerceService } from "@lai/shared";
import { getImageProviderStatus, getTextProviderStatus, providerRegistry } from "@lai/providers";
import { ok } from "../../_lib/http";
export const runtime="nodejs";
export async function GET(){const service=getCommerceService();return ok({status:"ok",productionPolicy:{requireLiveOutputs:process.env.LAI_REQUIRE_LIVE_OUTPUTS==="true",mockFallbackAllowed:process.env.LAI_REQUIRE_LIVE_OUTPUTS!=="true"},database:{path:service.repo.filePath,persistent:!service.repo.filePath.startsWith("/tmp/")},providers:{text:getTextProviderStatus(),document:{provider:providerRegistry.document.name,live:true,formats:["pdf","docx","pptx","xlsx","csv","txt","md","jpg","png"]},image:getImageProviderStatus(),video:{provider:"remotion-server-renderer",live:true,preview:true,mp4Render:true,formats:["mp4","png","srt","zip","json"]},external:"optional"},time:new Date().toISOString()});}
