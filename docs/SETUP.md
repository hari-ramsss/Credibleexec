# Free Base Sepolia setup

This version uses only test assets. Do not buy or bridge mainnet funds. Testnet tokens have no cash value.

## 1. Install

Use Node 22.16+ (Node 22 LTS) and pnpm 12.4.1. In the repository root run:

```powershell
pnpm install
pnpm contracts:build
```

## 2. Configure the testnet

Copy `app/.env.example` to `app/.env.local`. If you already have an environment file, update it manually and retain your private keys privately; do not overwrite them accidentally.

Set:

```dotenv
EXECUTION_MODE=testnet
RPC_URL=https://sepolia.base.org
DATABASE_PATH=.local/base-sepolia.sqlite
AGENT_BOND_AMOUNT=1000000
APP_ORIGIN=http://localhost:3000
CONFIRMATIONS=2
```

Use a new database for this chain. Old commitments cannot migrate across networks. A leftover `EXECUTION_MODE=live` is rejected. The public RPC is free and rate limited; a free Base Sepolia RPC from your provider is also fine. No debug trace capability is needed in this demo.

Network: Base Sepolia; chain ID: **84532**; native token: test ETH; explorer: https://sepolia.basescan.org.

## 3. Create three operator accounts

In your wallet application, create separate deployer/admin, agent, and settlement accounts. Export their private keys into these server-only environment fields:

- `DEPLOYER_PRIVATE_KEY`: deploys the two testnet contracts.
- `AGENT_PRIVATE_KEY`: deposits the agent's test USDC collateral.
- `SETTLEMENT_PRIVATE_KEY`: activates and settles the bond.

Keep keys out of source control and never put them in NEXT_PUBLIC variables. The user's signing key is managed by Privy and is not one of these server keys.

## 4. Get free test ETH and USDC

1. Open [Base's official faucet guide](https://docs.base.org/get-started/get-funds), follow its Base faucet link, and choose **Base Sepolia**. Request test ETH for the deployer, agent, and settlement addresses. Another faucet is [Chainlink Base Sepolia](https://faucets.chain.link/base-sepolia). Faucets can require login and have cooldowns; if one requires a mainnet balance, use another free option or the local demo in step 10. Do not buy test tokens.
2. Open [Circle's faucet](https://faucet.circle.com/), choose **USDC**, then **Base Sepolia**, and request tokens for your agent address. Circle currently offers 20 test USDC per request with rate limits.
3. Later request USDC and test ETH for your Privy embedded user wallet as well.

Agent collateral defaults to **1 test USDC**, so one faucet request is enough for several trials. Agent and settlement accounts also need test ETH for transaction gas.

The fixed [Circle Base Sepolia USDC address](https://developers.circle.com/stablecoins/usdc-contract-addresses) is `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, with six decimals. Do not use the mainnet USDC address.

## 5. Deploy using faucet ETH

Preview the bond deployment parameters and gas estimate:

```powershell
pnpm contracts:deploy
```

Then deploy the bond and test execution contract:

```powershell
pnpm contracts:deploy --broadcast
```

The script refuses any RPC chain except 84532. Both transactions use test ETH only. Copy its two printed addresses into `BOND_CONTRACT_ADDRESS` and `TEST_EXECUTION_ADDRESS`. Deployment details are saved in `contracts/deployments/base-sepolia.json`. If a transaction times out, check its printed hash on the testnet explorer before retrying; rerunning the deployment creates new contracts.

Send a small amount of faucet ETH, for example **0.001 test ETH**, to TEST_EXECUTION_ADDRESS using your wallet on Base Sepolia. This funds the demo outputs. Never send ETH to the bond contract. The executor accepts USDC and returns the requested amount of test ETH; it is a fixture, not a price-based market. Its public test funds can be consumed by others, so top up when needed.

Remove DEPLOYER_PRIVATE_KEY from the running app environment after deployment and retain it securely for contract administration.

## 6. Keep Privy and use its free developer tier

[Privy offers a free developer tier](https://www.privy.io/pricing); stay within its published limits. No gas sponsorship or paid service is needed for this small demo because wallets use faucet ETH.

1. Create an app at [Privy's dashboard](https://dashboard.privy.io/).
2. Set NEXT_PUBLIC_PRIVY_APP_ID to its app ID and PRIVY_APP_SECRET to its secret.
3. Enable Ethereum embedded wallets and email/wallet login. Allow http://localhost:3000 as your app origin.
4. The app selects Base Sepolia automatically. Restart/rebuild after changing the public app ID.

Do not configure 1inch API keys or a Bazantic payment grant. [1inch's supported chains](https://business.1inch.com/portal/documentation/apis/swap) do not include Base Sepolia. Paid Bazantic calls are bypassed, and there is no claim that test USDC can pay for those live calls. Their source adapters remain for reference.

## 7. Run and fund the user wallet

```powershell
pnpm doctor
pnpm dev
```

Open http://localhost:3000 and sign in. Copy the full **embedded wallet** address from your Privy wallet interface. Request test ETH and Circle test USDC for that address (not just your connected external wallet). These are the user's principal and gas, separate from the agent's collateral.

The page must say **Base Sepolia** and explain that it uses a demo parser/test contract with no paid Bazantic or 1inch calls.

## 8. Try a small commitment

Use **Try an example**, enter your treasury address, and start with:

> Swap 1 USDC for ETH and send it to my treasury. Receive at least 0.00001 ETH within 10 minutes.

Review the mandate and 1 USDC agent bond, approve it, and wait for collateral funding. Authorize the exact token allowance and then the test transaction through Privy. If asked to approve/reset allowance, wait for confirmation and click again. Use **Check evidence & settle** if confirmations are pending.

Success returns the bond to the agent. Use the existing local failure demo below to demonstrate slashing without manual contract administration. The testnet receipt events are trusted fixture evidence, not production native-ETH trace verification.

## 9. Production-style hosting (optional)

For a public testnet demo, use one persistent Node server with writable SQLite storage and HTTPS. No external hosting is needed while running locally. Do not use ephemeral serverless storage.

```powershell
pnpm build
pnpm --filter app start
```

Keep EXECUTION_MODE=testnet, update APP_ORIGIN and Privy's allowed origins, and back up the database. Local auth bypass remains disabled in production; testnet always requires Privy.

## 10. No faucets or external accounts available

Run these in three separate terminals:

```powershell
pnpm local:chain
pnpm local:web
pnpm local:demo
```

This creates disposable funded local accounts and proves both release and slash flows without Privy, RPC providers, faucets, 1inch, or Bazantic. Local mode is explicitly labeled and runs only on loopback in development. Stop each terminal with Ctrl+C.

## Styling

Tailwind is already installed and imported. The existing custom workspace CSS is preserved; the optional full conversion was deferred to keep this change focused on the free testnet workflow.
