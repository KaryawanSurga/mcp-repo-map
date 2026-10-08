# mcp-repo-map

[![npm](https://img.shields.io/npm/v/mcp-repo-map)](https://www.npmjs.com/package/mcp-repo-map)
[![CI](https://github.com/KaryawanSurga/mcp-repo-map/actions/workflows/ci.yml/badge.svg)](https://github.com/KaryawanSurga/mcp-repo-map/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Map a repository for AI agents — structure, symbols, imports, dependents, and history — without reading every file.**

An MCP server and CLI that answers the navigation questions coding agents ask constantly, with compact bounded output: *What is this repo? Where is `parseToken` defined? What does this file import? Who imports this module? Where does activity concentrate?* Instead of burning context on `find`, `grep`, and dozens of file reads, the agent asks the map.

## Why

- Agents orient in codebases by reading files one by one — the most token-expensive way to learn structure.
- Shelling out to `grep -r` and `find` pollutes the transcript with noise and platform-specific flags.
- Rename/move/delete decisions need a reverse-import lookup that agents usually skip — then break imports.
- "What changed lately?" is a `git log` incantation away, not a tool call.

mcp-repo-map answers all of it with six read-only tools and deterministic text output that fits a token budget.

## Install

```sh
# run directly
npx -y mcp-repo-map map .

# or install globally
npm install -g mcp-repo-map
repomap find buildServer
```

Requires Node >= 20. Git is used for `recent_changes` but nothing else.

## MCP setup

Add to your MCP client configuration (Claude Desktop, Cline, and others):

```json
{
  "mcpServers": {
    "repo-map": {
      "command": "npx",
      "args": ["-y", "mcp-repo-map", "serve"]
    }
  }
}
```

## Tools

| Tool | Args | Answers |
| --- | --- | --- |
| `repo_map` | `path?`, `max_files?`, `budget?` | What is this repo: size, languages, entry points, scripts, directory tree. |
| `list_files` | `path?`, `dir?`, `ext?`, `limit?` | Which files exist, filtered by subdirectory or extension. |
| `find_symbol` | `name`, `path?`, `exact?`, `kind?`, `limit?` | Where is this function/class/type defined. |
| `imports_of` | `file`, `path?` | What does this file import, and where do relative imports resolve. |
| `dependents` | `file`, `path?`, `limit?` | Who imports this file (before you rename or delete it). |
| `recent_changes` | `path?`, `limit?` | Recent commits and hotspot files from git history. |

## CLI

```sh
repomap map                          # structural overview
repomap files --ext ts --dir src     # filtered file list
repomap find parseToken --kind function
repomap imports src/index.ts         # with resolved paths
repomap dependents src/core/store.ts
repomap recent --limit 20
repomap serve                        # MCP server on stdio
```

Every command supports `--json` for machine-readable output.

## Example

```text
$ repomap map --budget 300
# mcp-repo-map
MCP server and CLI that map a repository for AI agents — structure, languages,
symbols, imports, dependents, and recent changes without reading every file.

Size: 26 files, 152.4 KB
Languages:
  typescript: 21 files, 71.4 KB
  json: 3 files, 79.7 KB
Entry points:
  src/index.ts
  src/cli.ts
Scripts: build, start, test, typecheck
Tree:
├─ src/ (12 files)
│  ├─ core/ (8 files)
│  └─ ...
└─ tests/ (9 files)

$ repomap dependents src/core/tokens.ts
Files importing src/core/tokens.ts:
  src/cli.ts
  src/core/overview.ts
  src/server.ts
```

## How it works

- **Ignoring**: `node_modules`, `dist`, `.git`, build output, virtualenvs, and friends are skipped. `walkFiles` is depth- and count-bounded, symlink-safe.
- **Symbols**: regex-level extraction for JavaScript, TypeScript, and Python — functions, classes, interfaces, types, enums, arrow-function consts, Python defs. Fast and dependency-free; it does not parse scopes, so nested definitions are reported at their line, not their nesting.
- **Imports**: `import`, side-effect imports, `export ... from`, dynamic `import()`, `require()`, Python `import` and `from ... import`. Relative specifiers resolve against the real file set — including the TypeScript convention where `./x.js` maps to `x.ts` on disk, and Python dot-relative imports.
- **Budget**: the map output is clamped to a token budget on line boundaries, so a huge repo still returns something usable.
- **Read-only**: every tool is annotated `readOnlyHint`; nothing writes to the repository.

## Limitations (v0.1.0)

- Symbol extraction covers JavaScript, TypeScript, and Python only. Go, Rust, and others appear in language stats but not symbol search.
- No call graph or type-aware resolution: imports resolve by path convention, not by a module resolver.
- Binary and oversized files (> 1 MB) are skipped by readers.

## Roadmap

- Go and Rust symbol extractors.
- `tsconfig` paths and workspace package resolution.
- A `context_pack` tool: the minimal set of files to read for a given task.
- Call graph between extracted symbols.

## Development

```sh
npm install
npm run typecheck
npm run build
npm test
```

The suite covers file walking, extraction, resolution, rendering, git history, the CLI, and the MCP server handshake over in-memory transports.

## License

MIT — see [LICENSE](LICENSE).
