import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitCommit {
  short: string;
  date: string;
  author: string;
  subject: string;
}

export interface Hotspot {
  path: string;
  count: number;
}

export interface RecentChanges {
  isRepo: boolean;
  commits: GitCommit[];
  hotspots: Hotspot[];
}

export interface RecentChangesOptions {
  limit?: number;
  hotspotWindow?: number;
}

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

export async function recentChanges(root: string, options: RecentChangesOptions = {}): Promise<RecentChanges> {
  const limit = options.limit ?? 10;
  const hotspotWindow = options.hotspotWindow ?? 200;

  const insideWorkTree = await git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (insideWorkTree === null || insideWorkTree.trim() !== "true") {
    return { isRepo: false, commits: [], hotspots: [] };
  }

  const log = await git(root, [
    "log",
    `-n${limit}`,
    "--no-merges",
    "--date=iso-strict",
    "--pretty=format:%h|%ad|%an|%s",
  ]);

  const commits: GitCommit[] = [];
  for (const line of (log ?? "").split(/\r\n|\r|\n/)) {
    if (line.length === 0) {
      continue;
    }
    const parts = line.split("|");
    if (parts.length < 4) {
      continue;
    }
    commits.push({
      short: parts[0] ?? "",
      date: parts[1] ?? "",
      author: parts[2] ?? "",
      subject: parts.slice(3).join("|"),
    });
  }

  const names = await git(root, ["log", `-n${hotspotWindow}`, "--name-only", "--pretty=format:@@@"]);
  const counts = new Map<string, number>();
  for (const line of (names ?? "").split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed === "@@@") {
      continue;
    }
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  const hotspots = [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
    .slice(0, 10);

  return { isRepo: true, commits, hotspots };
}
