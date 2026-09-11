import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  createCommitment,
  DomainError,
  transitionCommitment,
} from '../packages/core/src/index.js';
import {
  canonicalizeMandate,
  compileSwapMandate,
  hashMandate,
  MandateValidationError,
} from '../packages/mandate/src/index.js';
import { verifyExecution } from '../packages/verifier/src/index.js';

const USDC = '0x1111111111111111111111111111111111111111';
const ETH = '0x2222222222222222222222222222222222222222';
const TREASURY = '0x3333333333333333333333333333333333333333';
const OTHER = '0x4444444444444444444444444444444444444444';
const NOW = 1_800_000_000;

function validMandate(overrides = {}) {
  return {
    assetIn: USDC,
    assetOut: ETH,
    maxSpend: 1_000_000_000n,
    minOutput: 480_000_000_000_000_000n,
    recipient: TREASURY,
    deadline: NOW + 60,
    ...overrides,
  };
}

test('compiles, canonicalizes, and hashes a valid swap mandate', () => {
  const first = compileSwapMandate(validMandate(), { now: NOW });
  const reordered = Object.fromEntries(Object.entries(first.mandate).reverse());

  assert.equal(first.mandate.type, 'SWAP');
  assert.equal(hashMandate(reordered), first.mandateHash);
  assert.match(canonicalizeMandate(first.mandate), /"maxSpend":"1000000000"/);
  assert.equal(first.mandateHash.length, 66);
});

test('rejects an unsafe or incomplete mandate', () => {
  assert.throws(
    () => compileSwapMandate(validMandate({ minOutput: 0n, deadline: NOW + 5 }), { now: NOW }),
    (error) => {
      assert.ok(error instanceof MandateValidationError);
      assert.deepEqual(error.issues.map((issue) => issue.code), ['INVALID_MIN_OUTPUT', 'INVALID_DEADLINE']);
      return true;
    },
  );
});

test('enforces commitment lifecycle and terminal states', () => {
  let commitment = createCommitment({
    id: 'commitment-1',
    mandateHash: `0x${'a'.repeat(64)}`,
    agentId: 'agent-1',
    bondAmount: 100_000_000n,
  });

  commitment = transitionCommitment(commitment, 'FUNDED');
  commitment = transitionCommitment(commitment, 'ACTIVE');
  commitment = transitionCommitment(commitment, 'FULFILLED');

  assert.equal(commitment.status, 'FULFILLED');
  assert.equal(canTransition('FULFILLED', 'FAILED'), false);
  assert.throws(() => transitionCommitment(commitment, 'FAILED'), DomainError);
});

test('passes execution evidence that satisfies every condition', () => {
  const { mandate } = compileSwapMandate(validMandate(), { now: NOW });
  const result = verifyExecution(
    { commitmentId: 'commitment-1', mandate },
    {
      commitmentId: 'commitment-1',
      success: true,
      actualSpend: 997_000_000n,
      actualOutput: 482_000_000_000_000_000n,
      recipient: TREASURY,
      timestamp: NOW + 34,
    },
  );

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.reasons, []);
});

test('reports every violated commitment condition', () => {
  const { mandate } = compileSwapMandate(validMandate(), { now: NOW });
  const result = verifyExecution(
    { commitmentId: 'commitment-1', mandate },
    {
      commitmentId: 'commitment-2',
      success: true,
      actualSpend: 1_001_000_000n,
      actualOutput: 461_000_000_000_000_000n,
      recipient: OTHER,
      timestamp: NOW + 61,
    },
  );

  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.reasons, [
    'COMMITMENT_MISMATCH',
    'EXCESS_SPEND',
    'INSUFFICIENT_OUTPUT',
    'WRONG_RECIPIENT',
    'DEADLINE_EXCEEDED',
  ]);
});

