import path from "node:path";

export type SourceLanguage = "javascript" | "typescript" | "python";

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".json": "json",
  ".jsonc": "json",
  ".md": "markdown",
  ".mdx": "markdown",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".ini": "config",
  ".cfg": "config",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".ps1": "shell",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".cs": "csharp",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".rb": "ruby",
  ".php": "php",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".sql": "sql",
  ".lock": "lockfile",
};

const SOURCE_LANGUAGES: Record<string, SourceLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

export function languageOf(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === "") {
    const base = path.basename(file).toLowerCase();
    if (base === "dockerfile") {
      return "docker";
    }
    if (base === "makefile") {
      return "make";
    }
    return "other";
  }
  return EXTENSION_LANGUAGE[extension] ?? "other";
}

export function sourceLanguageOf(file: string): SourceLanguage | null {
  return SOURCE_LANGUAGES[path.extname(file).toLowerCase()] ?? null;
}

export function isSourceLanguage(file: string): boolean {
  return sourceLanguageOf(file) !== null;
}
