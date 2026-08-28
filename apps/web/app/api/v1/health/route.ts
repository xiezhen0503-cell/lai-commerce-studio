import { getCommerceService } from "@lai/shared";
import { getImageProviderStatus, getTextProviderStatus, providerRegistry } from "@lai/providers";
import { ok } from "../../_lib/http";
import { getVideoRendererStatus } from "../../_lib/video-render";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(){const service=getCommerceService();const requireLiveOutputs=process.env.LAI_REQUIRE_LIVE_OUTPUTS==="true";const video=await getVideoRendererStatus();if(requireLiveOutputs&&!video.live)throw new Error(`视频渲染器未就绪：${video.browserError??"请检查渲染入口、浏览器和中文字体"}`);return ok({status:"ok",productionPolicy:{requireLiveOutputs,mockFallbackAllowed:!requireLiveOutputs},database:{path:service.repo.filePath,persistent:!service.repo.filePath.startsWith("/tmp/")},providers:{text:getTextProviderStatus(),document:{provider:providerRegistry.document.name,live:true,formats:["pdf","docx","pptx","xlsx","csv","txt","md","jpg","png"]},image:getImageProviderStatus(),video,external:"optional"},time:new Date().toISOString()});}
