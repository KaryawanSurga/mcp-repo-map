import path from "node:path";
import { readTextFile, walkFiles } from "./files.js";
import { isSourceLanguage, sourceLanguageOf, type SourceLanguage } from "./languages.js";

export const DEFAULT_SIGNATURE_LENGTH = 140;

export interface SymbolHit {
  file: string;
  line: number;
  kind: string;
  name: string;
  signature: string;
}

interface SymbolPattern {
  kind: string;
  regex: RegExp;
}

const JS_PATTERNS: SymbolPattern[] = [
  { kind: "class", regex: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: "function", regex: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: "interface", regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: "type", regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: "enum", regex: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
  { kind: "const-fn", regex: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function\b)/ },
];

const PY_PATTERNS: SymbolPattern[] = [
  { kind: "class", regex: /^\s*class\s+([A-Za-z_]\w*)/ },
  { kind: "function", regex: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ },
];

function patternsFor(language: SourceLanguage): SymbolPattern[] {
  return language === "python" ? PY_PATTERNS : JS_PATTERNS;
}

export function extractSymbolsFromText(text: string, file: string, language: SourceLanguage): SymbolHit[] {
  const hits: SymbolHit[] = [];
  const patterns = patternsFor(language);
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (line.length > 400) {
      continue;
    }
    for (const pattern of patterns) {
      const match = pattern.regex.exec(line);
      if (match !== null && match[1] !== undefined) {
        hits.push({
          file,
          line: index + 1,
          kind: pattern.kind,
          name: match[1],
          signature: line.trim().slice(0, DEFAULT_SIGNATURE_LENGTH),
        });
        break;
      }
    }
  }
  return hits;
}

export async function outlineFile(root: string, file: string): Promise<SymbolHit[]> {
  const language = sourceLanguageOf(file);
  if (language === null) {
    return [];
  }
  const text = await readTextFile(path.resolve(root, file));
  if (text === null) {
    return [];
  }
  return extractSymbolsFromText(text, file.split(path.sep).join("/"), language);
}

export interface FindSymbolsOptions {
  exact?: boolean;
  kind?: string;
  limit?: number;
  maxFiles?: number;
}

export interface FindSymbolsResult {
  hits: SymbolHit[];
  filesScanned: number;
  truncated: boolean;
}

/**
 * Search symbol definitions across every source file. This is a regex-level
 * extractor — fast and dependency-free, but it does not parse scopes.
 */
export async function findSymbols(
  root: string,
  name: string,
  options: FindSymbolsOptions = {},
): Promise<FindSymbolsResult> {
  const limit = options.limit ?? 50;
  const wanted = name.toLowerCase();
  const walk = await walkFiles(root, options.maxFiles !== undefined ? { maxFiles: options.maxFiles } : {});
  const sourceFiles = walk.files.filter((entry) => isSourceLanguage(entry.path));

  const hits: SymbolHit[] = [];
  let filesScanned = 0;
  let truncated = false;

  for (const entry of sourceFiles) {
    if (hits.length >= limit) {
      truncated = true;
      break;
    }
    const language = sourceLanguageOf(entry.path);
    if (language === null) {
      continue;
    }
    const text = await readTextFile(path.resolve(root, entry.path));
    if (text === null) {
      continue;
    }
    filesScanned += 1;
    for (const hit of extractSymbolsFromText(text, entry.path, language)) {
      if (options.kind !== undefined && hit.kind !== options.kind) {
        continue;
      }
      const candidate = hit.name.toLowerCase();
      const matches = options.exact === true ? candidate === wanted : candidate.includes(wanted);
      if (!matches) {
        continue;
      }
      hits.push(hit);
      if (hits.length >= limit) {
        truncated = true;
        break;
      }
    }
  }

  return { hits, filesScanned, truncated };
}
