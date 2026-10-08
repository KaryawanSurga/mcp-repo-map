import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { applyFileFilter, walkFiles } from "./core/files.js";
import { recentChanges } from "./core/git.js";
import { findDependents, importsOf } from "./core/imports.js";
import { buildOverview, renderOverview } from "./core/overview.js";
import { renderDependents, renderFileList, renderImports, renderRecentChanges, renderSymbolHits } from "./core/render.js";
import { findSymbols } from "./core/symbols.js";
import { DEFAULT_BUDGET } from "./core/tokens.js";

export const SERVER_NAME = "mcp-repo-map";
export const SERVER_VERSION = "0.1.0";

export const repoMapSchema = {
  path: z.string().optional().describe("Repository root (default: current directory)"),
  max_files: z.number().int().min(100).max(50000).optional().describe("Maximum files to scan (default 5000)"),
  budget: z.number().int().min(200).max(20000).optional().describe(`Approximate token budget for the map (default ${DEFAULT_BUDGET})`),
};

export const listFilesSchema = {
  path: z.string().optional().describe("Repository root (default: current directory)"),
  dir: z.string().optional().describe("Only list files under this subdirectory"),
  ext: z.string().optional().describe("Comma-separated extensions to keep, e.g. \"ts,tsx,md\""),
  limit: z.number().int().min(1).max(2000).optional().describe("Maximum files to list (default 200)"),
};

export const findSymbolSchema = {
  name: z.string().min(1).describe("Symbol name or substring to search for"),
  path: z.string().optional().describe("Repository root (default: current directory)"),
  exact: z.boolean().optional().describe("Require an exact, case-insensitive name match"),
  kind: z.string().optional().describe("Filter by kind: function, class, interface, type, enum, const-fn"),
  limit: z.number().int().min(1).max(200).optional().describe("Maximum hits to return (default 50)"),
};

export const importsOfSchema = {
  file: z.string().describe("File path relative to the repository root"),
  path: z.string().optional().describe("Repository root (default: current directory)"),
};

export const dependentsSchema = {
  file: z.string().describe("Target file path relative to the repository root"),
  path: z.string().optional().describe("Repository root (default: current directory)"),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum dependents to return (default 100)"),
};

export const recentChangesSchema = {
  path: z.string().optional().describe("Repository root (default: current directory)"),
  limit: z.number().int().min(1).max(50).optional().describe("Number of recent commits (default 10)"),
};

function rootOf(pathValue: string | undefined): string {
  return pathValue !== undefined && pathValue.length > 0 ? pathValue : ".";
}

function errorText(tool: string, error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: `${tool} failed: ${message}` }] };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "repo_map",
    {
      title: "Repository map",
      description:
        "Compact structural map of a repository: file and size totals, language breakdown, entry points, package scripts, and a " +
        "directory tree. Use it to orient in an unfamiliar codebase before reading individual files.",
      inputSchema: repoMapSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, max_files, budget }) => {
      try {
        const options: { maxFiles?: number } = {};
        if (max_files !== undefined) {
          options.maxFiles = max_files;
        }
        const overview = await buildOverview(rootOf(path), options);
        const rendered = renderOverview(overview, budget ?? DEFAULT_BUDGET);
        const footer = `\n\n_~${rendered.tokens} tokens${rendered.truncated ? ", truncated to budget" : ""}_`;
        return { content: [{ type: "text", text: `${rendered.text}${footer}` }] };
      } catch (error) {
        return errorText("repo_map", error);
      }
    },
  );

  server.registerTool(
    "list_files",
    {
      title: "List files",
      description:
        "List repository files (skipping node_modules, dist, .git and friends) with sizes, optionally filtered by subdirectory " +
        "or extension. Cheaper than shelling out to find and safer than globbing into build output.",
      inputSchema: listFilesSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, dir, ext, limit }) => {
      try {
        const effectiveLimit = limit ?? 200;
        const walk = await walkFiles(rootOf(path));
        const filter: { dir?: string; ext?: string } = {};
        if (dir !== undefined) {
          filter.dir = dir;
        }
        if (ext !== undefined) {
          filter.ext = ext;
        }
        const files = applyFileFilter(walk.files, filter);
        const truncated = files.length > effectiveLimit;
        return {
          content: [
            { type: "text", text: renderFileList(files.slice(0, effectiveLimit), { truncated, limit: effectiveLimit }) },
          ],
        };
      } catch (error) {
        return errorText("list_files", error);
      }
    },
  );

  server.registerTool(
    "find_symbol",
    {
      title: "Find symbol",
      description:
        "Locate function, class, interface, type, and enum definitions across JavaScript, TypeScript, and Python files. " +
        "Regex-level extraction: fast and approximate, not a full parser.",
      inputSchema: findSymbolSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name, path, exact, kind, limit }) => {
      try {
        const options: { exact?: boolean; kind?: string; limit?: number } = {};
        if (exact !== undefined) {
          options.exact = exact;
        }
        if (kind !== undefined) {
          options.kind = kind;
        }
        if (limit !== undefined) {
          options.limit = limit;
        }
        const result = await findSymbols(rootOf(path), name, options);
        return { content: [{ type: "text", text: renderSymbolHits(name, result) }] };
      } catch (error) {
        return errorText("find_symbol", error);
      }
    },
  );

  server.registerTool(
    "imports_of",
    {
      title: "Imports of a file",
      description:
        "List the imports of one file with their kind (import, require, dynamic import, Python import) and, for relative " +
        "specifiers, the repository path they resolve to.",
      inputSchema: importsOfSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ file, path }) => {
      try {
        const hits = await importsOf(rootOf(path), file);
        return { content: [{ type: "text", text: renderImports(file, hits) }] };
      } catch (error) {
        return errorText("imports_of", error);
      }
    },
  );

  server.registerTool(
    "dependents",
    {
      title: "Find dependents",
      description:
        "Reverse import lookup: which files import the given file. Useful before renaming, moving, or deleting a module.",
      inputSchema: dependentsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ file, path, limit }) => {
      try {
        const options: { limit?: number } = {};
        if (limit !== undefined) {
          options.limit = limit;
        }
        const result = await findDependents(rootOf(path), file, options);
        return { content: [{ type: "text", text: renderDependents(file, result) }] };
      } catch (error) {
        return errorText("dependents", error);
      }
    },
  );

  server.registerTool(
    "recent_changes",
    {
      title: "Recent changes",
      description:
        "Recent git history: latest commits (hash, date, author, subject) and hotspot files changed most often, to see where " +
        "activity concentrates without running git commands yourself.",
      inputSchema: recentChangesSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path, limit }) => {
      try {
        const options: { limit?: number } = {};
        if (limit !== undefined) {
          options.limit = limit;
        }
        const changes = await recentChanges(rootOf(path), options);
        return { content: [{ type: "text", text: renderRecentChanges(changes) }] };
      } catch (error) {
        return errorText("recent_changes", error);
      }
    },
  );

  return server;
}
