import path from "node:path";
import { readTextFile, walkFiles } from "./files.js";
import { languageOf } from "./languages.js";
import { clampToBudget, DEFAULT_BUDGET } from "./tokens.js";

export interface LanguageStat {
  language: string;
  files: number;
  bytes: number;
}

export interface RepoOverview {
  root: string;
  files: number;
  bytes: number;
  truncated: boolean;
  languages: LanguageStat[];
  tree: string;
  entryPoints: string[];
  scripts: string[];
  packageName?: string;
  packageVersion?: string;
  description?: string;
  readmeTitle?: string;
}

export interface OverviewOptions {
  maxFiles?: number;
  treeDepth?: number;
}

const DEFAULT_ENTRY_POINTS = [
  "src/index.ts",
  "src/index.mts",
  "src/index.mjs",
  "src/index.js",
  "src/main.ts",
  "src/cli.ts",
  "src/main.py",
  "src/__main__.py",
  "index.ts",
  "index.js",
  "index.mjs",
  "main.py",
  "app.py",
  "__main__.py",
  "main.go",
  "cmd/main.go",
  "src/main.rs",
];

interface TreeNode {
  dirs: Map<string, TreeNode>;
  files: string[];
  fileCount: number;
}

function newTree(): TreeNode {
  return { dirs: new Map(), files: [], fileCount: 0 };
}

function insert(tree: TreeNode, filePath: string): void {
  const segments = filePath.split("/");
  let node = tree;
  node.fileCount += 1;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index] ?? "";
    const last = index === segments.length - 1;
    if (last) {
      node.files.push(segment);
      return;
    }
    let child = node.dirs.get(segment);
    if (child === undefined) {
      child = newTree();
      node.dirs.set(segment, child);
    }
    child.fileCount += 1;
    node = child;
  }
}

const DIRECTORY_LIMIT = 8;

function renderNode(node: TreeNode, depth: number, maxDepth: number, prefix: string): string[] {
  const lines: string[] = [];
  const dirs = [...node.dirs.entries()].sort(([left], [right]) => left.localeCompare(right));
  const files = [...node.files].sort((left, right) => left.localeCompare(right));
  const shownDirs = dirs.slice(0, DIRECTORY_LIMIT);
  const shownFiles = files.slice(0, Math.max(0, DIRECTORY_LIMIT - shownDirs.length));
  const hidden = dirs.length - shownDirs.length + (files.length - shownFiles.length);

  const entries: Array<{ name: string; dir: TreeNode | null }> = [
    ...shownDirs.map(([name, dir]) => ({ name, dir })),
    ...shownFiles.map((name) => ({ name, dir: null as TreeNode | null })),
  ];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1 && hidden === 0;
    const glyph = isLast ? "└─" : "├─";
    const childPrefix = prefix + (isLast ? "   " : "│  ");
    if (entry.dir === null) {
      lines.push(`${prefix}${glyph} ${entry.name}`);
      return;
    }
    lines.push(`${prefix}${glyph} ${entry.name}/ (${entry.dir.fileCount} files)`);
    if (depth + 1 < maxDepth) {
      lines.push(...renderNode(entry.dir, depth + 1, maxDepth, childPrefix));
    }
  });

  if (hidden > 0) {
    lines.push(`${prefix}└─ +${hidden} more`);
  }
  return lines;
}

