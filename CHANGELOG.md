# Changelog

All notable changes to MCP Repo Map are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-08

### Added

- MCP server with six read-only tools: `repo_map`, `list_files`, `find_symbol`, `imports_of`, `dependents`, `recent_changes`.
- CLI (`repomap`) mirroring every tool with `--json` output.
- Structural overview: file/byte totals, language breakdown, package entry points and scripts, depth-limited directory tree with truncation markers, and README title.
- Symbol extraction for JavaScript, TypeScript, and Python (functions, classes, interfaces, types, enums, arrow-function consts, Python defs).
- Import extraction for `import`, side-effect imports, `export ... from`, dynamic `import()`, `require()`, and Python `import` / `from ... import`, with relative-path resolution including the TS `./x.js` → `x.ts` convention and Python dot-relative imports.
- Reverse-import lookup (`dependents`) for safe rename/move/delete decisions.
- Git history tool: recent commits and top hotspot files; non-repositories reported honestly.
- Token-budgeted rendering (default ~900 tokens, line-boundary cuts).
- Noise skipping for node_modules, dist, .git, virtualenvs, caches, and symlinks; 1 MB read cap.
- 42-test suite covering walking, extraction, resolution, rendering, git, CLI, and MCP handshake.

[0.1.0]: https://github.com/KaryawanSurga/mcp-repo-map/releases/tag/v0.1.0
