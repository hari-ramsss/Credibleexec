import path from "node:path";
import { root } from "../contracts/scripts/compile";
import { readinessConfig } from "../app/lib/server/config";
import { checkedChain } from "../app/lib/server/chain";
import { erc20Abi } from "viem";
try {
  process.loadEnvFile(path.join(root, "app/.env.local"));
} catch {}
const status = readinessConfig();
if (!status.configured) {
  console.error(`Missing configuration: ${status.missing.join(", ")}`);
  process.exit(1);
}
const { c, rpc } = await checkedChain();
const [agentBalance, agentGas, settlerGas, routerCode] = await Promise.all([
  rpc.readContract({
    address: c.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [c.agent.address],
  }),
  rpc.getBalance({ address: c.agent.address }),
  rpc.getBalance({ address: c.settler.address }),
  rpc.getCode({ address: c.router }),
]);
const checks = {
  chainId: c.chain.id,
  bondContract: c.bond,
  agent: c.agent.address,
  settlementAuthority: c.settler.address,
  agentHasCollateral: agentBalance >= BigInt(c.bondAmount),
  agentHasGas: agentGas > 0n,
  settlerHasGas: settlerGas > 0n,
  executionContractExists: !!routerCode && routerCode !== "0x",
};
console.log(JSON.stringify(checks, null, 2));
if (!c.local) {
  const secret = process.env.BAZANTIC_TOOL_SECRET ?? "";
  if (secret.length < 32)
    throw new Error(
      "BAZANTIC_TOOL_SECRET must have at least 32 random characters.",
    );
  const response = await fetch("https://api.bazantic.com/v1/recipes", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Could not read the free Bazantic recipe catalog.");
  const catalog = (await response.json()) as { handle: string }[];
  if (!catalog.some((r) => r.handle === process.env.BAZANTIC_RECIPE_HANDLE))
    throw new Error("Your Recipe handle is not published in the catalog.");
  console.log("Recipe is in the public catalog. No paid Recipe was called.");
  const hash = process.env.TRACE_TEST_TX_HASH;
  if (hash) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
      throw new Error("Invalid TRACE_TEST_TX_HASH");
    const res = await fetch(c.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "debug_traceTransaction",
        params: [hash, { tracer: "callTracer" }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const trace = (await res.json()) as {
      result?: { type?: string };
      error?: unknown;
    };
    if (!res.ok || !trace.result?.type || trace.error)
      throw new Error(
        "RPC did not return a call trace for your test transaction.",
      );
    console.log(
      "RPC callTracer support verified for the supplied Base transaction.",
    );
  } else
    console.log(
      "Trace capability not yet verified. Set TRACE_TEST_TX_HASH to a recent confirmed Base transaction and re-run.",
    );
}
if (Object.values(checks).some((v) => v === false)) process.exitCode = 1;
