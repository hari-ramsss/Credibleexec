import {
  hashMandate,
  hashObject,
  sameAddress,
  type Evidence,
  type Mandate,
  type Verification,
  type FailureReason,
} from "@credibleexec/domain";
import type { Hex } from "viem";
export function verify(
  m: Mandate,
  e: Evidence,
  id: Hex,
  expectedHash: Hex,
  requiredConfirmations = 2,
): Verification {
  const evidenceHash = hashObject(e);
  const hold = (reason: FailureReason): Verification => ({
    status: "INCONCLUSIVE",
    reasons: [reason],
    bondAction: "HOLD",
    evidenceHash,
  });
  if (
    e.commitmentId !== id ||
    e.mandateHash !== hashMandate(m) ||
    e.transactionHash !== expectedHash ||
    e.chainId !== m.chainId ||
    !sameAddress(e.inputAsset, m.assetIn) ||
    !sameAddress(e.outputAsset, m.assetOut)
  )
    return hold("INVALID_EXECUTION");
  if (!e.success) return hold("TRANSACTION_REVERTED");
  if (
    !e.complete ||
    e.confirmations < requiredConfirmations ||
    !Number.isSafeInteger(e.timestamp) ||
    e.timestamp <= 0 ||
    !/^\d+$/.test(e.actualSpend) ||
    !/^\d+$/.test(e.actualOutput) ||
    BigInt(e.actualSpend) <= 0n
  )
    return hold("INSUFFICIENT_EVIDENCE");
  const reasons: FailureReason[] = [];
  if (BigInt(e.actualSpend) > BigInt(m.maxSpend))
    reasons.push("MAX_SPEND_EXCEEDED");
  if (BigInt(e.actualOutput) < BigInt(m.minOutput))
    reasons.push("MIN_OUTPUT_NOT_MET");
  if (!sameAddress(e.recipient, m.recipient)) reasons.push("WRONG_RECIPIENT");
  if (e.timestamp > m.deadline) reasons.push("DEADLINE_EXCEEDED");
  return {
    status: reasons.length ? "FAIL" : "PASS",
    reasons,
    bondAction: reasons.length ? "SLASH" : "RELEASE",
    evidenceHash,
  };
}
