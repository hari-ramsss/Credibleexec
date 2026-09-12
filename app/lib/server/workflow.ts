import { randomBytes } from "node:crypto";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import {
  AppError,
  hashMandate,
  sameAddress,
  type Commitment,
} from "@credibleexec/domain";
import { compileIntent, type Intent } from "@credibleexec/mandate";
import { verify } from "@credibleexec/verifier";
import {
  assertBinding,
  bondAbi,
  checkedChain,
  chainClients,
  sendOperation,
  termsFor,
} from "./chain";
import { db, read, save, put, locked, type Draft, type Job } from "./store";
import { executionProvider, approvalTransaction } from "./execution";
import { collectEvidence } from "./evidence";
export const newId = (): Hex => `0x${randomBytes(32).toString("hex")}`;
export function log(c: Commitment, stage: string, message: string) {
  if (c.timeline.at(-1)?.stage !== stage)
    c.timeline.push({ stage, message, at: Date.now() });
  c.error = undefined;
  save(c);
}
export function newJob(phase: Job["phase"], ref: string, owner: string) {
  const index = `job:${phase}:${ref}`;
  try {
    const existing = read<Job>(index, owner);
    if (existing.expires > Date.now()) return existing;
  } catch {}
  const job: Job = {
    id: newId(),
    owner,
    phase,
    ref,
    expires: Date.now() + 15 * 60000,
    stage: 0,
    done: false,
  };
  put(job.id, owner, "job", job);
  put(index, owner, "job-index", job);
  return job;
}
export async function readiness(c: Commitment) {
  const { c: cfg, rpc } = await checkedChain();
  const m = c.mandate;
  if (
    sameAddress(m.userWallet, c.agent) ||
    m.chainId !== cfg.chain.id ||
    !sameAddress(m.assetIn, cfg.usdc) ||
    c.mandateHash !== hashMandate(m)
  )
    throw new AppError(
      "INVALID_MANDATE",
      "The mandate does not match the execution configuration.",
    );
  if (m.deadline <= Number((await rpc.getBlock()).timestamp) + 15)
    throw new AppError(
      "EXPIRED",
      "There is not enough time left. Create and approve a new commitment.",
      409,
    );
  const [principal, collateral, gas] = await Promise.all([
    rpc.readContract({
      address: cfg.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [m.userWallet],
    }),
    rpc.readContract({
      address: cfg.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [c.agent],
    }),
    rpc.getBalance({ address: m.userWallet }),
  ]);
  if (principal < BigInt(m.amountIn))
    throw new AppError(
      "INSUFFICIENT_BALANCE",
      "Your wallet needs more USDC for this swap.",
      409,
    );
  if (c.bondStatus === "PENDING" && collateral < BigInt(c.bondAmount))
    throw new AppError(
      "INSUFFICIENT_COLLATERAL",
      "The agent needs more USDC to back this commitment.",
      409,
    );
  if (gas === 0n)
    throw new AppError(
      "INSUFFICIENT_GAS",
      "Your wallet needs a small ETH balance for network fees.",
      409,
    );
  await executionProvider().quote(m);
}
export async function fund(c: Commitment) {
  const { c: cfg, rpc } = chainClients();
  if (c.status === "CANCELLED")
    throw new AppError("CANCELLED", "This commitment was cancelled.", 409);
  const exists = await rpc.readContract({
    address: cfg.bond,
    abi: bondAbi,
    functionName: "exists",
    args: [c.id],
  });
  if (!exists)
    await sendOperation(
      `${c.id}:create`,
      "agent",
      cfg.bond,
      encodeFunctionData({
        abi: bondAbi,
        functionName: "createCommitment",
        args: [c.id, termsFor(c)],
      }),
    );
  let chain = await assertBinding(c);
  if (chain.status === 0) {
    await sendOperation(
      `${c.id}:approve-bond`,
      "agent",
      cfg.usdc,
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [cfg.bond, BigInt(c.bondAmount)],
      }),
    );
    c.fundingHash = await sendOperation(
      `${c.id}:deposit`,
      "agent",
      cfg.bond,
      encodeFunctionData({
        abi: bondAbi,
        functionName: "depositBond",
        args: [c.id],
      }),
    );
    chain = await assertBinding(c);
  }
  if (chain.status !== 1)
    throw new AppError(
      "INVALID_STATE",
      "The bond is not awaiting activation.",
      409,
    );
  c.status = "FUNDED";
  c.bondStatus = "LOCKED";
  log(c, "BONDED", "Agent collateral confirmed in the bond contract.");
}
export async function prepare(c: Commitment) {
  if (c.transaction) return;
  if (c.status !== "FUNDED")
    throw new AppError(
      "NOT_FUNDED",
      "The bond must be funded before authorization.",
      409,
    );
  await assertBinding(c);
  c.transaction = await executionProvider().build(c.mandate);
  c.executionStatus = "AWAITING_AUTHORIZATION";
  log(c, "PREPARED", "Execution prepared within your approved limits.");
}
export async function activate(c: Commitment) {
  if (c.status === "ACTIVE") return c;
  if (c.status !== "FUNDED" || !c.transaction)
    throw new AppError(
      "NOT_READY",
      "Prepare this commitment before authorizing execution.",
      409,
    );
  const { c: cfg, rpc } = await checkedChain();
  if (await approvalTransaction(c.mandate))
    throw new AppError(
      "APPROVAL_REQUIRED",
      "Approve the exact USDC allowance before execution.",
      409,
    );
  await readiness(c);
  const chain = await assertBinding(c);
  // Persist the exact wallet nonce before handing the transaction to Privy.
  c.transaction.nonce ??= await rpc.getTransactionCount({
    address: c.mandate.userWallet,
    blockTag: "pending",
  });
  db().exec(
    "CREATE TABLE IF NOT EXISTS user_nonces(wallet TEXT NOT NULL,nonce INTEGER NOT NULL,commitment_id TEXT NOT NULL UNIQUE,PRIMARY KEY(wallet,nonce))",
  );
  try {
    db()
      .prepare(
        "INSERT INTO user_nonces VALUES(?,?,?) ON CONFLICT(commitment_id) DO NOTHING",
      )
      .run(c.mandate.userWallet.toLowerCase(), c.transaction.nonce, c.id);
  } catch {
    throw new AppError(
      "WALLET_BUSY",
      "Another commitment reserves this wallet transaction. Finish it first.",
      409,
    );
  }
  save(c);
  if (chain.status === 1)
    await sendOperation(
      `${c.id}:activate`,
      "settler",
      cfg.bond,
      encodeFunctionData({
        abi: bondAbi,
        functionName: "activateCommitment",
        args: [c.id],
      }),
    );
  else if (chain.status !== 2)
    throw new AppError(
      "INVALID_STATE",
      "This commitment cannot be activated.",
      409,
    );
  c.status = "ACTIVE";
  log(
    c,
    "ACTIVE",
    "Commitment activated. Authorize the prepared swap in your wallet.",
  );
  return c;
}
export async function registerExecution(c: Commitment, hash: Hex) {
  if (c.executionHash) {
    if (c.executionHash !== hash)
      throw new AppError(
        "EXECUTION_EXISTS",
        "An execution is already bound to this commitment.",
        409,
      );
    return c;
  }
  if (c.status !== "ACTIVE" || !c.transaction)
    throw new AppError(
      "NOT_ACTIVE",
      "Activate the bonded commitment first.",
      409,
    );
  const { rpc } = chainClients();
  const tx = await rpc.getTransaction({ hash });
  if (
    !tx.to ||
    !sameAddress(tx.from, c.mandate.userWallet) ||
    !sameAddress(tx.to, c.transaction.to) ||
    tx.input !== c.transaction.data ||
    tx.value !== BigInt(c.transaction.value) ||
    tx.nonce !== c.transaction.nonce
  )
    throw new AppError(
      "INVALID_EXECUTION",
      "The transaction does not match this commitment.",
      409,
    );
  try {
    db()
      .prepare(
        "INSERT INTO executions VALUES(?,?) ON CONFLICT(hash) DO UPDATE SET commitment_id=excluded.commitment_id WHERE executions.commitment_id=excluded.commitment_id",
      )
      .run(hash, c.id);
    const bound = db()
      .prepare("SELECT commitment_id FROM executions WHERE hash=?")
      .get(hash) as { commitment_id: string };
    if (bound.commitment_id !== c.id) throw new Error("Already bound");
  } catch {
    throw new AppError(
      "EXECUTION_EXISTS",
      "This transaction is already linked to a commitment.",
      409,
    );
  }
  c.executionHash = hash;
  c.executionStatus = "SUBMITTED";
  log(c, "SUBMITTED", "Swap submitted. Waiting for confirmed evidence.");
  return c;
}
export async function settle(c: Commitment) {
  if (!c.evidence || !c.executionHash)
    throw new AppError("NO_EVIDENCE", "Confirmed evidence is required.", 409);
  const { c: cfg, rpc } = chainClients();
  // Re-read the canonical block immediately before settlement to detect a reorg.
  const block = await rpc.getBlock({
    blockNumber: BigInt(c.evidence.blockNumber),
  });
  if (block.hash !== c.evidence.blockHash)
    throw new AppError(
      "REORG_PENDING",
      "Evidence changed after a chain reorganization. Collect it again.",
      409,
    );
  const pendingSettlement = db()
    .prepare("SELECT hash FROM operations WHERE id=?")
    .get(`${c.id}:settle`);
  if (!pendingSettlement || !c.verification)
    c.verification = verify(
      c.mandate,
      c.evidence,
      c.id,
      c.executionHash,
      cfg.confirmations,
    );
  if (c.verification.bondAction === "HOLD") {
    c.executionStatus = c.evidence.success ? "UNKNOWN" : "REVERTED";
    log(
      c,
      "HOLD",
      "Evidence is inconclusive. Collateral remains locked for review.",
    );
    return;
  }
  const result = c.verification.status === "PASS" ? "FULFILLED" : "FAILED";
  const chain = await assertBinding(c);
  const expectedStatus = result === "FULFILLED" ? 3 : 4;
  if (chain.status !== 2 && chain.status !== expectedStatus)
    throw new AppError(
      "INVALID_STATE",
      "The commitment is not eligible for this settlement.",
      409,
    );
  // Always reconcile the same signed settlement transaction, even after a lost response.
  save(c);
  c.settlementHash = await sendOperation(
    `${c.id}:settle`,
    "settler",
    cfg.bond,
    encodeFunctionData({
      abi: bondAbi,
      functionName: result === "FULFILLED" ? "settleSuccess" : "settleFailure",
      args: [c.id, c.verification.evidenceHash],
    }),
  );
  c.status = result;
  c.bondStatus = result === "FULFILLED" ? "RELEASED" : "SLASHED";
  c.executionStatus = "CONFIRMED";
  log(
    c,
    "SETTLED",
    result === "FULFILLED"
      ? "Promise fulfilled. The agent’s collateral was returned."
      : "Promise violated. The agent’s collateral was sent to your wallet.",
  );
}
export async function cancel(c: Commitment) {
  if (c.status === "CANCELLED") return c;
  if (!["CREATED", "FUNDED"].includes(c.status))
    throw new AppError(
      "CANNOT_CANCEL",
      "An active commitment requires evidence or operator review.",
      409,
    );
  const { c: cfg, rpc } = chainClients();
  if (
    await rpc.readContract({
      address: cfg.bond,
      abi: bondAbi,
      functionName: "exists",
      args: [c.id],
    })
  )
    await sendOperation(
      `${c.id}:cancel`,
      "settler",
      cfg.bond,
      encodeFunctionData({
        abi: bondAbi,
        functionName: "cancelCommitment",
        args: [c.id],
      }),
    );
  c.status = "CANCELLED";
  if (c.bondStatus === "LOCKED") c.bondStatus = "RELEASED";
  log(
    c,
    "CANCELLED",
    "Commitment cancelled before activation. Any deposited collateral was returned.",
  );
  return c;
}
export async function tool(jobId: string, action: string, intent?: Intent) {
  return locked(`job:${jobId}`, async () => {
    const job = read<Job>(jobId);
    if (job.expires < Date.now())
      throw new AppError("JOB_EXPIRED", "Workflow request expired.", 409);
    if (job.phase === "compile") {
      const d = read<Draft>(job.ref, job.owner);
      if (action === "context") {
        job.stage = Math.max(1, job.stage);
        put(job.id, job.owner, "job", job);
        return {
          request: d.request,
          chainId: d.context.chainId,
          userWallet: d.context.userWallet,
          defaultRecipient: d.context.defaultRecipient,
          assets: { USDC: d.context.usdc, ETH: "native ETH" },
          rules:
            "Extract only explicit constraints. Missing values must be null. Do not perform conditional, recurring, or cross-chain actions.",
        };
      }
      if (action === "compile" && job.stage >= 1) {
        if (!d.result) {
          d.result = compileIntent(intent, d.context);
          put(d.id, d.userId, "draft", d);
        }
        job.done = true;
        job.stage = 2;
        put(job.id, job.owner, "job", job);
        return d.result;
      }
    } else
      return locked(`commitment:${job.ref}`, async () => {
        const c = read<Commitment>(job.ref, job.owner);
        if (job.phase === "fund") {
          if (action === "readiness") {
            if (c.status === "CREATED" && job.stage < 1) await readiness(c);
            job.stage = Math.max(1, job.stage);
          } else if (action === "fund" && job.stage >= 1) {
            if (c.status === "CREATED") await fund(c);
            job.stage = Math.max(2, job.stage);
          } else if (action === "prepare" && job.stage >= 2) {
            await prepare(c);
            job.stage = 3;
            job.done = true;
          } else
            throw new AppError(
              "INVALID_STAGE",
              "Run readiness, fund, then prepare in order.",
              409,
            );
        } else {
          if (action === "evidence") {
            if (
              !["FULFILLED", "FAILED"].includes(c.status) &&
              !db()
                .prepare("SELECT hash FROM operations WHERE id=?")
                .get(`${c.id}:settle`)
            ) {
              c.evidence = await collectEvidence(c);
              save(c);
            }
            job.stage = 1;
          } else if (action === "settle" && job.stage >= 1) {
            if (!["FULFILLED", "FAILED"].includes(c.status)) await settle(c);
            job.stage = 2;
            job.done = true;
          } else
            throw new AppError(
              "INVALID_STAGE",
              "Collect evidence before deterministic settlement.",
              409,
            );
        }
        put(job.id, job.owner, "job", job);
        return {
          commitmentId: c.id,
          status: c.status,
          bondStatus: c.bondStatus,
          executionStatus: c.executionStatus,
          done: job.done,
        };
      });
    throw new AppError(
      "INVALID_STAGE",
      "This tool is not permitted for this workflow phase.",
      409,
    );
  });
}
