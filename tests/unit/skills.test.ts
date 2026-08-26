import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SKILL_NAMES } from "@lai/shared";

describe("仓库级技能", () => {
  it("17 个技能都有完整合同和 Codex 元数据", () => {
    expect(SKILL_NAMES).toHaveLength(17);
    for (const name of SKILL_NAMES) {
      const root = path.resolve(".agents/skills", name);
      const skill = fs.readFileSync(path.join(root, "SKILL.md"), "utf8");
      const metadata = fs.readFileSync(path.join(root, "agents/openai.yaml"), "utf8");
      for (const section of ["## 触发条件", "## 不应触发", "## 事实证据规则", "## 失败条件", "## 停止条件", "## 转人工条件", "## Side effects"]) expect(skill).toContain(section);
      expect(skill).toContain(`name: ${name}`);
      expect(metadata).toContain("allow_implicit_invocation: true");
    }
  });
});
