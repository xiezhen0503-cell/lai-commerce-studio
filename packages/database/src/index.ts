import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Artifact, ArtifactVersion, Fact, FactSnapshot, GenerationJob, Product, Project, SourceDocument, BrandProfile } from "@lai/domain";

export const ENTITY_TABLES = [
  "workspaces", "human_users", "agent_service_accounts", "agent_connections", "agent_permissions", "brands", "products", "projects", "source_documents", "source_chunks", "facts", "fact_snapshots", "claims", "campaign_briefs", "prompt_specs", "prompt_versions", "prompt_runs", "skill_definitions", "skill_runs", "artifacts", "artifact_versions", "generation_jobs", "evaluations", "review_requests", "templates", "integration_connections", "campaign_bundles", "assets", "webhook_endpoints", "webhook_deliveries", "audit_events", "agent_handoffs"
] as const;
export type EntityTable = (typeof ENTITY_TABLES)[number];

const TABLE_SET = new Set<string>(ENTITY_TABLES);
const safeTable = (table: EntityTable) => {
  if (!TABLE_SET.has(table)) throw new Error(`Unsupported table: ${table}`);
  return table;
};

const tableDdl = (table: EntityTable) => `
  CREATE TABLE IF NOT EXISTS ${table} (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'ws_demo',
    project_id TEXT,
    status TEXT,
    version INTEGER,
    parent_id TEXT,
    token_hash TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_${table}_workspace ON ${table}(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_${table}_project ON ${table}(project_id);
`;

export function resolveDatabasePath() {
  const root = process.env.INIT_CWD || process.cwd();
  return path.resolve(root, process.env.DATABASE_PATH || "data/laicommerce.db");
}

export class CommerceRepository {
  readonly db: Database.Database;
  readonly filePath: string;

