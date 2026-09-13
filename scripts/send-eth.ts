import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// 1. Sanitize & setup private key
const rawKey = process.env.PRIVATE_KEY;
if (!rawKey) {
  throw new Error("PRIVATE_KEY environment variable is required.");
}
const privateKey = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
const account = privateKeyToAccount(privateKey);

// 2. Configure clients
const transport = http("https://sepolia.base.org");

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport,
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport,
});

// 3. Define transaction parameters
const RECIPIENT_ADDRESS: `0x${string}` = "0x8834927dA009baEd85D07cCBa4e9c4EEb6354489"; // Replace with recipient address
const AMOUNT_IN_ETH = "0.01"; // Amount of ETH to send

async function main() {
  console.log(`Sender Address: ${account.address}`);

  // Check initial balance
  const initialBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Sender Balance: ${formatEther(initialBalance)} ETH`);

  const amountToSend = parseEther(AMOUNT_IN_ETH);
  if (initialBalance < amountToSend) {
    throw new Error("Insufficient Base Sepolia ETH to cover amount and gas fees.");
  }

  console.log(`Sending ${AMOUNT_IN_ETH} ETH to ${RECIPIENT_ADDRESS}...`);

  // Send native ETH transaction
  const hash = await walletClient.sendTransaction({
    to: RECIPIENT_ADDRESS,
    value: amountToSend,
  });

  console.log(`Transaction sent! Hash: ${hash}`);
  console.log("Waiting for block confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`Confirmed in block ${receipt.blockNumber}! Status: ${receipt.status}`);
  console.log(`Explorer Link: https://sepolia.basescan.org/tx/${hash}`);
}

main().catch((err) => {
  console.error("Transfer failed:", err);
  process.exit(1);
});