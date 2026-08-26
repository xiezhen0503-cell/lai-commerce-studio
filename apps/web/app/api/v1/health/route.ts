import { getCommerceService } from "@lai/shared";
import { getTextProviderStatus, providerRegistry } from "@lai/providers";
import { ok } from "../../_lib/http";
export const runtime="nodejs";
export async function GET(){const service=getCommerceService();return ok({status:"ok",database:service.repo.filePath,providers:{text:getTextProviderStatus(),document:{provider:providerRegistry.document.name,live:true,formats:["pdf","docx","pptx","xlsx","csv","txt","md","jpg","png"]},image:{provider:providerRegistry.image.name,live:true,mode:"deterministic-storyboard-preview",externalGeneration:false},video:{provider:"remotion-player",live:true,preview:true,mp4Render:false},voice:{provider:providerRegistry.voice.name,live:false},external:"optional"},time:new Date().toISOString()});}
