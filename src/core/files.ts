import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".pnpm-store",
  "vendor",
  "target",
];

export const DEFAULT_MAX_FILES = 5000;
export const DEFAULT_MAX_DEPTH = 12;
export const MAX_READ_BYTES = 1_000_000;

export interface FileEntry {
  path: string;
  size: number;
}

export interface WalkResult {
  files: FileEntry[];
  truncated: boolean;
}

export interface WalkOptions {
  maxFiles?: number;
  maxDepth?: number;
  ignore?: string[];
}

/**
 * List repository files, skipping heavy folders (node_modules, dist, .git, ...)
 * and symlinks. Paths are always relative to the root with forward slashes.
 */
export async function walkFiles(root: string, options: WalkOptions = {}): Promise<WalkResult> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const ignored = new Set([...DEFAULT_IGNORES, ...(options.ignore ?? [])]);
  const files: FileEntry[] = [];
  let truncated = false;

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (truncated || depth > maxDepth) {
      return;
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (truncated) {
        return;
      }
      if (ignored.has(entry.name)) {
        continue;
      }
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      let size = 0;
      try {
        size = (await stat(full)).size;
      } catch {
        continue;
      }
      files.push({ path: path.relative(root, full).split(path.sep).join("/"), size });
    }
  };

  const rootStat = await stat(root).catch(() => undefined);
  if (rootStat === undefined || !rootStat.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  await visit(root, 0);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, truncated };
}

/**
 * Read a text file with a size cap. Returns null for missing or oversized files
 * so callers can skip them without special-casing errors.
 */
export async function readTextFile(file: string, maxBytes = MAX_READ_BYTES): Promise<string | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > maxBytes) {
      return null;
    }
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export function isSourceFile(file: string): boolean {
  return /\.(?:[cm]?[jt]sx?|py)$/i.test(file);
}

export interface FileFilter {
  dir?: string;
  ext?: string;
}

/**
 * Filter a file list by subdirectory prefix and a comma-separated extension
 * list ("ts,tsx" or ".ts,.tsx").
 */
export function applyFileFilter(files: FileEntry[], filter: FileFilter): FileEntry[] {
  let result = files;
  if (filter.dir !== undefined && filter.dir.length > 0) {
    const prefix = `${filter.dir.replace(/^\.\//, "").replace(/\/+$/, "")}/`;
    result = result.filter((entry) => entry.path.startsWith(prefix) || entry.path === prefix.slice(0, -1));
  }
  if (filter.ext !== undefined && filter.ext.length > 0) {
    const extensions = filter.ext
      .split(",")
      .map((entry) => (entry.trim().startsWith(".") ? entry.trim().toLowerCase() : `.${entry.trim().toLowerCase()}`));
    result = result.filter((entry) => extensions.some((suffix) => entry.path.toLowerCase().endsWith(suffix)));
  }
  return result;
}