  constructor(filePath = resolveDatabasePath()) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
      ${ENTITY_TABLES.map(tableDdl).join("\n")}
    `);
    this.db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)").run(new Date().toISOString());
  }

  close() { this.db.close(); }

  save<T extends { id: string }>(table: EntityTable, value: T, meta?: { workspaceId?: string; projectId?: string; status?: string; version?: number; parentId?: string; tokenHash?: string; expiresAt?: string; revokedAt?: string }) {
    const name = safeTable(table);
    const raw = value as Record<string, unknown>;
    const now = new Date().toISOString();
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : now;
    const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : now;
    this.db.prepare(`INSERT INTO ${name}(id, workspace_id, project_id, status, version, parent_id, token_hash, expires_at, revoked_at, data, created_at, updated_at)
      VALUES(@id,@workspaceId,@projectId,@status,@version,@parentId,@tokenHash,@expiresAt,@revokedAt,@data,@createdAt,@updatedAt)
      ON CONFLICT(id) DO UPDATE SET workspace_id=excluded.workspace_id, project_id=excluded.project_id, status=excluded.status, version=excluded.version, parent_id=excluded.parent_id, token_hash=COALESCE(excluded.token_hash,${name}.token_hash), expires_at=excluded.expires_at, revoked_at=excluded.revoked_at, data=excluded.data, updated_at=excluded.updated_at`).run({
      id: value.id,
      workspaceId: meta?.workspaceId ?? String(raw.workspaceId ?? "ws_demo"),
      projectId: meta?.projectId ?? (typeof raw.projectId === "string" ? raw.projectId : null),
      status: meta?.status ?? (typeof raw.status === "string" ? raw.status : null),
      version: meta?.version ?? (typeof raw.version === "number" ? raw.version : null),
      parentId: meta?.parentId ?? null,
      tokenHash: meta?.tokenHash ?? null,
      expiresAt: meta?.expiresAt ?? null,
      revokedAt: meta?.revokedAt ?? null,
      data: JSON.stringify(value), createdAt, updatedAt
    });
    return value;
  }

  get<T>(table: EntityTable, id: string, workspaceId = "ws_demo"): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${safeTable(table)} WHERE id = ? AND workspace_id = ?`).get(id, workspaceId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as T : undefined;
  }

  list<T>(table: EntityTable, filters: { workspaceId?: string; projectId?: string; status?: string; parentId?: string; limit?: number } = {}): T[] {
    const where = ["workspace_id = @workspaceId"];
    if (filters.projectId) where.push("project_id = @projectId");
    if (filters.status) where.push("status = @status");
    if (filters.parentId) where.push("parent_id = @parentId");
    const rows = this.db.prepare(`SELECT data FROM ${safeTable(table)} WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT @limit`).all({
      workspaceId: filters.workspaceId ?? "ws_demo", projectId: filters.projectId ?? null, status: filters.status ?? null, parentId: filters.parentId ?? null, limit: filters.limit ?? 200
    }) as { data: string }[];
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  delete(table: EntityTable, id: string, workspaceId = "ws_demo") {
    return this.db.prepare(`DELETE FROM ${safeTable(table)} WHERE id = ? AND workspace_id = ?`).run(id, workspaceId).changes > 0;
  }

  deleteProjectData(projectId: string, workspaceId = "ws_demo") {
    const projectTables = ENTITY_TABLES.filter((table) => table !== "projects" && table !== "brands" && table !== "products" && table !== "workspaces" && table !== "human_users");
    const remove = this.db.transaction(() => Object.fromEntries(projectTables.map((table) => {
      const changes = this.db.prepare(`DELETE FROM ${safeTable(table)} WHERE project_id = ? AND workspace_id = ?`).run(projectId, workspaceId).changes;
      return [table, changes];
    })));
    return remove() as Partial<Record<EntityTable, number>>;
  }

  getByTokenHash<T>(hash: string): T | undefined {
    const row = this.db.prepare("SELECT data FROM agent_service_accounts WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)").get(hash, new Date().toISOString()) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as T : undefined;
  }

  revokeToken(id: string, workspaceId = "ws_demo") {
    const now = new Date().toISOString();
    return this.db.prepare("UPDATE agent_service_accounts SET revoked_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").run(now, now, id, workspaceId).changes > 0;
  }

  rememberIdempotency<T>(key: string, response: T) {
    this.db.prepare("INSERT OR REPLACE INTO idempotency_keys(key,response,created_at) VALUES(?,?,?)").run(key, JSON.stringify(response), new Date().toISOString());
  }

  getIdempotency<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT response FROM idempotency_keys WHERE key = ?").get(key) as { response: string } | undefined;
    return row ? JSON.parse(row.response) as T : undefined;
  }

  checkRateLimit(key: string, limit = 120, windowMs = 60_000) {
    const now = Date.now();
    const row = this.db.prepare("SELECT window_start, count FROM rate_limits WHERE key = ?").get(key) as { window_start: number; count: number } | undefined;
    if (!row || now - row.window_start >= windowMs) {
      this.db.prepare("INSERT OR REPLACE INTO rate_limits(key,window_start,count) VALUES(?,?,1)").run(key, now);
      return { allowed: true, remaining: limit - 1 };
    }
    if (row.count >= limit) return { allowed: false, remaining: 0 };
    this.db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
    return { allowed: true, remaining: Math.max(0, limit - row.count - 1) };
  }

  saveProject(value: Project) { return this.save("projects", value, { workspaceId: value.workspaceId, projectId: value.id, status: value.status }); }
  listProjects(workspaceId = "ws_demo") { return this.list<Project>("projects", { workspaceId }); }
  saveBrand(value: BrandProfile) { return this.save("brands", value, { workspaceId: value.workspaceId, status: value.status }); }
  listBrands(workspaceId = "ws_demo") { return this.list<BrandProfile>("brands", { workspaceId }); }
  saveProduct(value: Product) { return this.save("products", value, { workspaceId: value.workspaceId, status: value.status }); }
  listProducts(workspaceId = "ws_demo") { return this.list<Product>("products", { workspaceId }); }
  saveSource(value: SourceDocument) { return this.save("source_documents", value, { workspaceId: value.workspaceId, projectId: value.projectId, status: value.status }); }
  listSources(projectId: string, workspaceId = "ws_demo") { return this.list<SourceDocument>("source_documents", { workspaceId, projectId }); }
  saveFact(value: Fact, workspaceId = "ws_demo") { return this.save("facts", value, { workspaceId, projectId: value.projectId, status: value.status }); }
  listFacts(projectId: string, workspaceId = "ws_demo") { return this.list<Fact>("facts", { workspaceId, projectId }); }
  saveSnapshot(value: FactSnapshot, workspaceId = "ws_demo") { return this.save("fact_snapshots", value, { workspaceId, projectId: value.projectId, version: value.version }); }
  listSnapshots(projectId: string, workspaceId = "ws_demo") { return this.list<FactSnapshot>("fact_snapshots", { workspaceId, projectId }); }
  saveArtifact(value: Artifact) { return this.save("artifacts", value, { workspaceId: value.workspaceId, projectId: value.projectId, status: value.status, version: value.currentVersion }); }
  listArtifacts(projectId: string, workspaceId = "ws_demo") { return this.list<Artifact>("artifacts", { workspaceId, projectId }); }
  saveArtifactVersion(value: ArtifactVersion, workspaceId = "ws_demo", projectId?: string) { return this.save("artifact_versions", value, { workspaceId, projectId, parentId: value.artifactId, version: value.version }); }
  listArtifactVersions(artifactId: string, workspaceId = "ws_demo") { return this.list<ArtifactVersion>("artifact_versions", { workspaceId, parentId: artifactId }); }
  saveJob(value: GenerationJob) { return this.save("generation_jobs", value, { workspaceId: value.workspaceId, projectId: value.projectId, status: value.status }); }
}

declare global { var __laiRepository: CommerceRepository | undefined; }
export const getRepository = () => globalThis.__laiRepository ??= new CommerceRepository();
