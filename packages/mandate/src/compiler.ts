import { z } from "zod";
import { parseUnits, formatUnits, type Address } from "viem";
import {
  addressSchema,
  AppError,
  ETH,
  hashMandate,
  mandateSchema,
  type Mandate,
} from "@credibleexec/domain";

export const intentSchema = z
  .object({
    type: z.literal("SWAP"),
    assetIn: z.literal("USDC"),
    assetOut: z.literal("ETH"),
    amountIn: z.string().nullable(),
    maxSpend: z.string().nullable(),
    minOutput: z.string().nullable(),
    recipient: z.string().nullable(),
    durationSeconds: z.number().int().nullable(),
    unsupported: z.boolean().default(false),
  })
  .strict();
export type Intent = z.infer<typeof intentSchema>;
export interface Context {
  chainId: number;
  usdc: Address;
  userWallet: Address;
  defaultRecipient?: Address;
  now: number;
  balance?: bigint;
}
export type Compilation =
  | {
      status: "SUCCESS";
      mandate: Mandate;
      mandateHash: `0x${string}`;
      summary: {
        spend: string;
        receive: string;
        recipient: string;
        deadline: number;
        duration: number;
      };
    }
  | { status: "CLARIFICATION_NEEDED"; questions: string[] };
export function exactAmount(value: string, decimals: number): bigint {
  if (
    !new RegExp(`^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,${decimals}})?$`).test(value)
  )
    throw new AppError(
      "INVALID_AMOUNT",
      `Use a positive amount with at most ${decimals} decimal places.`,
    );
  const amount = parseUnits(value, decimals);
  if (amount <= 0n || amount >= 2n ** 256n)
    throw new AppError(
      "INVALID_AMOUNT",
      "Amount must be positive and within token limits.",
    );
  return amount;
}
export function compileIntent(raw: unknown, ctx: Context): Compilation {
  const i = intentSchema.parse(raw);
  if (i.unsupported)
    throw new AppError(
      "UNSUPPORTED_OPERATION",
      "Only a one-time USDC to ETH swap is supported.",
    );
  const questions: string[] = [];
  if (!i.amountIn) questions.push("How much USDC should the agent swap?");
  if (!i.maxSpend) questions.push("What is your maximum USDC spend?");
  if (!i.minOutput) questions.push("What is the minimum ETH you must receive?");
  if (!i.recipient) questions.push("Which wallet should receive the ETH?");
  if (i.durationSeconds === null)
    questions.push("How many seconds may execution take?");
  if (questions.length) return { status: "CLARIFICATION_NEEDED", questions };
  const duration = i.durationSeconds!;
  if (duration <= 15 || duration > 86400)
    throw new AppError(
      "INVALID_DEADLINE",
      "Choose a duration longer than 15 seconds and at most 24 hours.",
    );
  const recipient =
    i.recipient === "treasury"
      ? ctx.defaultRecipient
      : i.recipient === "my wallet"
        ? ctx.userWallet
        : i.recipient;
  if (!recipient)
    return {
      status: "CLARIFICATION_NEEDED",
      questions: ["Enter the treasury wallet address."],
    };
  const amount = exactAmount(i.amountIn!, 6),
    max = exactAmount(i.maxSpend!, 6),
    min = exactAmount(i.minOutput!, 18);
  if (ctx.balance !== undefined && amount > ctx.balance)
    throw new AppError(
      "INSUFFICIENT_BALANCE",
      "Your wallet needs more USDC for this swap.",
    );
  const mandate = mandateSchema.parse({
    version: 1,
    type: "SWAP",
    chainId: ctx.chainId,
    assetIn: ctx.usdc,
    assetOut: ETH,
    amountIn: amount.toString(),
    maxSpend: max.toString(),
    minOutput: min.toString(),
    recipient: addressSchema.parse(recipient),
    userWallet: ctx.userWallet,
    deadline: ctx.now + duration,
    executionVenue: "1inch",
  });
  return {
    status: "SUCCESS",
    mandate,
    mandateHash: hashMandate(mandate),
    summary: {
      spend: `${formatUnits(amount, 6)} USDC (maximum ${formatUnits(max, 6)})`,
      receive: `${formatUnits(min, 18)} ETH`,
      recipient: mandate.recipient,
      deadline: mandate.deadline,
      duration,
    },
  };
}

/** Explicitly limited local development parser. Live natural language uses the gateway. */
export function parseLocalIntent(request: string): Intent {
  const text = request.trim();
  const amount =
    text
      .match(/(?:swap|exchange)\s+\$?([\d,]+(?:\.\d+)?)\s*USDC/i)?.[1]
      ?.replaceAll(",", "") ?? null;
  const max =
    text
      .match(
        /(?:at most|no more than|maximum(?: spend)?(?: of)?)\s+\$?([\d,]+(?:\.\d+)?)\s*USDC/i,
      )?.[1]
      ?.replaceAll(",", "") ?? amount;
  const min = text.match(/at least\s+([\d.]+)\s*ETH\b/i)?.[1] ?? null;
  const time = text.match(
    /within\s+(\d+|a|one)\s*(seconds?|s\b|minutes?|m\b|hours?)/i,
  );
  const duration = time
    ? Number(/^(a|one)$/i.test(time[1]) ? 1 : time[1]) *
      (time[2].startsWith("m") ? 60 : time[2].startsWith("h") ? 3600 : 1)
    : null;
  const addresses = text.match(/0x[a-fA-F0-9]{40}\b/g) ?? [];
  return {
    type: "SWAP",
    assetIn: "USDC",
    assetOut: "ETH",
    amountIn: amount,
    maxSpend: max,
    minOutput: min,
    recipient:
      addresses.length === 1
        ? addresses[0]
        : /\btreasury\b/i.test(text)
          ? "treasury"
          : /my wallet/i.test(text)
            ? "my wallet"
            : null,
    durationSeconds: duration,
    unsupported:
      /\b(every|weekly|bridge|if|unless|WETH|BTC|USDT)\b/i.test(text) ||
      addresses.length > 1 ||
      !/\b(?:for|to)\s+ETH\b/i.test(text),
  };
}
