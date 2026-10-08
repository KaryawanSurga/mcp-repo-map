import { describe, expect, it } from "vitest";
import { walkFiles } from "../src/core/files.js";
import { cleanup, makeSampleRepo, makeTempDir } from "./helpers/fixture.js";

describe("walkFiles", () => {
  it("discovers files while skipping heavy directories", async () => {
    const root = await makeSampleRepo();
    try {
      const { files, truncated } = await walkFiles(root);
      expect(truncated).toBe(false);
      const paths = files.map((entry) => entry.path);
      expect(paths).toContain("README.md");
      expect(paths).toContain("src/math.ts");
      expect(paths).toContain("py/core.py");
      expect(paths).toContain(".github/workflows/ci.yml");
      expect(paths.some((entry) => entry.startsWith("node_modules/"))).toBe(false);
      expect(paths.some((entry) => entry.startsWith("dist/"))).toBe(false);
      expect(paths).toEqual([...paths].sort((left, right) => left.localeCompare(right)));
    } finally {
      await cleanup(root);
    }
  });

  it("truncates at the file limit", async () => {
    const root = await makeSampleRepo();
    try {
      const { files, truncated } = await walkFiles(root, { maxFiles: 3 });
      expect(truncated).toBe(true);
      expect(files).toHaveLength(3);
    } finally {
      await cleanup(root);
    }
  });

  it("honors the depth limit", async () => {
    const root = await makeSampleRepo();
    try {
      const { files } = await walkFiles(root, { maxDepth: 0 });
      const paths = files.map((entry) => entry.path);
      expect(paths).toContain("README.md");
      expect(paths).toContain("package.json");
      expect(paths.some((entry) => entry.startsWith("src/"))).toBe(false);
    } finally {
      await cleanup(root);
    }
  });

  it("respects custom ignores", async () => {
    const root = await makeSampleRepo();
    try {
      const { files } = await walkFiles(root, { ignore: ["py"] });
      expect(files.some((entry) => entry.path.startsWith("py/"))).toBe(false);
    } finally {
      await cleanup(root);
    }
  });

  it("throws for missing directories", async () => {
    const root = await makeTempDir();
    try {
      await expect(walkFiles(`${root}/nope`)).rejects.toThrow("Not a directory");
    } finally {
      await cleanup(root);
    }
  });
});
