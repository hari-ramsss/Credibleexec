import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AppError } from "@credibleexec/domain";
import { parseLocalIntent } from "@credibleexec/mandate";
import { read, type Draft, type Job } from "./store";
import { tool } from "./workflow";
import { config } from "./config";
export async function runRecipe(job: Job) {
  if (config().local) {
    if (job.phase === "compile") {
      await tool(job.id, "context");
      await tool(
        job.id,
        "compile",
        parseLocalIntent(read<Draft>(job.ref).request),
      );
    }
    if (job.phase === "fund") {
      await tool(job.id, "readiness");
      await tool(job.id, "fund");
      await tool(job.id, "prepare");
    }
    if (job.phase === "settle") {
      await tool(job.id, "evidence");
      await tool(job.id, "settle");
    }
    return;
  }
  const handle = process.env.BAZANTIC_RECIPE_HANDLE;
  if (!handle)
    throw new AppError(
      "NOT_CONFIGURED",
      "Publish and configure the CredibleExec Recipe first.",
      503,
    );
  // Use the official adapter: it discovers the live paid gateway and handles x402.
  // Do not give the child process the app's wallet keys, Privy secret, or gateway key.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k, v]) =>
        v !== undefined &&
        (/^(PATH|Path|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|SYSTEMROOT|SystemRoot|TEMP|TMP)$/.test(
          k,
        ) ||
          k.startsWith("BAZANTIC_GATEWAY_")),
    ),
  ) as Record<string, string>;
  const cli =
    process.env.BAZANTIC_CLI_PATH ??
    path.join(process.cwd(), "node_modules/@bazantic/cli/bin/bazantic.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "recipe", "mcp"],
    env: { ...env, CI: "1" },
    stderr: "pipe",
  });
  const client = new Client({ name: "credibleexec", version: "1.0.0" });
  try {
    await client.connect(transport, { timeout: 20000 });
    const catalog = await client.listTools();
    if (!catalog.tools.some((t) => t.name === handle))
      throw new AppError(
        "RECIPE_MISSING",
        "The configured Recipe is not in the published catalog.",
        503,
      );
    const result = await client.callTool(
      { name: handle, arguments: { jobId: job.id, phase: job.phase } },
      undefined,
      { timeout: 150000 },
    );
    if (result.isError)
      throw new AppError(
        "RECIPE_FAILED",
        "The agent workflow could not complete. Its saved steps can be retried.",
        503,
      );
    // Trust only validated tool-side persisted results, never the Recipe's narrative output.
    if (!read<Job>(job.id).done)
      throw new AppError(
        "RECIPE_INCOMPLETE",
        "The agent did not complete all required workflow tools.",
        503,
      );
  } finally {
    await client.close();
  }
}
