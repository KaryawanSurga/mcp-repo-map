import { parseArgs } from "node:util";
import { applyFileFilter, walkFiles, DEFAULT_MAX_FILES } from "./core/files.js";
import { recentChanges } from "./core/git.js";
import { findDependents, importsOf } from "./core/imports.js";
import { buildOverview, renderOverview } from "./core/overview.js";
import { renderDependents, renderFileList, renderImports, renderRecentChanges, renderSymbolHits } from "./core/render.js";
import { findSymbols } from "./core/symbols.js";
import { DEFAULT_BUDGET } from "./core/tokens.js";
import { buildServer, SERVER_VERSION } from "./server.js";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  color: boolean;
}

export const HELP = `mcp-repo-map ${SERVER_VERSION}

Map a repository for AI agents: structure, symbols, imports, dependents, history.

Usage:
  mcp-repo-map map [dir] [--budget <n>] [--json]
  mcp-repo-map files [dir] [--dir <sub>] [--ext ts,tsx] [--limit <n>] [--json]
  mcp-repo-map find <name> [dir] [--exact] [--kind <kind>] [--limit <n>] [--json]
  mcp-repo-map imports <file> [dir] [--json]
  mcp-repo-map dependents <file> [dir] [--limit <n>] [--json]
  mcp-repo-map recent [dir] [--limit <n>] [--json]
  mcp-repo-map serve
  mcp-repo-map --help | --version

Commands:
  map         Structural overview: languages, entry points, scripts, tree
  files       List tracked files with sizes
  find        Locate function/class/type definitions (JS, TS, Python)
  imports     Imports of one file, with resolved relative paths
  dependents  Files importing the given file
  recent      Recent commits and hotspot files from git history
  serve       Run as an MCP server exposing the tools

Options:
  --dir <sub>       Restrict files to a subdirectory
  --ext <list>      Comma-separated extensions to keep
  --limit <n>       Result limit (defaults: files 200, find 50, dependents 100, recent 10)
  --max-files <n>   Maximum files to scan for map (default ${DEFAULT_MAX_FILES})
  --budget <n>      Approximate token budget for map output (default ${DEFAULT_BUDGET})
  --exact           Require exact symbol name matches
  --kind <kind>     Filter symbols: function, class, interface, type, enum, const-fn
  --json            Machine-readable output
  -h, --help        Show this help
  -v, --version     Print the version

Examples:
  mcp-repo-map map
  mcp-repo-map find parseToken --kind function
  mcp-repo-map imports src/index.ts
  mcp-repo-map dependents src/core/store.ts
`;

function parsePositiveInt(value: unknown, flag: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error(`${flag} must be a positive integer`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      dir: { type: "string" },
      ext: { type: "string" },
      limit: { type: "string" },
      "max-files": { type: "string" },
      budget: { type: "string" },
      exact: { type: "boolean" },
      kind: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values["version"] === true) {
    io.stdout(SERVER_VERSION);
    return 0;
  }
  if (values["help"] === true || command === undefined || command === "help") {
    io.stdout(HELP);
    return 0;
  }

  if (command === "serve") {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const server = buildServer();
    await server.connect(new StdioServerTransport());
    return 0;
  }

  try {
    if (command === "map") {
      const root = positionals[1] ?? ".";
      const maxFiles = parsePositiveInt(values["max-files"], "--max-files", DEFAULT_MAX_FILES);
      const budget = parsePositiveInt(values["budget"], "--budget", DEFAULT_BUDGET);
      const overview = await buildOverview(root, { maxFiles });
      if (values["json"] === true) {
        io.stdout(JSON.stringify(overview, null, 2));
      } else {
        io.stdout(renderOverview(overview, budget).text);
      }
      return 0;
    }

    if (command === "files") {
      const root = positionals[1] ?? ".";
      const limit = parsePositiveInt(values["limit"], "--limit", 200);
      const filter: { dir?: string; ext?: string } = {};
      if (typeof values["dir"] === "string") {
        filter.dir = values["dir"];
      }
      if (typeof values["ext"] === "string") {
        filter.ext = values["ext"];
      }
      const walk = await walkFiles(root);
      const files = applyFileFilter(walk.files, filter);
      if (values["json"] === true) {
        io.stdout(JSON.stringify({ files: files.slice(0, limit), total: files.length, truncated: files.length > limit }, null, 2));
      } else {
        io.stdout(renderFileList(files.slice(0, limit), { truncated: files.length > limit, limit }));
      }
      return 0;
    }

    if (command === "find") {
      const name = positionals[1];
      if (name === undefined) {
        io.stderr("find requires a symbol name");
        return 2;
      }
      const root = positionals[2] ?? ".";
      const limit = parsePositiveInt(values["limit"], "--limit", 50);
      const options: { exact?: boolean; kind?: string; limit?: number } = { limit };
      if (values["exact"] === true) {
        options.exact = true;
      }
      if (typeof values["kind"] === "string") {
        options.kind = values["kind"];
      }
      const result = await findSymbols(root, name, options);
      if (values["json"] === true) {
        io.stdout(JSON.stringify(result, null, 2));
      } else {
        io.stdout(renderSymbolHits(name, result));
      }
      return 0;
    }

    if (command === "imports") {
      const file = positionals[1];
      if (file === undefined) {
        io.stderr("imports requires a file path");
        return 2;
      }
      const root = positionals[2] ?? ".";
      const hits = await importsOf(root, file);
      if (values["json"] === true) {
        io.stdout(JSON.stringify({ file, imports: hits }, null, 2));
      } else {
        io.stdout(renderImports(file, hits));
      }
      return 0;
    }

    if (command === "dependents") {
      const file = positionals[1];
      if (file === undefined) {
        io.stderr("dependents requires a file path");
        return 2;
      }
      const root = positionals[2] ?? ".";
      const limit = parsePositiveInt(values["limit"], "--limit", 100);
      const result = await findDependents(root, file, { limit });
      if (values["json"] === true) {
        io.stdout(JSON.stringify({ file, ...result }, null, 2));
      } else {
        io.stdout(renderDependents(file, result));
      }
      return 0;
    }

    if (command === "recent") {
      const root = positionals[1] ?? ".";
      const limit = parsePositiveInt(values["limit"], "--limit", 10);
      const changes = await recentChanges(root, { limit });
      if (values["json"] === true) {
        io.stdout(JSON.stringify(changes, null, 2));
      } else {
        io.stdout(renderRecentChanges(changes));
      }
      return 0;
    }
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }

  io.stderr(`Unknown command: ${command}`);
  io.stderr("Run mcp-repo-map --help for usage.");
  return 2;
}