export function renderTree(paths: string[], maxDepth = 3): string {
  const tree = newTree();
  for (const filePath of paths) {
    insert(tree, filePath);
  }
  return renderNode(tree, 0, maxDepth, "").join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function packageEntryCandidates(pkg: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const bin = pkg["bin"];
  if (typeof bin === "string") {
    candidates.push(bin);
  } else if (isRecord(bin)) {
    for (const value of Object.values(bin)) {
      if (typeof value === "string") {
        candidates.push(value);
      }
    }
  }
  for (const key of ["main", "module"]) {
    const value = pkg[key];
    if (typeof value === "string") {
      candidates.push(value);
    }
  }
  return candidates.map((entry) => entry.replace(/^\.\//, ""));
}

function readmeTitle(text: string): string | undefined {
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = /^#\s+(.+)/.exec(line);
    if (match !== null && match[1] !== undefined) {
      return match[1].trim();
    }
  }
  return undefined;
}

export async function buildOverview(root: string, options: OverviewOptions = {}): Promise<RepoOverview> {
  const walkOptions: { maxFiles?: number } = {};
  if (options.maxFiles !== undefined) {
    walkOptions.maxFiles = options.maxFiles;
  }
  const walk = await walkFiles(root, walkOptions);

  const byLanguage = new Map<string, LanguageStat>();
  let bytes = 0;
  for (const entry of walk.files) {
    bytes += entry.size;
    const language = languageOf(entry.path);
    const stat = byLanguage.get(language) ?? { language, files: 0, bytes: 0 };
    stat.files += 1;
    stat.bytes += entry.size;
    byLanguage.set(language, stat);
  }
  const languages = [...byLanguage.values()].sort(
    (left, right) =>
      right.files - left.files || right.bytes - left.bytes || left.language.localeCompare(right.language),
  );

  const known = new Set(walk.files.map((entry) => entry.path));
  const overview: RepoOverview = {
    root: path.resolve(root),
    files: walk.files.length,
    bytes,
    truncated: walk.truncated,
    languages,
    tree: renderTree(walk.files.map((entry) => entry.path), options.treeDepth ?? 3),
    entryPoints: [],
    scripts: [],
  };

  const packageText = await readTextFile(path.join(root, "package.json"));
  const candidates: string[] = [];
  if (packageText !== null) {
    try {
      const pkg: unknown = JSON.parse(packageText);
      if (isRecord(pkg)) {
        if (typeof pkg["name"] === "string") {
          overview.packageName = pkg["name"];
        }
        if (typeof pkg["version"] === "string") {
          overview.packageVersion = pkg["version"];
        }
        if (typeof pkg["description"] === "string") {
          overview.description = pkg["description"];
        }
        const scripts = pkg["scripts"];
        if (isRecord(scripts)) {
          overview.scripts = Object.keys(scripts).sort();
        }
        candidates.push(...packageEntryCandidates(pkg));
      }
    } catch {
      // A broken package.json should not break the map.
    }
  }
  candidates.push(...DEFAULT_ENTRY_POINTS);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.split(path.sep).join("/");
    if (known.has(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      overview.entryPoints.push(normalized);
    }
  }

  const readme = await readTextFile(path.join(root, "README.md"));
  if (readme !== null) {
    const title = readmeTitle(readme);
    if (title !== undefined) {
      overview.readmeTitle = title;
    }
  }

  return overview;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderOverview(
  overview: RepoOverview,
  budget: number = DEFAULT_BUDGET,
): { text: string; tokens: number; truncated: boolean } {
  const lines: string[] = [];
  const title = overview.readmeTitle ?? overview.packageName ?? "repository";
  lines.push(`# ${title}`);
  if (overview.description !== undefined) {
    lines.push(overview.description);
  }
  lines.push("");
  lines.push(`Root: ${overview.root}`);
  lines.push(`Size: ${overview.files} files, ${formatBytes(overview.bytes)}${overview.truncated ? " (truncated)" : ""}`);
  if (overview.packageName !== undefined) {
    lines.push(`Package: ${overview.packageName}@${overview.packageVersion ?? "0.0.0"}`);
  }

  if (overview.languages.length > 0) {
    lines.push("");
    lines.push("Languages:");
    for (const stat of overview.languages.slice(0, 10)) {
      lines.push(`  ${stat.language}: ${stat.files} files, ${formatBytes(stat.bytes)}`);
    }
  }

  if (overview.entryPoints.length > 0) {
    lines.push("");
    lines.push("Entry points:");
    for (const entry of overview.entryPoints.slice(0, 8)) {
      lines.push(`  ${entry}`);
    }
  }

  if (overview.scripts.length > 0) {
    lines.push("");
    lines.push(`Scripts: ${overview.scripts.join(", ")}`);
  }

  lines.push("");
  lines.push("Tree:");
  lines.push(overview.tree);

  const text = lines.join("\n");
  const clamped = clampToBudget(text, budget);
  return { text: clamped.text, tokens: clamped.tokens, truncated: clamped.truncated };
}
