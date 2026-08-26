import fs from "node:fs/promises";
import path from "node:path";
export const runtime="nodejs";
export async function GET(){const roots=[process.env.INIT_CWD,process.cwd(),path.resolve(process.cwd(),"../..")].filter((value):value is string=>Boolean(value));for(const root of roots){try{const content=await fs.readFile(path.resolve(root,"docs/openapi.yaml"),"utf8");return new Response(content,{headers:{"content-type":"application/yaml; charset=utf-8"}});}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}return Response.json({error:{code:"OPENAPI_FILE_NOT_FOUND",message:"接口规范文件未随部署包发布"}},{status:500});}
