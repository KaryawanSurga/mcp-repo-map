import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { recentChanges } from "../src/core/git.js";
import { cleanup, makeTempDir, writeFixtureFile } from "./helpers/fixture.js";

function git(root: string, args: string[]): void {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd: root,
    stdio: "ignore",
  });
}

describe("recentChanges", () => {
  it("returns commits and hotspots for a git repository", async () => {
    const root = await makeTempDir();
    try {
      await writeFixtureFile(root, "app/main.ts", "export function main() {}\n");
      await writeFixtureFile(root, "app/util.ts", "export const x = 1;\n");
      git(root, ["init", "-b", "main"]);
      git(root, ["add", "-A"]);
      git(root, ["commit", "-m", "feat: initial"]);
      await writeFixtureFile(root, "app/main.ts", "export function main() { return 1; }\n");
      git(root, ["add", "-A"]);
      git(root, ["commit", "-m", "fix: tweak main"]);

      const changes = await recentChanges(root);
      expect(changes.isRepo).toBe(true);
      expect(changes.commits).toHaveLength(2);
      expect(changes.commits[0]?.subject).toBe("fix: tweak main");
      expect(changes.commits[0]?.author).toBe("Test");
      const hotspotPaths = changes.hotspots.map((hotspot) => hotspot.path);
      expect(hotspotPaths).toContain("app/main.ts");
      expect(hotspotPaths).toContain("app/util.ts");
    } finally {
      await cleanup(root);
    }
  });

  it("reports non-repositories honestly", async () => {
    const root = await makeTempDir();
    try {
      const changes = await recentChanges(root);
      expect(changes).toEqual({ isRepo: false, commits: [], hotspots: [] });
    } finally {
      await cleanup(root);
    }
  });
});
