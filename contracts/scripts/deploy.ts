import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  encodeDeployData,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { compile, root } from "./compile";
const rpcUrl = process.env.RPC_URL,
  key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!rpcUrl || !key)
  throw new Error("Set RPC_URL and DEPLOYER_PRIVATE_KEY in app/.env.local.");
const authority = privateKeyToAccount(
  process.env.SETTLEMENT_PRIVATE_KEY as Hex,
).address;
const deployer = privateKeyToAccount(key);
const token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const rpc = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
if ((await rpc.getChainId()) !== 84532)
  throw new Error("Deployment requires Base Sepolia chain 84532.");
if (
  (await rpc.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  })) !== 6
)
  throw new Error("Unexpected USDC decimals.");
const artifacts = compile();
const artifact = artifacts.CredibleExecBond;
const wallet = createWalletClient({
  chain: baseSepolia,
  account: deployer,
  transport: http(rpcUrl),
});
const params = { ...artifact, args: [token, authority, deployer.address] };
const gas = await rpc.estimateGas({
  data: encodeDeployData(params),
  account: deployer,
});
console.log(
  JSON.stringify(
    {
      chain: 84532,
      token,
      authority,
      owner: deployer.address,
      estimatedGas: gas.toString(),
    },
    null,
    2,
  ),
);
if (!process.argv.includes("--broadcast")) {
  console.log("Dry run only. Re-run with --broadcast to spend gas and deploy.");
  process.exit(0);
}
const hash = await wallet.deployContract(params);
console.log(`Deployment submitted: ${hash}`);
const receipt = await rpc.waitForTransactionReceipt({ hash, confirmations: 2 });
if (receipt.status !== "success" || !receipt.contractAddress)
  throw new Error("Deployment failed.");
const output = {
  chainId: 84532,
  contract: receipt.contractAddress,
  token,
  authority,
  owner: deployer.address,
  transactionHash: hash,
};
fs.mkdirSync(path.join(root, "contracts/deployments"), { recursive: true });
fs.writeFileSync(
  path.join(root, "contracts/deployments/base-sepolia.json"),
  JSON.stringify(output, null, 2),
);
console.log(`BOND_CONTRACT_ADDRESS=${receipt.contractAddress}`);

const executionHash = await wallet.deployContract({
  ...artifacts.TestExecution,
  args: [token],
});
console.log("Test executor deployment submitted:", executionHash);
const executionReceipt = await rpc.waitForTransactionReceipt({
  hash: executionHash,
  confirmations: 2,
});
if (executionReceipt.status !== "success" || !executionReceipt.contractAddress)
  throw new Error(
    "Test executor deployment failed; preserve the bond address printed above.",
  );
fs.writeFileSync(
  path.join(root, "contracts/deployments/base-sepolia.json"),
  JSON.stringify(
    {
      ...output,
      executionContract: executionReceipt.contractAddress,
      executionTransactionHash: executionHash,
    },
    null,
    2,
  ),
);
console.log("TEST_EXECUTION_ADDRESS=" + executionReceipt.contractAddress);
console.log(
  "Send a small amount of faucet ETH (for example 0.001) to the test executor to fund demo outputs.",
);
