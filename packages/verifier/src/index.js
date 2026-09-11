export const VERIFICATION_FAILURES = Object.freeze({
  EXCESS_SPEND: 'EXCESS_SPEND',
  INSUFFICIENT_OUTPUT: 'INSUFFICIENT_OUTPUT',
  WRONG_RECIPIENT: 'WRONG_RECIPIENT',
  DEADLINE_EXCEEDED: 'DEADLINE_EXCEEDED',
  TRANSACTION_REVERTED: 'TRANSACTION_REVERTED',
  COMMITMENT_MISMATCH: 'COMMITMENT_MISMATCH',
});

export function verifyExecution({ commitmentId, mandate }, evidence) {
  const reasons = [];

  if (evidence.commitmentId !== commitmentId) reasons.push(VERIFICATION_FAILURES.COMMITMENT_MISMATCH);
  if (evidence.success !== true) reasons.push(VERIFICATION_FAILURES.TRANSACTION_REVERTED);
  if (evidence.actualSpend > mandate.maxSpend) reasons.push(VERIFICATION_FAILURES.EXCESS_SPEND);
  if (evidence.actualOutput < mandate.minOutput) reasons.push(VERIFICATION_FAILURES.INSUFFICIENT_OUTPUT);
  if (evidence.recipient.toLowerCase() !== mandate.recipient.toLowerCase()) {
    reasons.push(VERIFICATION_FAILURES.WRONG_RECIPIENT);
  }
  if (evidence.timestamp > mandate.deadline) reasons.push(VERIFICATION_FAILURES.DEADLINE_EXCEEDED);

  return Object.freeze({
    commitmentId,
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    reasons: Object.freeze(reasons),
    actualSpend: evidence.actualSpend,
    actualOutput: evidence.actualOutput,
    actualRecipient: evidence.recipient,
    verifiedAt: evidence.timestamp,
  });
}

