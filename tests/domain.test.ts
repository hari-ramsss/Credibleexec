import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, encodeFunctionData, type Hex } from "viem";
import {
  compileIntent,
  parseLocalIntent,
  exactAmount,
} from "../packages/mandate/src/compiler";
import {
  hashMandate,
  hashObject,
  transition,
  ETH,
  type Evidence,
} from "../packages/domain/src/index";
import { verify } from "../packages/verifier/src/verify";
import { nativeReceived } from "../app/lib/server/evidence";
import { routerAbi, validateRoute } from "../app/lib/server/execution";
const user = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const router = getAddress("0x3333333333333333333333333333333333333333");
const ctx = {
  chainId: 8453,
  usdc: token,
  userWallet: user,
  defaultRecipient: user,
  now: 1000,
};
const intent = parseLocalIntent(
  "Swap 1000 USDC for ETH. Receive at least 0.48 ETH within a minute, sent to my treasury.",
);
const compiled = compileIntent(intent, ctx);
if (compiled.status !== "SUCCESS") throw new Error("Invalid fixture");
const m = compiled.mandate,
  id = hashObject("commitment"),
  txHash = hashObject("transaction");
const evidence: Evidence = {
  commitmentId: id,
  mandateHash: hashMandate(m),
  transactionHash: txHash,
  chainId: 8453,
  success: true,
  complete: true,
  actualSpend: "999000000",
  actualOutput: "480000000000000000",
  recipient: user,
  inputAsset: token,
  outputAsset: ETH,
  timestamp: 1060,
  blockNumber: "10",
  blockHash: hashObject("block"),
  confirmations: 2,
};
test("compiler preserves exact base units and reproducible canonical mandate binding", () => {
  assert.equal(m.maxSpend, "1000000000");
  assert.equal(m.minOutput, "480000000000000000");
  assert.equal(m.deadline, 1060);
  assert.equal(hashMandate({ ...m }), compiled.mandateHash);
  assert.notEqual(hashMandate({ ...m, minOutput: "1" }), compiled.mandateHash);
});
test("missing financial limits require clarification", () => {
  const c = compileIntent({ ...intent, minOutput: null }, ctx);
  assert.equal(c.status, "CLARIFICATION_NEEDED");
});
test("invalid addresses, overprecision, unsupported operations and insufficient principal fail", () => {
  for (const amount of ["1e3", "-1", "0", "1.0000001", "NaN"])
    assert.throws(() => exactAmount(amount, 6));
  assert.throws(() => compileIntent({ ...intent, recipient: "0x123" }, ctx));
  assert.throws(() => compileIntent({ ...intent, unsupported: true }, ctx));
  assert.throws(() => compileIntent(intent, { ...ctx, balance: 1n }));
});
test("boundary amounts and block deadline pass without float rounding", () => {
  assert.equal(verify(m, evidence, id, txHash).bondAction, "RELEASE");
  assert.equal(exactAmount("0.000000000000000001", 18), 1n);
});
test("each proven mandate violation slashes while preserving the approved mandate", () => {
  for (const [patch, reason] of [
    [{ actualOutput: "479999999999999999" }, "MIN_OUTPUT_NOT_MET"],
    [{ actualSpend: "1000000001" }, "MAX_SPEND_EXCEEDED"],
    [{ recipient: router }, "WRONG_RECIPIENT"],
    [{ timestamp: 1061 }, "DEADLINE_EXCEEDED"],
  ] as const) {
    const result = verify(m, { ...evidence, ...patch }, id, txHash);
    assert.equal(result.bondAction, "SLASH");
    assert.ok(result.reasons.includes(reason));
  }
  assert.equal(m.minOutput, "480000000000000000");
});
test("reverts, missing confirmations, missing traces and mismatched execution never auto-slash", () => {
  for (const patch of [
    { success: false },
    { complete: false },
    { confirmations: 1 },
    { transactionHash: hashObject("another") },
    { chainId: 1 },
    { mandateHash: hashObject("forged") },
    { actualSpend: "0" },
    { timestamp: 0 },
  ])
    assert.equal(
      verify(m, { ...evidence, ...patch }, id, txHash).bondAction,
      "HOLD",
    );
});
test("native evidence ignores reverted subtrees and delegatecall value, subtracts recipient outflows", () => {
  const trace = {
    type: "CALL",
    from: router,
    to: router,
    value: "0x0",
    calls: [
      { type: "CALL", from: router, to: user, value: "100" },
      { type: "DELEGATECALL", from: router, to: user, value: "1000" },
      {
        type: "CALL",
        from: router,
        to: user,
        value: "1000",
        error: "revert",
        calls: [{ type: "CALL", from: router, to: user, value: "9000" }],
      },
      { type: "CALL", from: user, to: router, value: "10" },
    ],
  };
  assert.equal(nativeReceived(trace, user), 90n);
});
test("calldata is independently decoded and bound to recipient, limits, tokens, flags and router", () => {
  const desc = {
    srcToken: token,
    dstToken: ETH,
    srcReceiver: router,
    dstReceiver: user,
    amount: BigInt(m.amountIn),
    minReturnAmount: BigInt(m.minOutput),
    flags: 0n,
  };
  const make = (patch: Partial<typeof desc> = {}) => ({
    from: user,
    to: router,
    value: "0",
    chainId: 8453,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "swap",
      args: [router, { ...desc, ...patch }, "0x"],
    }),
  });
  assert.doesNotThrow(() => validateRoute(m, make(), router));
  for (const patch of [
    { dstReceiver: router },
    { amount: 1n },
    { minReturnAmount: 1n },
    { flags: 1n },
    { dstToken: token },
  ])
    assert.throws(() => validateRoute(m, make(patch), router));
  assert.throws(() =>
    validateRoute(m, { ...make(), data: "0x12345678" as Hex }, router),
  );
});
test("terminal commitments cannot be reactivated or settled in the opposite direction", () => {
  assert.equal(transition("FUNDED", "ACTIVE"), "ACTIVE");
  for (const state of ["FULFILLED", "FAILED", "EXPIRED", "CANCELLED"] as const)
    assert.throws(() => transition(state, "ACTIVE"));
  assert.throws(() => transition("CREATED", "ACTIVE"));
});
