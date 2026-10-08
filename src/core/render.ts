import type { FileEntry } from "./files.js";
import type { FindDependentsResult, ImportHit } from "./imports.js";
import type { RecentChanges } from "./git.js";
import type { FindSymbolsResult } from "./symbols.js";

export function renderFileList(files: FileEntry[], meta: { truncated: boolean; limit: number }): string {
  const lines = files.map((entry) => `${entry.size.toString().padStart(9)} B  ${entry.path}`);
  const footer = meta.truncated
    ? `\n(truncated at ${meta.limit} files)`
    : `\n(${files.length} files)`;
  return `${lines.join("\n")}${footer}`;
}

export function renderSymbolHits(name: string, result: FindSymbolsResult): string {
  if (result.hits.length === 0) {
    return `No symbols matching "${name}" (${result.filesScanned} source files scanned).`;
  }
  const lines = result.hits.map(
    (hit) => `${hit.file}:${hit.line}  [${hit.kind}]  ${hit.signature}`,
  );
  const footer = result.truncated ? `\n(more matches exist; raise the limit to see them)` : "";
  return `${lines.join("\n")}${footer}`;
}

export function renderImports(file: string, hits: ImportHit[]): string {
  if (hits.length === 0) {
    return `No imports found in ${file}.`;
  }
  const lines = hits.map((hit) => {
    const resolved = hit.resolved !== null ? ` -> ${hit.resolved}` : "";
    return `${file}:${hit.line}  ${hit.specifier}  (${hit.kind})${resolved}`;
  });
  return lines.join("\n");
}

export function renderDependents(target: string, result: FindDependentsResult): string {
  if (result.files.length === 0) {
    return `No tracked file imports ${target} (${result.scanned} files scanned).`;
  }
  const lines = result.files.map((file) => `  ${file}`);
  const footer = result.truncated ? `\n(more dependents exist; raise the limit to see them)` : "";
  return `Files importing ${target}:\n${lines.join("\n")}${footer}`;
}

export function renderRecentChanges(changes: RecentChanges): string {
  if (!changes.isRepo) {
    return "Not a git repository (or git is unavailable).";
  }
  const lines: string[] = [];
  lines.push("Recent commits:");
  if (changes.commits.length === 0) {
    lines.push("  (no commits yet)");
  }
  for (const commit of changes.commits) {
    lines.push(`  ${commit.short}  ${commit.date.slice(0, 10)}  ${commit.author}  ${commit.subject}`);
  }
  if (changes.hotspots.length > 0) {
    lines.push("");
    lines.push("Hotspots (most changed files):");
    for (const hotspot of changes.hotspots) {
      lines.push(`  ${hotspot.count.toString().padStart(4)}x  ${hotspot.path}`);
    }
  }
  return lines.join("\n");
}
