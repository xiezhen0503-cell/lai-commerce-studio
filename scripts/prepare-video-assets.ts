import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "packages", "shared", "package.json"));
const source = require.resolve("@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf");
const targetDirectory = path.resolve(process.cwd(), "apps", "web", "public", "fonts");
const target = path.join(targetDirectory, "NotoSansSC-400.ttf");

await fs.mkdir(targetDirectory, { recursive: true });
await fs.copyFile(source, target);
console.log(`Prepared bundled video font: ${path.relative(process.cwd(), target)}`);
