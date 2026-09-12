import { test } from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  keccak256,
  toHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compile } from "../contracts/scripts/compile";

test("bond economic lifecycle and access control on a real local EVM", async () => {
  const provider = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: "shanghai" },
  });
  try {
    const accounts = Object.values(provider.getInitialAccounts()).map((a) =>
      privateKeyToAccount(a.secretKey as `0x${string}`),
    );
    const [admin, agent, user, attacker] = accounts;
    const rpc = createPublicClient({
      transport: custom(provider),
      pollingInterval: 50,
    });
    const wallets = accounts.map((account) =>
      createWalletClient({ account, transport: custom(provider) }),
    );
    const artifacts = compile();
    const deploy = async (name: string, args: unknown[] = []) => {
      const hash = await wallets[0].deployContract({
        ...artifacts[name],
        args,
        chain: null,
      });
      return (await rpc.waitForTransactionReceipt({ hash })).contractAddress!;
    };
    const token = await deploy("TestToken");
    const bond = await deploy("CredibleExecBond", [
      token,
      admin.address,
      admin.address,
    ]);
    const write = async (
      index: number,
      address: Address,
      name: string,
      args: unknown[] = [],
    ) => {
      const hash = await wallets[index].writeContract({
        address,
        abi:
          address === bond
            ? artifacts.CredibleExecBond.abi
            : artifacts.TestToken.abi,
        functionName: name,
        args,
        chain: null,
      });
      const receipt = await rpc.waitForTransactionReceipt({ hash });
      assert.equal(receipt.status, "success");
      return receipt;
    };
    const balance = (address: Address) =>
      rpc.readContract({
        address: token,
        abi: artifacts.TestToken.abi,
        functionName: "balanceOf",
        args: [address],
      });
    const get = async (id: `0x${string}`) =>
      (await rpc.readContract({
        address: bond,
        abi: artifacts.CredibleExecBond.abi,
        functionName: "getCommitment",
        args: [id],
      })) as { status: number; commitmentHash: string };
    const id = (n: number) => keccak256(toHex(n));
    const now = Number((await rpc.getBlock()).timestamp);
    const terms = {
      agent: agent.address,
      user: user.address,
      principalToken: token,
      targetToken: attacker.address,
      principalAmount: 1000n,
      maxSpend: 1000n,
      minOutput: 48n,
      recipient: user.address,
      deadline: BigInt(now + 600),
      bondAmount: 100n,
      mandateHash: id(99),
    };
    const evidence = id(100);
    await write(0, token, "mint", [agent.address, 1000n]);
    await write(1, token, "approve", [bond, 1000n]);
    await assert.rejects(
      write(1, bond, "createCommitment", [id(0), { ...terms, bondAmount: 0n }]),
    );
    await assert.rejects(
      write(1, bond, "createCommitment", [
        id(0),
        { ...terms, user: agent.address },
      ]),
    );
    await assert.rejects(
      write(1, bond, "createCommitment", [id(0), { ...terms, deadline: 1n }]),
    );
    await assert.rejects(write(3, bond, "createCommitment", [id(1), terms]));
    await write(1, bond, "createCommitment", [id(1), terms]);
    await assert.rejects(write(1, bond, "createCommitment", [id(1), terms]));
    await assert.rejects(write(0, bond, "activateCommitment", [id(1)]));
    await assert.rejects(write(3, bond, "depositBond", [id(1)]));
    await assert.rejects(write(1, bond, "depositBond", [id(404)]));
    await write(1, bond, "depositBond", [id(1)]);
    assert.equal(await balance(bond), 100n);
    assert.equal(await balance(agent.address), 900n);
    await assert.rejects(write(1, bond, "depositBond", [id(1)]));
    await assert.rejects(write(3, bond, "activateCommitment", [id(1)]));
    await write(0, bond, "activateCommitment", [id(1)]);
    const commitmentHash = (await get(id(1))).commitmentHash;
    await assert.rejects(write(1, bond, "cancelCommitment", [id(1)]));
    await assert.rejects(write(3, bond, "settleFailure", [id(1), evidence]));
    await write(0, bond, "settleSuccess", [id(1), evidence]);
    assert.equal((await get(id(1))).status, 3);
    assert.equal((await get(id(1))).commitmentHash, commitmentHash);
    assert.equal(await balance(agent.address), 1000n);
    assert.equal(await balance(bond), 0n);
    await assert.rejects(write(0, bond, "settleSuccess", [id(1), evidence]));
    await assert.rejects(write(0, bond, "settleFailure", [id(1), evidence]));
    await write(1, bond, "createCommitment", [id(2), terms]);
    await write(1, bond, "depositBond", [id(2)]);
    await write(0, bond, "activateCommitment", [id(2)]);
    await write(0, bond, "settleFailure", [id(2), evidence]);
    assert.equal(await balance(user.address), 100n);
    assert.equal(await balance(agent.address), 900n);
    assert.equal(await balance(bond), 0n);
    assert.equal((await get(id(2))).status, 4);
    await assert.rejects(write(0, bond, "settleSuccess", [id(2), evidence]));
    await write(1, bond, "createCommitment", [id(3), terms]);
    await write(1, bond, "depositBond", [id(3)]);
    await write(2, bond, "cancelCommitment", [id(3)]);
    assert.equal(await balance(agent.address), 900n);
    assert.equal((await get(id(3))).status, 6);
    await write(1, bond, "createCommitment", [id(4), terms]);
    await write(1, bond, "depositBond", [id(4)]);
    await provider.request({ method: "evm_increaseTime", params: [700] });
    await provider.request({ method: "evm_mine", params: [] });
    await assert.rejects(write(0, bond, "activateCommitment", [id(4)]));
    await write(1, bond, "cancelCommitment", [id(4)]);
    assert.equal(await balance(bond), 0n);
  } finally {
    await provider.disconnect();
  }
});
