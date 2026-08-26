import fs from "node:fs";
import path from "node:path";
import { CommerceRepository, resolveDatabasePath } from "@lai/database";
import { seedDemoData } from "@lai/shared";

const filePath = resolveDatabasePath();
const reset = process.argv.includes("--reset");
if (reset && fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
fs.mkdirSync(path.dirname(filePath), { recursive: true });
const repository = new CommerceRepository(filePath);
seedDemoData(repository);
repository.close();
console.log(`演示数据库已就绪：${filePath}`);
