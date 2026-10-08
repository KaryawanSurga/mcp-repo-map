# PRD — MCP Repo Map

**Status:** v0.1.0 ready to ship
**Owner:** KaryawanSurga
**Last updated:** 2026-10-08

## 1. Summary

MCP Repo Map is an MCP server and CLI that gives AI agents compact structural intelligence about a repository: file and language statistics, directory tree, entry points, symbol definitions, imports with resolved paths, reverse-import lookups, and recent git history. Output is deterministic, read-only, and clamped to a token budget.

## 2. Problem

- Agents orient in codebases by reading files sequentially — the most token-expensive path to structural understanding.
- Shell-based exploration (`find`, `grep -r`, `git log` incantations) is noisy, platform-flaky, and unfiltered.
- Rename/move/delete operations need a reverse-import lookup that agents routinely skip, silently breaking imports.
- Repository overviews (languages, entry points, scripts) are re-derived from scratch on every task.

## 3. Target users

- AI coding agents (Claude, Cline, and any MCP client) navigating unfamiliar repositories.
- Developers who want a fast local answer to "where is X defined" and "who imports Y".
- CI and tooling authors needing a dependency-free structural extractor over JS/TS/Python.

## 4. Goals (v0.1.0)

1. Provide six read-only MCP tools: `repo_map`, `list_files`, `find_symbol`, `imports_of`, `dependents`, `recent_changes`.
2. Answer each question with compact, bounded output — never dump raw file contents.
3. Extract symbols and imports for JS, TS, and Python with zero parsing dependencies.
4. Resolve relative imports against the real file set, including the TS `./x.js` → `x.ts` convention and Python dot-relative imports.
5. Ship a first-class CLI mirroring every tool with `--json` output.
6. Skip noise (node_modules, dist, .git, virtualenvs) by default; stay safe on symlinks and huge files.

## 5. Non-goals

- Full parsing or type-aware analysis (compiler APIs, LSP integration) in v0.1.0.
- Call graphs, dead-code detection, or refactoring automation.
- Languages beyond JavaScript, TypeScript, and Python for symbol extraction.
- Writing to the repository: every operation is read-only.
- Hosting or remote repository access — the tool maps local working trees only.

## 6. User stories

- As an agent, I want one call that tells me the languages, entry points, and layout of an unfamiliar repo.
- As an agent, I want to find where a symbol is defined without grep noise.
- As an agent, I want the reverse-import list before renaming a module.
- As a developer, I want the hotspot files and recent commits without composing git commands.
- As a tool author, I want JSON output I can pipe into other automation.

## 7. Functional requirements

| ID | Requirement |
| --- | --- |
| FR1 | `repo_map` returns: file/byte totals, language breakdown (files, bytes), entry points from package metadata plus defaults, package scripts, and a depth-limited tree with per-directory counts and truncation markers. |
| FR2 | `list_files` lists tracked files with sizes, filterable by subdirectory prefix and comma-separated extensions, with a limit. |
| FR3 | `find_symbol` locates definitions by name (substring or exact, case-insensitive) with kind filtering (function, class, interface, type, enum, const-fn) and a limit. |
| FR4 | `imports_of` reports every import of a file with kind and resolved path where relative. |
| FR5 | `dependents` reports every tracked source file importing the target, with scan count and truncation flag. |
| FR6 | `recent_changes` reports recent commits (hash, ISO date, author, subject) and top-10 hotspots from git history; non-repos are reported honestly. |
| FR7 | Walk ignores node_modules, dist, build output, .git, virtualenvs, caches, and symlinks; enforces max depth (12) and max files (5000). |
| FR8 | Readers skip files over 1 MB; import resolution maps `./x.js` to `x.ts/.tsx/.mts/.cts` and supports Python `from .mod import` dot-climbing. |
| FR9 | Map output is clamped to an approximate token budget (default 900) on line boundaries. |
| FR10 | Every MCP tool is annotated read-only and returns actionable error text instead of throwing. |
| FR11 | CLI commands mirror all tools with `--json`, `--limit`, `--ext`, `--dir`, `--exact`, `--kind`, `--max-files`, and `--budget`; exit codes 0/1/2. |

## 8. Non-functional requirements

- Node >= 20; runtime dependencies limited to the MCP SDK and zod.
- Deterministic sorting and rendering; stable outputs for diffing.
- No repository writes; no telemetry; no network access beyond none at all (git runs locally).
- Windows/macOS/Linux parity (forward-slash paths in output, `windowsHide` on child processes).
- Test suite covers walking, extraction, resolution, rendering, git, CLI, and MCP handshake.

## 9. Success metrics

- Adoption as the first orientation call in agent sessions on unfamiliar repos.
- Reduction in file reads per navigation task (qualitative feedback from users).
- npm installs and stars growing week over week.
- Issues requesting new language extractors (roadmap validation).

## 10. Technical notes

- `walkFiles` is asynchronous BFS-with-depth, ignoring an extensible default set, sorting with `localeCompare`.
- Symbol extraction is line-oriented regex per language with long-line and oversized-file guards.
- Import resolution builds the known-file set once per query; JS resolution tries `.js`→TS rewrites before suffix/index candidates.
- Tree rendering builds an in-memory node tree: 8 entries per directory, `+N more` markers, glyph-based indentation.
- The MCP server wraps each tool in try/catch, returning `isError` text; the CLI shares rendering helpers with the server.

## 11. Release plan

- **v0.1.0** — six tools, CLI, JS/TS/Python extraction, resolution, budgeted rendering, 42-test suite, CI (2026-10-08).
- **v0.2.0** — Go and Rust symbol extractors; `context_pack` (minimal file set for a task).
- **v0.3.0** — tsconfig path and workspace resolution; symbol call graph; incremental caching.

## 12. Open questions

- Should `find_symbol` return enclosing scope names for nested definitions?
- Should `repo_map` accept a `focus` path to zoom the tree into one subtree?
- Should hotspots weight by recency rather than raw change count?
