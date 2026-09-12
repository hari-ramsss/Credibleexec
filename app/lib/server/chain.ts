import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { bondAbi } from "../../../packages/domain/src/bond-abi";
import {
  AppError,
  hashMandate,
  sameAddress,
  type Commitment,
} from "@credibleexec/domain";
import { config } from "./config";
import { db, locked } from "./store";
export { bondAbi };
export function chainClients() {
  const c = config();
  return {
    c,
    rpc: createPublicClient({
      chain: c.chain,
      transport: http(c.rpc, { timeout: 15000, retryCount: 1 }),
    }),
  };
}
export async function checkedChain() {
  const { c, rpc } = chainClients();
  if ((await rpc.getChainId()) !== c.chain.id)
    throw new AppError(
      "WRONG_CHAIN",
      "The configured RPC is on the wrong chain.",
      503,
    );
  const [token, authority] = await Promise.all([
    rpc.readContract({
      address: c.bond,
      abi: bondAbi,
      functionName: "bondToken",
    }),
    rpc.readContract({
      address: c.bond,
      abi: bondAbi,
      functionName: "settlementAuthority",
    }),
  ]);
  if (!sameAddress(token, c.usdc) || !sameAddress(authority, c.settler.address))
    throw new AppError(
      "CONTRACT_CONFIG",
      "Contract token or settlement authority does not match configuration.",
      503,
    );
  return { c, rpc };
}
/** Persist signed bytes before broadcast. Retrying an operation rebroadcasts those same bytes. */
export async function sendOperation(
  id: string,
  who: "agent" | "settler",
  to: Address,
  data: Hex,
) {
  const { c, rpc } = await checkedChain();
  const account = who === "agent" ? c.agent : c.settler;
  const op = await locked(`signer:${account.address}`, async () => {
    let row = db()
      .prepare("SELECT raw,hash FROM operations WHERE id=?")
      .get(id) as { raw: Hex; hash: Hex } | undefined;
    if (!row) {
      const wallet = createWalletClient({
        account,
        chain: c.chain,
        transport: http(c.rpc),
      });
      const pending = await rpc.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      const saved = db()
        .prepare("SELECT MAX(nonce) as nonce FROM operations WHERE signer=?")
        .get(account.address) as { nonce: number | null };
      const nonce = Math.max(pending, (saved.nonce ?? -1) + 1);
      const prepared = await wallet.prepareTransactionRequest({
        to,
        data,
        value: 0n,
        nonce,
        chain: c.chain,
      });
      const raw = await wallet.signTransaction(prepared);
      row = { raw, hash: keccak256(raw) };
      db()
        .prepare("INSERT INTO operations VALUES(?,?,?,?,?)")
        .run(id, account.address, nonce, raw, row.hash);
    }
    try {
      await rpc.sendRawTransaction({ serializedTransaction: row.raw });
    } catch {
      // A lost broadcast response or "already known" is reconciled against the stored hash.
      const known = await rpc
        .getTransaction({ hash: row.hash })
        .catch(() => null);
      if (!known)
        throw new AppError(
          "BROADCAST_UNKNOWN",
          "Transaction submission is uncertain. Retry this step to reconcile the same transaction.",
          503,
        );
    }
    return row;
  });
  const receipt = await rpc
    .waitForTransactionReceipt({
      hash: op.hash,
      confirmations: c.confirmations,
      timeout: 20000,
      pollingInterval: 1000,
    })
    .catch(() => null);
  if (!receipt)
    throw new AppError(
      "CONFIRMATION_PENDING",
      "Waiting for blockchain confirmation. Refresh to continue.",
      409,
    );
  if (receipt.status !== "success")
    throw new AppError(
      "TRANSACTION_REVERTED",
      "The contract transaction reverted. Operator review is needed.",
      409,
    );
  return op.hash;
}
export function termsFor(c: Commitment) {
  const m = c.mandate;
  return {
    agent: c.agent,
    user: m.userWallet,
    principalToken: m.assetIn,
    targetToken: m.assetOut,
    principalAmount: BigInt(m.amountIn),
    maxSpend: BigInt(m.maxSpend),
    minOutput: BigInt(m.minOutput),
    recipient: m.recipient,
    deadline: BigInt(m.deadline),
    bondAmount: BigInt(c.bondAmount),
    mandateHash: c.mandateHash,
  };
}
export async function assertBinding(c: Commitment) {
  const { c: cfg, rpc } = await checkedChain();
  const onchain = await rpc.readContract({
    address: cfg.bond,
    abi: bondAbi,
    functionName: "getCommitment",
    args: [c.id],
  });
  if (c.mandateHash !== hashMandate(c.mandate))
    throw new AppError(
      "BINDING_MISMATCH",
      "The approved mandate does not match its hash.",
      409,
    );
  const expected = termsFor(c);
  for (const key of Object.keys(expected) as (keyof typeof expected)[])
    if (
      String(expected[key]).toLowerCase() !==
      String(onchain.terms[key]).toLowerCase()
    )
      throw new AppError(
        "BINDING_MISMATCH",
        "The onchain commitment differs from the approved mandate.",
        409,
      );
  return onchain;
}
