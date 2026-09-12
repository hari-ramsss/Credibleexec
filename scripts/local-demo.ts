import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { root } from "../contracts/scripts/compile";
import type {
  Commitment,
  UnsignedTransaction,
} from "../packages/domain/src/index";
const deployment = JSON.parse(
  fs.readFileSync(path.join(root, ".local/deployment.json"), "utf8"),
) as {
  user: Address;
  agent: Address;
  admin: Address;
  token: Address;
  executor: Address;
  bond: Address;
};
const rpc = createPublicClient({
  transport: http("http://127.0.0.1:8545"),
  pollingInterval: 100,
});
const userWallet = createWalletClient({
  account: deployment.user,
  transport: http("http://127.0.0.1:8545"),
});
const adminWallet = createWalletClient({
  account: deployment.admin,
  transport: http("http://127.0.0.1:8545"),
});
const origin = "http://localhost:3000";
async function api(route: string, body?: unknown) {
  const r = await fetch(`${origin}/api/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data;
}
if ((await api("health")).mode !== "local")
  throw new Error("This demonstration only runs against explicit local mode.");
async function send(tx: UnsignedTransaction) {
  const hash = await userWallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value),
    nonce: tx.nonce,
    chain: null,
  });
  await rpc.waitForTransactionReceipt({ hash });
  return hash;
}
const balance = (who: Address) =>
  rpc.readContract({
    address: deployment.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });
for (const fail of [false, true]) {
  const agentBefore = await balance(deployment.agent),
    userBefore = await balance(deployment.user);
  const p = await api("mandates", {
    request:
      "Swap 100 USDC for ETH. Receive at least 0.01 ETH within 10 minutes. Send it to my treasury.",
    recipient: deployment.user,
  });
  let c: Commitment = await api("commitments", {
    draftId: p.draftId,
    mandateHash: p.mandateHash,
  });
  c = await api(`commitments/${c.id}/fund`, {});
  assert.equal(c.bondStatus, "LOCKED");
  assert.equal(await balance(deployment.agent), agentBefore - 100000000n);
  // The committed minimum remains unchanged; only the test fixture's actual payout changes.
  const setting = await adminWallet.writeContract({
    address: deployment.executor,
    abi: parseAbi(["function setOutputBps(uint256 value)"]),
    functionName: "setOutputBps",
    args: [fail ? 9000n : 10000n],
    chain: null,
  });
  await rpc.waitForTransactionReceipt({ hash: setting });
  for (let n = 0; n < 3; n++) {
    const a = await api(`commitments/${c.id}/approval`, {});
    if (!a.transaction) break;
    await send(a.transaction);
  }
  c = await api(`commitments/${c.id}/activate`, {});
  const hash = await send(c.transaction!);
  await api(`commitments/${c.id}/execute`, { hash });
  c = await api(`commitments/${c.id}/settle`, {});
  assert.equal(c.status, fail ? "FAILED" : "FULFILLED");
  assert.equal(
    await balance(deployment.agent),
    agentBefore - (fail ? 100000000n : 0n),
  );
  assert.equal(
    await balance(deployment.user),
    userBefore - 100000000n + (fail ? 100000000n : 0n),
  );
  const repeated = await api(`commitments/${c.id}/settle`, {});
  assert.equal(repeated.settlementHash, c.settlementHash);
  assert.equal(await balance(deployment.bond), 0n);
  console.log(
    `${c.status}: actual output ${c.evidence?.actualOutput} wei; bond ${c.bondStatus}; ${c.id}`,
  );
}
await rpc.waitForTransactionReceipt({
  hash: await adminWallet.writeContract({
    address: deployment.executor,
    abi: parseAbi(["function setOutputBps(uint256 value)"]),
    functionName: "setOutputBps",
    args: [10000n],
    chain: null,
  }),
});
console.log(
  "Both real local-chain economic loops passed. Sponsor services were not used.",
);
