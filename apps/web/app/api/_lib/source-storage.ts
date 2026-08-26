import fs from "node:fs/promises";
import path from "node:path";
import type { SourceDocument } from "@lai/domain";
import { safeWorkspacePath } from "@lai/security";

export function resolveUploadRoot() {
  const configured = process.env.UPLOAD_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const databasePath = process.env.DATABASE_PATH?.trim();
  if (databasePath && path.isAbsolute(databasePath)) return path.resolve(path.dirname(databasePath), "lai-uploads");
  return path.resolve(process.env.INIT_CWD || process.cwd(), "data/uploads");
}

export function resolveProjectUploadDirectory(workspaceId: string, projectId: string) {
  return safeWorkspacePath(resolveUploadRoot(), workspaceId, projectId);
}

export function resolveStoredSourcePath(source: SourceDocument) {
  const root = resolveUploadRoot();
  const target = path.resolve(source.storagePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("资料文件不在当前工作区的隔离目录中");
  return target;
}

export async function removeStoredSource(source: SourceDocument) {
  if (source.storagePath.startsWith("demo://")) return;
  const target = resolveStoredSourcePath(source);
  await fs.rm(target, { force: true });
}
