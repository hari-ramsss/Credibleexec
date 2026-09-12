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
import { base } from "viem/chains";
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
const token = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const rpc = createPublicClient({ chain: base, transport: http(rpcUrl) });
if ((await rpc.getChainId()) !== 8453)
  throw new Error("Live deployment requires Base chain 8453.");
if (
  (await rpc.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  })) !== 6
)
  throw new Error("Unexpected USDC decimals.");
const artifact = compile().CredibleExecBond;
const wallet = createWalletClient({
  chain: base,
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
      chain: 8453,
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
  chainId: 8453,
  contract: receipt.contractAddress,
  token,
  authority,
  owner: deployer.address,
  transactionHash: hash,
};
fs.mkdirSync(path.join(root, "contracts/deployments"), { recursive: true });
fs.writeFileSync(
  path.join(root, "contracts/deployments/base.json"),
  JSON.stringify(output, null, 2),
);
console.log(`BOND_CONTRACT_ADDRESS=${receipt.contractAddress}`);
