import path from "node:path";
import { isSourceFile, readTextFile, walkFiles } from "./files.js";
import { sourceLanguageOf, type SourceLanguage } from "./languages.js";

export type ImportKind = "import" | "require" | "dynamic-import" | "export-from" | "python-import" | "python-from";

export interface ImportHit {
  specifier: string;
  kind: ImportKind;
  line: number;
  resolved: string | null;
}

interface RawImport {
  specifier: string;
  kind: ImportKind;
  line: number;
}

const JS_RULES: Array<{ kind: ImportKind; regex: RegExp }> = [
  { kind: "import", regex: /^\s*import\s[^;]*?\sfrom\s+["']([^"']+)["']/ },
  { kind: "import", regex: /^\s*import\s+["']([^"']+)["']/ },
  { kind: "export-from", regex: /^\s*export\s[^;]*?\sfrom\s+["']([^"']+)["']/ },
  { kind: "dynamic-import", regex: /\bimport\(\s*["']([^"']+)["']\s*\)/ },
  { kind: "require", regex: /\brequire\(\s*["']([^"']+)["']\s*\)/ },
];

const PY_RULES: Array<{ kind: ImportKind; regex: RegExp }> = [
  { kind: "python-from", regex: /^\s*from\s+([.A-Za-z_][\w.]*)\s+import\b/ },
  { kind: "python-import", regex: /^\s*import\s+([A-Za-z_][\w.]*)/ },
];

const JS_RESOLUTION_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
];

/** TypeScript projects import "./x.js" while the file on disk is "./x.ts". */
function resolutionCandidates(base: string): string[] {
  const candidates: string[] = [];
  const rewritten = /^(.*)\.(?:js|mjs|cjs)$/.exec(base);
  if (rewritten !== null && rewritten[1] !== undefined) {
    for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
      candidates.push(rewritten[1] + extension);
    }
  }
  for (const suffix of JS_RESOLUTION_SUFFIXES) {
    candidates.push(base + suffix);
  }
  return candidates;
}

function rawImportsFromText(text: string, language: SourceLanguage): RawImport[] {
  const rules = language === "python" ? PY_RULES : JS_RULES;
  const hits: RawImport[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.length > 500) {
      continue;
    }
    for (const rule of rules) {
      const match = rule.regex.exec(line);
      if (match !== null && match[1] !== undefined) {
        hits.push({ specifier: match[1], kind: rule.kind, line: index + 1 });
        break;
      }
    }
  }
  return hits;
}

export function resolveSpecifier(
  fromFile: string,
  specifier: string,
  known: Set<string>,
  language: SourceLanguage,
): string | null {
  if (language === "python") {
    if (!specifier.startsWith(".")) {
      return null;
    }
    const leading = /^\.+/.exec(specifier)?.[0] ?? ".";
    const dots = leading.length;
    const remainder = specifier.slice(dots);
    const climb = dots - 1;
    let base = path.posix.dirname(fromFile);
    for (let i = 0; i < climb; i++) {
      base = path.posix.dirname(base);
    }
    const modulePath = remainder.replace(/\./g, "/");
    const joined = modulePath.length > 0 ? path.posix.join(base, modulePath) : base;
    const candidates = [`${joined}.py`, `${joined}/__init__.py`];
    for (const candidate of candidates) {
      if (known.has(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  const isRelative =
    specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..";
  if (!isRelative) {
    return null;
  }
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  for (const candidate of resolutionCandidates(base)) {
    if (known.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function extractImportsFromText(
  text: string,
  file: string,
  language: SourceLanguage,
  known: Set<string>,
): ImportHit[] {
  return rawImportsFromText(text, language).map((hit) => ({
    specifier: hit.specifier,
    kind: hit.kind,
    line: hit.line,
    resolved: resolveSpecifier(file, hit.specifier, known, language),
  }));
}

export async function importsOf(root: string, file: string): Promise<ImportHit[]> {
  const language = sourceLanguageOf(file);
  if (language === null) {
    throw new Error(`Unsupported source file: ${file}`);
  }
  const text = await readTextFile(path.resolve(root, file));
  if (text === null) {
    throw new Error(`Cannot read file: ${file}`);
  }
  const walk = await walkFiles(root);
  const known = new Set(walk.files.map((entry) => entry.path));
  return extractImportsFromText(text, file.split(path.sep).join("/"), language, known);
}

export interface FindDependentsResult {
  files: string[];
  scanned: number;
  truncated: boolean;
}

export async function findDependents(
  root: string,
  target: string,
  options: { limit?: number } = {},
): Promise<FindDependentsResult> {
  const limit = options.limit ?? 100;
  const normalizedTarget = path.posix.normalize(target.split(path.sep).join("/"));
  const walk = await walkFiles(root);
  const known = new Set(walk.files.map((entry) => entry.path));
  if (!known.has(normalizedTarget)) {
    throw new Error(`Not a tracked file: ${normalizedTarget}`);
  }

  const dependents: string[] = [];
  let scanned = 0;
  let truncated = false;

  for (const entry of walk.files) {
    if (!isSourceFile(entry.path)) {
      continue;
    }
    const language = sourceLanguageOf(entry.path);
    if (language === null) {
      continue;
    }
    const text = await readTextFile(path.resolve(root, entry.path));
    if (text === null) {
      continue;
    }
    scanned += 1;
    const imports = extractImportsFromText(text, entry.path, language, known);
    if (imports.some((hit) => hit.resolved === normalizedTarget)) {
      dependents.push(entry.path);
      if (dependents.length >= limit) {
        truncated = true;
        break;
      }
    }
  }

  return { files: dependents, scanned, truncated };
}
