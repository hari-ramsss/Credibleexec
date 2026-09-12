import { z } from "zod";
import { addressSchema, uintSchema, AppError } from "@credibleexec/domain";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { defineChain, type Chain } from "viem";

export function config() {
  const local = process.env.EXECUTION_MODE === "local";
  if (local && process.env.NODE_ENV === "production")
    throw new AppError(
      "UNSAFE_CONFIG",
      "Local execution is disabled in production.",
      503,
    );
  const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
  const rpc = z.url().parse(process.env.RPC_URL);
  if (
    local &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpc).hostname)
  )
    throw new AppError(
      "UNSAFE_CONFIG",
      "Local mode requires a loopback RPC.",
      503,
    );
  const chain: Chain = local
    ? defineChain({
        id: 31337,
        name: "Local development",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpc] } },
      })
    : base;
  const agent = privateKeyToAccount(
    key.parse(process.env.AGENT_PRIVATE_KEY) as `0x${string}`,
  );
  const settler = privateKeyToAccount(
    key.parse(process.env.SETTLEMENT_PRIVATE_KEY) as `0x${string}`,
  );
  if (agent.address === settler.address)
    throw new AppError(
      "UNSAFE_CONFIG",
      "Use separate agent and settlement accounts.",
      503,
    );
  return {
    local,
    chain,
    rpc,
    agent,
    settler,
    bond: addressSchema.parse(process.env.BOND_CONTRACT_ADDRESS),
    usdc: addressSchema.parse(
      local
        ? process.env.USDC_ADDRESS
        : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ),
    router: addressSchema.parse(
      local
        ? process.env.LOCAL_EXECUTION_ADDRESS
        : "0x111111125421cA6dc452d289314280a0f8842A65",
    ),
    bondAmount: uintSchema.parse(process.env.AGENT_BOND_AMOUNT ?? "100000000"),
    confirmations: local
      ? 1
      : z.coerce
          .number()
          .int()
          .min(2)
          .max(100)
          .parse(process.env.CONFIRMATIONS ?? 2),
  };
}
export function readinessConfig() {
  const local = process.env.EXECUTION_MODE === "local";
  const required = [
    "RPC_URL",
    "BOND_CONTRACT_ADDRESS",
    "AGENT_PRIVATE_KEY",
    "SETTLEMENT_PRIVATE_KEY",
    ...(local
      ? ["USDC_ADDRESS", "LOCAL_EXECUTION_ADDRESS"]
      : [
          "NEXT_PUBLIC_PRIVY_APP_ID",
          "PRIVY_APP_SECRET",
          "ONEINCH_API_KEY",
          "BAZANTIC_RECIPE_HANDLE",
          "BAZANTIC_TOOL_SECRET",
        ]),
  ];
  const missing = required.filter((k) => !process.env[k]);
  return {
    configured: missing.length === 0,
    mode: local ? "local" : "live",
    missing,
    chainId: local ? 31337 : 8453,
    chainName: local ? "Local development" : "Base",
    bondAmount: process.env.AGENT_BOND_AMOUNT ?? "100000000",
  };
}
