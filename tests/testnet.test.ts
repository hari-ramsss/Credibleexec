import { test } from "node:test";
import assert from "node:assert/strict";
import { config, readinessConfig } from "../app/lib/server/config";
import {
  compileIntent,
  parseLocalIntent,
} from "../packages/mandate/src/compiler";
import { LocalExecutionProvider } from "../app/lib/server/execution";
import { authenticate } from "../app/lib/server/auth";

test("free testnet binds mandates and transactions to Sepolia without paid configuration or auth bypass", async () => {
  const original = { ...process.env };
  try {
    delete process.env.EXECUTION_MODE;
    process.env.RPC_URL = "https://sepolia.base.org";
    process.env.AGENT_PRIVATE_KEY = `0x${"1".repeat(64)}`;
    process.env.SETTLEMENT_PRIVATE_KEY = `0x${"2".repeat(64)}`;
    process.env.BOND_CONTRACT_ADDRESS = `0x${"3".repeat(40)}`;
    process.env.TEST_EXECUTION_ADDRESS = `0x${"4".repeat(40)}`;
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "test";
    process.env.PRIVY_APP_SECRET = "test";
    delete process.env.AGENT_BOND_AMOUNT;
    delete process.env.ONEINCH_API_KEY;
    delete process.env.BAZANTIC_RECIPE_HANDLE;
    delete process.env.BAZANTIC_TOOL_SECRET;
    const c = config();
    assert.equal(c.chain.id, 84532);
    assert.equal(c.local, false);
    assert.equal(c.bondAmount, "1000000");
    assert.equal(readinessConfig().configured, true);
    await assert.rejects(
      authenticate(new Request("http://localhost:3000/api/commitments")),
      /Sign in/,
    );
    const result = compileIntent(
      parseLocalIntent(
        "Swap 1 USDC for ETH and send it to my treasury. Receive at least 0.00001 ETH within 10 minutes.",
      ),
      {
        chainId: c.chain.id,
        usdc: c.usdc,
        userWallet: c.settler.address,
        defaultRecipient: c.settler.address,
        now: 1000,
      },
    );
    assert.equal(result.status, "SUCCESS");
    if (result.status !== "SUCCESS") throw new Error("compile failed");
    assert.equal(result.mandate.executionVenue, "test-fixture");
    const tx = await new LocalExecutionProvider().build(result.mandate);
    assert.equal(tx.chainId, 84532);
    assert.equal(tx.to, c.router);
    process.env.EXECUTION_MODE = "live";
    assert.throws(config);
    assert.equal(readinessConfig().configured, false);
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
