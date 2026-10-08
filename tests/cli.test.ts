import path from "node:path";
import { describe, expect, it } from "vitest";
import { main, type CliIo } from "../src/cli.js";
import { cleanup, makeSampleRepo, makeTempDir } from "./helpers/fixture.js";

function makeIo(): { io: CliIo; out: () => string; err: () => string } {
  let out = "";
  let err = "";
  return {
    io: {
      stdout: (text) => {
        out += `${text}\n`;
      },
      stderr: (text) => {
        err += `${text}\n`;
      },
      color: false,
    },
    out: () => out,
    err: () => err,
  };
}

describe("cli", () => {
  it("prints help and version", async () => {
    const version = makeIo();
    expect(await main(["--version"], version.io)).toBe(0);
    expect(version.out()).toContain("0.1.0");

    const help = makeIo();
    expect(await main([], help.io)).toBe(0);
    expect(help.out()).toContain("Usage:");
    expect(help.out()).toContain("dependents");
  });

  it("maps a repository as json", async () => {
    const root = await makeSampleRepo();
    try {
      const { io, out } = makeIo();
      const code = await main(["map", root, "--json"], io);
      expect(code).toBe(0);
      const payload = JSON.parse(out()) as { packageName: string; entryPoints: string[]; files: number };
      expect(payload.packageName).toBe("sample");
      expect(payload.entryPoints).toContain("src/cli.ts");
      expect(payload.files).toBeGreaterThan(5);
    } finally {
      await cleanup(root);
    }
  });

  it("lists files with filters", async () => {
    const root = await makeSampleRepo();
    try {
      const { io, out } = makeIo();
      const code = await main(["files", root, "--ext", "ts", "--json"], io);
      expect(code).toBe(0);
      const payload = JSON.parse(out()) as { files: Array<{ path: string }>; total: number };
      expect(payload.files.every((entry) => entry.path.endsWith(".ts"))).toBe(true);
      expect(payload.files.some((entry) => entry.path === "src/math.ts")).toBe(true);

      const scoped = makeIo();
      expect(await main(["files", root, "--dir", "py", "--json"], scoped.io)).toBe(0);
      const scopedPayload = JSON.parse(scoped.out()) as { files: Array<{ path: string }> };
      expect(scopedPayload.files.every((entry) => entry.path.startsWith("py/"))).toBe(true);
    } finally {
      await cleanup(root);
    }
  });

  it("finds symbols and their callers", async () => {
    const root = await makeSampleRepo();
    try {
      const find = makeIo();
      expect(await main(["find", "Calculator", root], find.io)).toBe(0);
      expect(find.out()).toContain("[class]");
      expect(find.out()).toContain("src/math.ts:5");

      const imports = makeIo();
      expect(await main(["imports", "src/index.ts", root], imports.io)).toBe(0);
      expect(imports.out()).toContain("./math.js");
      expect(imports.out()).toContain("-> src/math.ts");

      const dependents = makeIo();
      expect(await main(["dependents", "src/math.ts", root], dependents.io)).toBe(0);
      expect(dependents.out()).toContain("src/index.ts");
      expect(dependents.out()).toContain("src/legacy.cjs");
    } finally {
      await cleanup(root);
    }
  });

  it("reports git history state", async () => {
    const root = await makeTempDir();
    try {
      const { io, out } = makeIo();
      expect(await main(["recent", root], io)).toBe(0);
      expect(out()).toContain("Not a git repository");
    } finally {
      await cleanup(root);
    }
  });

  it("fails with actionable messages", async () => {
    const root = await makeSampleRepo();
    try {
      const missingName = makeIo();
      expect(await main(["find"], missingName.io)).toBe(2);
      expect(missingName.err()).toContain("find requires a symbol name");

      const missingFile = makeIo();
      expect(await main(["imports"], missingFile.io)).toBe(2);
      expect(missingFile.err()).toContain("imports requires a file path");

      const badFile = makeIo();
      expect(await main(["imports", "README.md", root], badFile.io)).toBe(1);
      expect(badFile.err()).toContain("Unsupported source file");

      const unknown = makeIo();
      expect(await main(["bogus"], unknown.io)).toBe(2);
      expect(unknown.err()).toContain("Unknown command");

      const badLimit = makeIo();
      expect(await main(["files", root, "--limit", "zero"], badLimit.io)).toBe(1);
      expect(badLimit.err()).toContain("--limit must be a positive integer");
    } finally {
      await cleanup(root);
    }
  });

  it("resolves relative roots", async () => {
    const root = await makeSampleRepo();
    try {
      const { io, out } = makeIo();
      const previous = process.cwd();
      process.chdir(root);
      try {
        expect(await main(["map", ".", "--json"], io)).toBe(0);
        const payload = JSON.parse(out()) as { packageName: string };
        expect(payload.packageName).toBe("sample");
      } finally {
        process.chdir(previous);
      }
      expect(path.basename(root)).not.toBe("");
    } finally {
      await cleanup(root);
    }
  });
});
