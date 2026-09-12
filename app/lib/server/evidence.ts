import { decodeEventLog, erc20Abi, type Hex, type Address } from "viem";
import {
  AppError,
  sameAddress,
  type Commitment,
  type Evidence,
} from "@credibleexec/domain";
import { chainClients } from "./chain";
import { localAbi } from "./execution";
export interface CallTrace {
  type: string;
  from?: string;
  to?: string;
  value?: string;
  error?: string;
  calls?: CallTrace[];
}
/** Count committed native value movement only; failed subtrees and delegatecalls do not transfer ETH. */
export function nativeReceived(trace: CallTrace, recipient: string): bigint {
  if (trace.error) return 0n;
  let total = 0n;
  if (["CALL", "CREATE", "CREATE2", "SELFDESTRUCT"].includes(trace.type)) {
    const value = BigInt(trace.value ?? "0");
    if (trace.to && sameAddress(trace.to, recipient)) total += value;
    if (trace.from && sameAddress(trace.from, recipient)) total -= value;
  }
  for (const child of trace.calls ?? [])
    total += nativeReceived(child, recipient);
  return total;
}
export async function collectEvidence(c: Commitment): Promise<Evidence> {
  const { c: cfg, rpc } = chainClients();
  if (!c.executionHash || !c.transaction)
    throw new AppError(
      "NO_EXECUTION",
      "No submitted execution is recorded.",
      409,
    );
  const [receipt, tx, head] = await Promise.all([
    rpc.getTransactionReceipt({ hash: c.executionHash }),
    rpc.getTransaction({ hash: c.executionHash }),
    rpc.getBlockNumber(),
  ]);
  const expected = c.transaction;
  if (
    !tx.to ||
    !sameAddress(tx.to, expected.to) ||
    !sameAddress(tx.from, expected.from) ||
    tx.input.toLowerCase() !== expected.data.toLowerCase() ||
    tx.value !== BigInt(expected.value) ||
    tx.nonce !== expected.nonce
  )
    throw new AppError(
      "INVALID_EXECUTION",
      "This transaction does not match the authorized execution.",
      409,
    );
  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new AppError(
      "REORG_PENDING",
      "Waiting for a stable blockchain confirmation.",
      409,
    );
  let spend = 0n,
    output = 0n,
    complete = receipt.status === "success";
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, c.mandate.assetIn)) continue;
    try {
      const event = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
        eventName: "Transfer",
      });
      if (sameAddress(event.args.from, c.mandate.userWallet))
        spend += event.args.value;
      if (sameAddress(event.args.to, c.mandate.userWallet))
        spend -= event.args.value;
    } catch {
      /* Other USDC events are irrelevant. */
    }
  }
  if (cfg.local) {
    let found = false;
    for (const log of receipt.logs)
      if (sameAddress(log.address, cfg.router))
        try {
          const event = decodeEventLog({
            abi: localAbi,
            data: log.data,
            topics: log.topics,
            eventName: "Executed",
          });
          if (
            sameAddress(event.args.sender, c.mandate.userWallet) &&
            sameAddress(event.args.recipient, c.mandate.recipient)
          ) {
            output += event.args.outputAmount;
            found = true;
          }
        } catch {}
    complete = complete && found;
  } else if (complete) {
    // Native ETH has no ERC-20 Transfer log. Transaction-scoped traces avoid unrelated block balance changes.
    const response = await fetch(cfg.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "debug_traceTransaction",
        params: [
          c.executionHash,
          { tracer: "callTracer", tracerConfig: { onlyTopCall: false } },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const body = (await response.json()) as {
      result?: CallTrace;
      error?: unknown;
    };
    if (
      !response.ok ||
      body.error ||
      body.result?.error ||
      !body.result?.type ||
      !body.result.from ||
      !body.result.to ||
      !sameAddress(body.result.from, tx.from) ||
      !sameAddress(body.result.to, tx.to)
    )
      complete = false;
    else output = nativeReceived(body.result, c.mandate.recipient);
  }
  return {
    commitmentId: c.id,
    mandateHash: c.mandateHash,
    transactionHash: c.executionHash as Hex,
    chainId: cfg.chain.id,
    success: receipt.status === "success",
    complete: complete && spend >= 0n && output >= 0n,
    actualSpend: (spend < 0n ? 0n : spend).toString(),
    actualOutput: (output < 0n ? 0n : output).toString(),
    recipient: c.mandate.recipient as Address,
    inputAsset: c.mandate.assetIn,
    outputAsset: c.mandate.assetOut,
    timestamp: Number(block.timestamp),
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    confirmations: Number(head - receipt.blockNumber + 1n),
  };
}
