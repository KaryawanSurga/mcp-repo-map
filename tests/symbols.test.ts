import { describe, expect, it } from "vitest";
import { extractSymbolsFromText, findSymbols, outlineFile } from "../src/core/symbols.js";
import { cleanup, makeSampleRepo, MATH_TS, TOOL_PY } from "./helpers/fixture.js";

describe("extractSymbolsFromText", () => {
  it("finds TypeScript definitions with kinds", () => {
    const hits = extractSymbolsFromText(MATH_TS, "src/math.ts", "typescript");
    const byName = new Map(hits.map((hit) => [hit.name, hit.kind]));
    expect(byName.get("add")).toBe("function");
    expect(byName.get("Calculator")).toBe("class");
    expect(byName.get("Options")).toBe("interface");
    expect(byName.get("Result")).toBe("type");
    expect(byName.get("multiply")).toBe("const-fn");
    expect(hits[0]?.line).toBe(1);
  });

  it("finds Python definitions", () => {
    const hits = extractSymbolsFromText(TOOL_PY, "py/tool.py", "python");
    const byName = new Map(hits.map((hit) => [hit.name, hit.kind]));
    expect(byName.get("Tool")).toBe("class");
    expect(byName.get("run")).toBe("function");
  });
});

describe("findSymbols", () => {
  it("finds substring matches across source files", async () => {
    const root = await makeSampleRepo();
    try {
      const result = await findSymbols(root, "calc");
      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]?.file).toBe("src/math.ts");
      expect(result.hits[0]?.name).toBe("Calculator");
    } finally {
      await cleanup(root);
    }
  });

  it("supports exact matches and kind filters", async () => {
    const root = await makeSampleRepo();
    try {
      const exact = await findSymbols(root, "add", { exact: true });
      expect(exact.hits.map((hit) => hit.file)).toEqual(["src/math.ts"]);

      const classes = await findSymbols(root, "", { kind: "class" });
      const names = classes.hits.map((hit) => hit.name);
      expect(names).toContain("Calculator");
      expect(names).not.toContain("add");
    } finally {
      await cleanup(root);
    }
  });

  it("returns no matches for unknown names", async () => {
    const root = await makeSampleRepo();
    try {
      const result = await findSymbols(root, "definitely-not-there");
      expect(result.hits).toEqual([]);
      expect(result.filesScanned).toBeGreaterThan(0);
    } finally {
      await cleanup(root);
    }
  });
});

describe("outlineFile", () => {
  it("outlines a single file and ignores unsupported types", async () => {
    const root = await makeSampleRepo();
    try {
      const outline = await outlineFile(root, "src/math.ts");
      expect(outline.map((hit) => hit.name)).toContain("Calculator");
      const unsupported = await outlineFile(root, "README.md");
      expect(unsupported).toEqual([]);
    } finally {
      await cleanup(root);
    }
  });
});
