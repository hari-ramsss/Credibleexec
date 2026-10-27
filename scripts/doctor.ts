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
console.log(
  "Free demo mode: no 1inch API, paid Bazantic calls, or debug traces required.",
);
if (Object.values(checks).some((v) => v === false)) process.exitCode = 1;
