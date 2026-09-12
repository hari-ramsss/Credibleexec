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
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compile } from "../contracts/scripts/compile";
test("a malicious authorized token cannot reenter settlement for another active bond", async () => {
  const provider = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: "shanghai" },
  });
  try {
    const accounts = Object.values(provider.getInitialAccounts()).map((a) =>
      privateKeyToAccount(a.secretKey as Hex),
    );
    const [admin, agent, user] = accounts;
    const rpc = createPublicClient({
      transport: custom(provider),
      pollingInterval: 50,
    });
    const wallets = accounts.map((account) =>
      createWalletClient({ account, transport: custom(provider) }),
    );
    const artifacts = compile();
    async function deploy(name: string, args: unknown[] = []) {
      const hash = await wallets[0].deployContract({
        ...artifacts[name],
        args,
        chain: null,
      });
      return (await rpc.waitForTransactionReceipt({ hash })).contractAddress!;
    }
    const token = await deploy("ReentrantToken");
    const bond = await deploy("CredibleExecBond", [
      token,
      admin.address,
      admin.address,
    ]);
    async function write(
      index: number,
      address: Address,
      name: string,
      args: unknown[] = [],
    ) {
      const hash = await wallets[index].writeContract({
        address,
        abi:
          address === bond
            ? artifacts.CredibleExecBond.abi
            : artifacts.ReentrantToken.abi,
        functionName: name,
        args,
        chain: null,
      });
      assert.equal(
        (await rpc.waitForTransactionReceipt({ hash })).status,
        "success",
      );
    }
    const ids = [keccak256(toHex(1)), keccak256(toHex(2))];
    const now = Number((await rpc.getBlock()).timestamp);
    await write(0, token, "mint", [agent.address, 200n]);
    await write(1, token, "approve", [bond, 200n]);
    for (const id of ids) {
      await write(1, bond, "createCommitment", [
        id,
        {
          agent: agent.address,
          user: user.address,
          principalToken: token,
          targetToken: user.address,
          principalAmount: 1000n,
          maxSpend: 1000n,
          minOutput: 1n,
          recipient: user.address,
          deadline: BigInt(now + 600),
          bondAmount: 100n,
          mandateHash: ids[0],
        },
      ]);
      await write(1, bond, "depositBond", [id]);
      await write(0, bond, "activateCommitment", [id]);
    }
    await write(0, bond, "setSettlementAuthority", [token]);
    await write(0, token, "trigger", [bond, ...ids]);
    assert.equal(
      await rpc.readContract({
        address: token,
        abi: artifacts.ReentrantToken.abi,
        functionName: "attempted",
      }),
      true,
    );
    assert.equal(
      await rpc.readContract({
        address: token,
        abi: artifacts.ReentrantToken.abi,
        functionName: "reentered",
      }),
      false,
    );
    assert.equal(
      await rpc.readContract({
        address: bond,
        abi: artifacts.CredibleExecBond.abi,
        functionName: "totalLocked",
      }),
      100n,
    );
    assert.equal(
      await rpc.readContract({
        address: token,
        abi: artifacts.ReentrantToken.abi,
        functionName: "balanceOf",
        args: [bond],
      }),
      100n,
    );
  } finally {
    await provider.disconnect();
  }
});
