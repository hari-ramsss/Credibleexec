import {
  getAddress,
  isAddress,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
export const ETH = getAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
export const addressSchema = z
  .string()
  .refine(
    (v) => isAddress(v) && v.toLowerCase() !== zeroAddress,
    "Enter a valid, non-zero wallet address.",
  )
  .transform((v) => getAddress(v));
export const uintSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((v) => BigInt(v) < 2n ** 256n, "Amount exceeds uint256.");
export const mandateSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("SWAP"),
    chainId: z.number().int().positive(),
    assetIn: addressSchema,
    assetOut: addressSchema,
    amountIn: uintSchema,
    maxSpend: uintSchema,
    minOutput: uintSchema,
    recipient: addressSchema,
    userWallet: addressSchema,
    deadline: z.number().int().positive(),
    executionVenue: z.enum(["1inch", "test-fixture"]),
  })
  .strict()
  .refine(
    (m) => m.assetIn !== m.assetOut && BigInt(m.amountIn) <= BigInt(m.maxSpend),
    "Invalid asset pair or spend limit.",
  );
/** Exact base-unit decimal strings on the wire; bigint for all arithmetic. */
export type Mandate = z.infer<typeof mandateSchema>;
export type Status =
  | "CREATED"
  | "FUNDED"
  | "ACTIVE"
  | "FULFILLED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";
export type BondStatus = "PENDING" | "LOCKED" | "RELEASED" | "SLASHED";
export type ExecutionStatus =
  | "PREPARING"
  | "AWAITING_AUTHORIZATION"
  | "SUBMITTED"
  | "CONFIRMED"
  | "REVERTED"
  | "UNKNOWN";
export interface UnsignedTransaction {
  from: Address;
  to: Address;
  data: Hex;
  value: string;
  chainId: number;
  nonce?: number;
}
export interface Evidence {
  commitmentId: Hex;
  mandateHash: Hex;
  transactionHash: Hex;
  chainId: number;
  success: boolean;
  complete: boolean;
  actualSpend: string;
  actualOutput: string;
  recipient: Address;
  inputAsset: Address;
  outputAsset: Address;
  timestamp: number;
  blockNumber: string;
  blockHash: Hex;
  confirmations: number;
}
export type FailureReason =
  | "MAX_SPEND_EXCEEDED"
  | "MIN_OUTPUT_NOT_MET"
  | "WRONG_RECIPIENT"
  | "DEADLINE_EXCEEDED"
  | "TRANSACTION_REVERTED"
  | "INVALID_EXECUTION"
  | "INSUFFICIENT_EVIDENCE";
export interface Verification {
  status: "PASS" | "FAIL" | "INCONCLUSIVE";
  reasons: FailureReason[];
  bondAction: "RELEASE" | "SLASH" | "HOLD";
  evidenceHash: Hex;
}
export interface TimelineEntry {
  stage: string;
  at: number;
  message: string;
}
export interface Commitment {
  id: Hex;
  userId: string;
  mandate: Mandate;
  mandateHash: Hex;
  request: string;
  agent: Address;
  bondAmount: string;
  bondStatus: BondStatus;
  status: Status;
  executionStatus: ExecutionStatus;
  createdAt: number;
  timeline: TimelineEntry[];
  transaction?: UnsignedTransaction;
  executionHash?: Hex;
  evidence?: Evidence;
  verification?: Verification;
  settlementHash?: Hex;
  fundingHash?: Hex;
  error?: string;
}
export function canonical(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function hashObject(value: unknown): Hex {
  return keccak256(toHex(canonical(value)));
}
export function hashMandate(value: Mandate): Hex {
  return hashObject(mandateSchema.parse(value));
}
export const transitions: Record<Status, Status[]> = {
  CREATED: ["FUNDED", "CANCELLED"],
  FUNDED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["FULFILLED", "FAILED", "EXPIRED"],
  FULFILLED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
};
export function transition(from: Status, to: Status) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid transition: ${from} → ${to}`);
  return to;
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
