import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { cleanup, makeSampleRepo, makeTempDir } from "./helpers/fixture.js";

interface TextBlock {
  type: string;
  text?: string;
}

function firstText(result: { content: unknown[] }): string {
  const block = result.content.find((entry) => (entry as TextBlock).type === "text") as TextBlock | undefined;
  return block?.text ?? "";
}

async function connectClient(): Promise<Client> {
  const mcp = buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "repo-map-test", version: "0.0.0" });
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("repo map mcp server", () => {
  it("advertises its tools", async () => {
    const client = await connectClient();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "dependents",
        "find_symbol",
        "imports_of",
        "list_files",
        "recent_changes",
        "repo_map",
      ]);
      for (const tool of tools) {
        expect(tool.description ?? "").not.toBe("");
      }
    } finally {
      await client.close();
    }
  });

  it("maps a repository", async () => {
    const root = await makeSampleRepo();
    const client = await connectClient();
    try {
      const result = await client.callTool({ name: "repo_map", arguments: { path: root } });
      const text = firstText(result as { content: unknown[] });
      expect(text).toContain("Sample Project");
      expect(text).toContain("Languages:");
      expect(text).toContain("src/");
    } finally {
      await client.close();
      await cleanup(root);
    }
  });

  it("finds symbols and lists files", async () => {
    const root = await makeSampleRepo();
    const client = await connectClient();
    try {
      const symbols = await client.callTool({
        name: "find_symbol",
        arguments: { name: "add", path: root, exact: true },
      });
      expect(firstText(symbols as { content: unknown[] })).toContain("src/math.ts");

      const files = await client.callTool({
        name: "list_files",
        arguments: { path: root, ext: "ts", limit: 50 },
      });
      const listing = firstText(files as { content: unknown[] });
      expect(listing).toContain("src/cli.ts");
      expect(listing).not.toContain("README.md");
    } finally {
      await client.close();
      await cleanup(root);
    }
  });

  it("answers imports and dependents queries", async () => {
    const root = await makeSampleRepo();
    const client = await connectClient();
    try {
      const imports = await client.callTool({
        name: "imports_of",
        arguments: { file: "src/index.ts", path: root },
      });
      expect(firstText(imports as { content: unknown[] })).toContain("src/math.ts");

      const dependents = await client.callTool({
        name: "dependents",
        arguments: { file: "src/math.ts", path: root },
      });
      const listing = firstText(dependents as { content: unknown[] });
      expect(listing).toContain("src/index.ts");
      expect(listing).toContain("src/legacy.cjs");
    } finally {
      await client.close();
      await cleanup(root);
    }
  });

  it("reports git state and tool errors", async () => {
    const root = await makeTempDir();
    const client = await connectClient();
    try {
      const recent = await client.callTool({ name: "recent_changes", arguments: { path: root } });
      expect(firstText(recent as { content: unknown[] })).toContain("Not a git repository");

      const failure = await client.callTool({
        name: "imports_of",
        arguments: { file: "README.md", path: root },
      });
      expect((failure as { isError?: boolean }).isError).toBe(true);
    } finally {
      await client.close();
      await cleanup(root);
    }
  });
});
