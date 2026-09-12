import { z } from "zod";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
  type Hex,
} from "viem";
import {
  addressSchema,
  AppError,
  sameAddress,
  type Mandate,
  type UnsignedTransaction,
} from "@credibleexec/domain";
import { chainClients } from "./chain";
export const routerAbi = parseAbi([
  "function swap(address executor, (address srcToken,address dstToken,address srcReceiver,address dstReceiver,uint256 amount,uint256 minReturnAmount,uint256 flags) desc, bytes data) payable returns (uint256 returnAmount,uint256 spentAmount)",
]);
export const localAbi = parseAbi([
  "function execute(uint256 amount,address recipient,uint256 output) external",
  "event Executed(address indexed sender,address indexed recipient,uint256 inputAmount,uint256 outputAmount)",
]);
export interface ExecutionProvider {
  quote(m: Mandate): Promise<string>;
  build(m: Mandate): Promise<UnsignedTransaction>;
}
export function validateRoute(
  m: Mandate,
  tx: UnsignedTransaction,
  router: string,
) {
  if (
    tx.chainId !== m.chainId ||
    !sameAddress(tx.from, m.userWallet) ||
    !sameAddress(tx.to, router) ||
    BigInt(tx.value) !== 0n
  )
    throw new AppError(
      "INVALID_ROUTE",
      "The execution route does not match your approved wallet or chain.",
    );
  let decoded: ReturnType<typeof decodeFunctionData<typeof routerAbi>>;
  try {
    decoded = decodeFunctionData({ abi: routerAbi, data: tx.data });
  } catch {
    throw new AppError(
      "UNSUPPORTED_ROUTE",
      "The returned route cannot be safely decoded. Try another quote.",
    );
  }
  const [, d] = decoded.args;
  if (
    !sameAddress(d.srcToken, m.assetIn) ||
    !sameAddress(d.dstToken, m.assetOut) ||
    !sameAddress(d.dstReceiver, m.recipient) ||
    d.amount !== BigInt(m.amountIn) ||
    d.amount > BigInt(m.maxSpend) ||
    d.minReturnAmount < BigInt(m.minOutput) ||
    d.flags !== 0n
  )
    throw new AppError(
      "INVALID_ROUTE",
      "The route violates your approved asset, amount, recipient, or output limits.",
    );
}
export class OneInchExecutionProvider implements ExecutionProvider {
  private async request(
    method: string,
    m: Mandate,
    extra: Record<string, string> = {},
  ) {
    const key = process.env.ONEINCH_API_KEY;
    if (!key)
      throw new AppError(
        "NOT_CONFIGURED",
        "The execution provider is not configured.",
        503,
      );
    const params = new URLSearchParams({
      src: m.assetIn,
      dst: m.assetOut,
      amount: m.amountIn,
      ...extra,
    });
    const response = await fetch(
      `https://api.1inch.com/swap/v6.1/${m.chainId}/${method}?${params}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new AppError(
        "QUOTE_UNAVAILABLE",
        "The execution provider could not prepare this swap. Try again shortly.",
        503,
      );
    return response.json();
  }
  async quote(m: Mandate) {
    const result = z
      .object({ dstAmount: z.string().regex(/^\d+$/) })
      .parse(await this.request("quote", m));
    if (BigInt(result.dstAmount) < BigInt(m.minOutput))
      throw new AppError(
        "MINIMUM_UNAVAILABLE",
        "Current execution conditions cannot satisfy your minimum ETH amount.",
        409,
      );
    return result.dstAmount;
  }
  async build(m: Mandate) {
    const { c } = chainClients();
    const result = z
      .object({
        dstAmount: z.string().regex(/^\d+$/),
        tx: z.object({
          from: addressSchema,
          to: addressSchema,
          data: z.string().regex(/^0x[0-9a-fA-F]+$/),
          value: z.string().regex(/^\d+$/),
        }),
      })
      .parse(
        await this.request("swap", m, {
          from: m.userWallet,
          origin: m.userWallet,
          receiver: m.recipient,
          minReturn: m.minOutput,
          allowPartialFill: "false",
          disableEstimate: "false",
          forceApprove: "true",
        }),
      );
    if (BigInt(result.dstAmount) < BigInt(m.minOutput))
      throw new AppError(
        "MINIMUM_UNAVAILABLE",
        "The current route cannot satisfy the commitment.",
        409,
      );
    const tx: UnsignedTransaction = {
      ...result.tx,
      data: result.tx.data as Hex,
      chainId: m.chainId,
    };
    validateRoute(m, tx, c.router);
    return tx;
  }
}
export class LocalExecutionProvider implements ExecutionProvider {
  async quote(m: Mandate) {
    return m.minOutput;
  }
  async build(m: Mandate): Promise<UnsignedTransaction> {
    const { c } = chainClients();
    if (!c.local) throw new Error("Local execution disabled");
    return {
      from: m.userWallet,
      to: c.router,
      data: encodeFunctionData({
        abi: localAbi,
        functionName: "execute",
        args: [BigInt(m.amountIn), m.recipient, BigInt(m.minOutput)],
      }),
      value: "0",
      chainId: 31337,
    };
  }
}
export function executionProvider(): ExecutionProvider {
  return chainClients().c.local
    ? new LocalExecutionProvider()
    : new OneInchExecutionProvider();
}
export async function approvalTransaction(
  m: Mandate,
): Promise<UnsignedTransaction | undefined> {
  const { c, rpc } = chainClients();
  const allowance = await rpc.readContract({
    address: c.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [m.userWallet, c.router],
  });
  if (allowance === BigInt(m.amountIn)) return;
  // Reset a prior allowance before setting the exact amount; never ask for unlimited approval.
  return {
    from: m.userWallet,
    to: c.usdc,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [c.router, allowance > 0n ? 0n : BigInt(m.amountIn)],
    }),
    value: "0",
    chainId: m.chainId,
  };
}
