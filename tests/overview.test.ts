import { describe, expect, it } from "vitest";
import { buildOverview, renderOverview, renderTree } from "../src/core/overview.js";
import { cleanup, makeSampleRepo } from "./helpers/fixture.js";

describe("buildOverview", () => {
  it("summarizes languages, entry points, and metadata", async () => {
    const root = await makeSampleRepo();
    try {
      const overview = await buildOverview(root);
      expect(overview.files).toBeGreaterThan(8);
      expect(overview.truncated).toBe(false);
      expect(overview.packageName).toBe("sample");
      expect(overview.packageVersion).toBe("1.2.3");
      expect(overview.readmeTitle).toBe("Sample Project");
      expect(overview.scripts).toEqual(["build", "test"]);
      expect(overview.entryPoints).toContain("src/cli.ts");
      const languages = overview.languages.map((stat) => stat.language);
      expect(languages).toContain("typescript");
      expect(languages).toContain("python");
      expect(overview.tree).toContain("src/");
    } finally {
      await cleanup(root);
    }
  });

  it("renders a compact text map with a token budget", async () => {
    const root = await makeSampleRepo();
    try {
      const overview = await buildOverview(root);
      const rendered = renderOverview(overview);
      expect(rendered.text).toContain("# Sample Project");
      expect(rendered.text).toContain("Languages:");
      expect(rendered.text).toContain("Entry points:");
      expect(rendered.truncated).toBe(false);

      const tiny = renderOverview(overview, 30);
      expect(tiny.truncated).toBe(true);
      expect(tiny.tokens).toBeLessThanOrEqual(31);
    } finally {
      await cleanup(root);
    }
  });
});

describe("renderTree", () => {
  it("groups directories with file counts", () => {
    const tree = renderTree(["src/a.ts", "src/core/b.ts", "README.md"]);
    expect(tree).toContain("src/ (2 files)");
    expect(tree).toContain("core/ (1 files)");
    expect(tree).toContain("README.md");
  });

  it("summarizes oversized directories", () => {
    const files = Array.from({ length: 12 }, (_, index) => `dir/file-${index}.ts`);
    const tree = renderTree(files);
    expect(tree).toContain("+4 more");
  });
});
