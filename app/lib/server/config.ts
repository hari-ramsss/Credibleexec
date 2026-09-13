import { z } from "zod";
import { addressSchema, uintSchema, AppError } from "@credibleexec/domain";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { defineChain, type Chain } from "viem";

export function config() {
  const mode = z
    .enum(["local", "testnet"])
    .parse(process.env.EXECUTION_MODE ?? "testnet");
  const local = mode === "local";
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
    : baseSepolia;
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
    testnet: !local,
    demo: true,
    chain,
    rpc,
    agent,
    settler,
    bond: addressSchema.parse(process.env.BOND_CONTRACT_ADDRESS),
    usdc: addressSchema.parse(
      local
        ? process.env.USDC_ADDRESS
        : "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    ),
    router: addressSchema.parse(
      local
        ? process.env.LOCAL_EXECUTION_ADDRESS
        : process.env.TEST_EXECUTION_ADDRESS,
    ),
    bondAmount: uintSchema.parse(process.env.AGENT_BOND_AMOUNT ?? "1000000"),
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
          "TEST_EXECUTION_ADDRESS",
        ]),
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (!["local", "testnet"].includes(process.env.EXECUTION_MODE ?? "testnet"))
    missing.push("EXECUTION_MODE must be testnet or local (mainnet disabled)");
  return {
    configured: missing.length === 0,
    mode: local ? "local" : "testnet",
    missing,
    chainId: local ? 31337 : 84532,
    chainName: local ? "Local development" : "Base Sepolia",
    bondAmount: process.env.AGENT_BOND_AMOUNT ?? "1000000",
  };
}
