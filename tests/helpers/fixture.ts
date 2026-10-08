import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function makeTempDir(prefix = "repo-map-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeFixtureFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

export const MATH_TS = `export function add(left: number, right: number): number {
  return left + right;
}

export class Calculator {
  add(left: number, right: number): number {
    return left + right;
  }
}

export interface Options {
  deep: boolean;
}

export type Result = number;

export const multiply = (left: number, right: number): number => left * right;
`;

export const TOOL_PY = `from .core import run
import os


class Tool:
    pass


def run() -> int:
    return 1
`;

export async function makeSampleRepo(): Promise<string> {
  const root = await makeTempDir();
  await writeFixtureFile(root, "README.md", "# Sample Project\n\nA tiny sample repository.\n");
  await writeFixtureFile(
    root,
    "package.json",
    JSON.stringify(
      {
        name: "sample",
        version: "1.2.3",
        description: "Sample repo",
        bin: { sample: "./src/cli.ts" },
        scripts: { build: "tsc", test: "vitest" },
      },
      null,
      2,
    ),
  );
  await writeFixtureFile(
    root,
    "src/index.ts",
    `import { add } from "./math.js";
import path from "node:path";

export function main(): void {
  console.log(path.sep, add(1, 2));
}
`,
  );
  await writeFixtureFile(root, "src/math.ts", MATH_TS);
  await writeFixtureFile(root, "src/cli.ts", `#!/usr/bin/env node
import { main } from "./index.js";

main();
`);
  await writeFixtureFile(root, "src/legacy.cjs", `const { add } = require("./math.js");\nmodule.exports = { add };\n`);
  await writeFixtureFile(root, "py/__init__.py", "");
  await writeFixtureFile(root, "py/core.py", "def run() -> int:\n    return 1\n");
  await writeFixtureFile(root, "py/tool.py", TOOL_PY);
  await writeFixtureFile(root, "node_modules/ignored/index.js", "module.exports = {};\n");
  await writeFixtureFile(root, "dist/bundle.js", "// built output\n");
  await writeFixtureFile(root, ".github/workflows/ci.yml", "name: CI\n");
  return root;
}
