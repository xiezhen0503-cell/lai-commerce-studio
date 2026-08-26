import fs from "node:fs/promises";
import path from "node:path";
export const runtime="nodejs";
export async function GET(){const file=path.resolve(process.env.INIT_CWD||process.cwd(),"docs/openapi.yaml");return new Response(await fs.readFile(file,"utf8"),{headers:{"content-type":"application/yaml; charset=utf-8"}})}
