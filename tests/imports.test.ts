import { describe, expect, it } from "vitest";
import { findDependents, importsOf, resolveSpecifier } from "../src/core/imports.js";
import { cleanup, makeSampleRepo } from "./helpers/fixture.js";

describe("resolveSpecifier", () => {
  const known = new Set(["src/math.ts", "src/core/store.ts", "src/core/index.ts"]);

  it("rewrites TypeScript .js specifiers onto .ts files", () => {
    expect(resolveSpecifier("src/index.ts", "./math.js", known, "typescript")).toBe("src/math.ts");
  });

  it("resolves directory imports through index files", () => {
    expect(resolveSpecifier("src/app.ts", "./core", known, "typescript")).toBe("src/core/index.ts");
  });

  it("resolves python relative imports", () => {
    const pythonKnown = new Set(["py/core.py", "py/pkg/__init__.py"]);
    expect(resolveSpecifier("py/tool.py", ".core", pythonKnown, "python")).toBe("py/core.py");
    expect(resolveSpecifier("py/pkg/mod.py", "..core", pythonKnown, "python")).toBe("py/core.py");
  });

  it("leaves bare specifiers unresolved", () => {
    expect(resolveSpecifier("src/index.ts", "zod", known, "typescript")).toBeNull();
    expect(resolveSpecifier("py/tool.py", "os", known, "python")).toBeNull();
  });
});

describe("importsOf", () => {
  it("lists imports with kinds and resolutions", async () => {
    const root = await makeSampleRepo();
    try {
      const hits = await importsOf(root, "src/index.ts");
      const math = hits.find((hit) => hit.specifier === "./math.js");
      expect(math?.kind).toBe("import");
      expect(math?.resolved).toBe("src/math.ts");
      const bare = hits.find((hit) => hit.specifier === "node:path");
      expect(bare?.resolved).toBeNull();
    } finally {
      await cleanup(root);
    }
  });

  it("handles require calls and python imports", async () => {
    const root = await makeSampleRepo();
    try {
      const legacy = await importsOf(root, "src/legacy.cjs");
      const required = legacy.find((hit) => hit.kind === "require");
      expect(required?.specifier).toBe("./math.js");
      expect(required?.resolved).toBe("src/math.ts");

      const python = await importsOf(root, "py/tool.py");
      const relative = python.find((hit) => hit.kind === "python-from");
      expect(relative?.resolved).toBe("py/core.py");
      const absolute = python.find((hit) => hit.kind === "python-import");
      expect(absolute?.specifier).toBe("os");
      expect(absolute?.resolved).toBeNull();
    } finally {
      await cleanup(root);
    }
  });

  it("rejects unsupported or missing files", async () => {
    const root = await makeSampleRepo();
    try {
      await expect(importsOf(root, "README.md")).rejects.toThrow("Unsupported source file");
      await expect(importsOf(root, "src/missing.ts")).rejects.toThrow("Cannot read file");
    } finally {
      await cleanup(root);
    }
  });
});

describe("findDependents", () => {
  it("finds every file importing the target", async () => {
    const root = await makeSampleRepo();
    try {
      const result = await findDependents(root, "src/math.ts");
      expect(result.files).toEqual(["src/index.ts", "src/legacy.cjs"]);
      expect(result.scanned).toBeGreaterThan(0);
    } finally {
      await cleanup(root);
    }
  });

  it("finds python dependents", async () => {
    const root = await makeSampleRepo();
    try {
      const result = await findDependents(root, "py/core.py");
      expect(result.files).toEqual(["py/tool.py"]);
    } finally {
      await cleanup(root);
    }
  });

  it("rejects unknown targets", async () => {
    const root = await makeSampleRepo();
    try {
      await expect(findDependents(root, "src/nope.ts")).rejects.toThrow("Not a tracked file");
    } finally {
      await cleanup(root);
    }
  });
});
