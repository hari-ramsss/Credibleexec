/** @typedef {'CREATED'|'FUNDED'|'ACTIVE'|'FULFILLED'|'FAILED'|'EXPIRED'|'CANCELLED'} CommitmentStatus */

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const transitions = Object.freeze({
  CREATED: Object.freeze(['FUNDED', 'CANCELLED']),
  FUNDED: Object.freeze(['ACTIVE', 'CANCELLED']),
  ACTIVE: Object.freeze(['FULFILLED', 'FAILED', 'EXPIRED']),
  FULFILLED: Object.freeze([]),
  FAILED: Object.freeze([]),
  EXPIRED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

export const COMMITMENT_STATUSES = Object.freeze(Object.keys(transitions));

export function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}

export function transitionCommitment(commitment, nextStatus) {
  if (!canTransition(commitment.status, nextStatus)) {
    throw new DomainError(
      'INVALID_COMMITMENT_TRANSITION',
      `Cannot transition commitment from ${commitment.status} to ${nextStatus}`,
    );
  }

  return Object.freeze({ ...commitment, status: nextStatus });
}

export function createCommitment({ id, mandateHash, agentId, bondAmount }) {
  if (!id || !mandateHash || !agentId) {
    throw new DomainError('INVALID_COMMITMENT', 'Commitment identifiers are required');
  }
  if (typeof bondAmount !== 'bigint' || bondAmount <= 0n) {
    throw new DomainError('INVALID_BOND', 'Bond amount must be a positive bigint');
  }

  return Object.freeze({
    id,
    mandateHash,
    agentId,
    bondAmount,
    status: 'CREATED',
  });
}

