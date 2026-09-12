import fs from "node:fs";
import path from "node:path";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compile, root } from "../contracts/scripts/compile";

const server = ganache.server({
  logging: { quiet: true },
  wallet: { totalAccounts: 5, defaultBalance: 1000 },
  chain: { chainId: 31337, hardfork: "shanghai" },
  server: { ws: false },
});
await server.listen(8545, "127.0.0.1");
const accounts = Object.values(server.provider.getInitialAccounts());
const [admin, agent, user] = accounts.map((a) =>
  privateKeyToAccount(a.secretKey as Hex),
);
const rpc = createPublicClient({
  transport: http("http://127.0.0.1:8545"),
  pollingInterval: 50,
});
const wallet = createWalletClient({
  account: admin,
  transport: http("http://127.0.0.1:8545"),
});
const artifacts = compile();
async function deploy(name: string, args: unknown[] = []) {
  const hash = await wallet.deployContract({
    ...artifacts[name],
    args,
    chain: null,
  });
  return (await rpc.waitForTransactionReceipt({ hash })).contractAddress!;
}
const token = await deploy("TestToken");
const bond = await deploy("CredibleExecBond", [
  token,
  admin.address,
  admin.address,
]);
const executor = await deploy("TestExecution", [token]);
for (const address of [agent.address, user.address]) {
  const hash = await wallet.writeContract({
    address: token,
    abi: artifacts.TestToken.abi,
    functionName: "mint",
    args: [address, 10000000000n],
    chain: null,
  });
  await rpc.waitForTransactionReceipt({ hash });
}
await rpc.waitForTransactionReceipt({
  hash: await wallet.sendTransaction({
    to: executor as Address,
    value: parseEther("100"),
    chain: null,
  }),
});
const dir = path.join(root, ".local");
fs.mkdirSync(dir, { recursive: true });
const runId = Date.now();
const env = `# LOCAL TEST ACCOUNTS. Never fund these addresses on a public chain.\nEXECUTION_MODE=local\nRPC_URL=http://127.0.0.1:8545\nBOND_CONTRACT_ADDRESS=${bond}\nUSDC_ADDRESS=${token}\nLOCAL_EXECUTION_ADDRESS=${executor}\nLOCAL_USER_ADDRESS=${user.address}\nAGENT_PRIVATE_KEY=${accounts[1].secretKey}\nSETTLEMENT_PRIVATE_KEY=${accounts[0].secretKey}\nAGENT_BOND_AMOUNT=100000000\nDATABASE_PATH=${path.join(dir, `demo-${runId}.sqlite`).replaceAll("\\", "/")}\nAPP_ORIGIN=http://localhost:3000\n`;
fs.writeFileSync(path.join(dir, "local.env"), env, { mode: 0o600 });
fs.writeFileSync(
  path.join(dir, "deployment.json"),
  JSON.stringify(
    {
      chainId: 31337,
      token,
      bond,
      executor,
      user: user.address,
      agent: agent.address,
      admin: admin.address,
    },
    null,
    2,
  ),
);
console.log("Local EVM running at http://127.0.0.1:8545");
console.log("Fresh test deployment and local environment written to .local/.");
console.log("In another terminal: pnpm local:web");
console.log("Run the success/failure proof: pnpm local:demo");
console.log(`Treasury address for the UI: ${user.address}`);
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
