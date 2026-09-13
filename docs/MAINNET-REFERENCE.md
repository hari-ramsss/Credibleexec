> Historical reference only. The current app rejects live mode. Follow SETUP.md for the free Base Sepolia demo. Paid integrations below are retained as documentation, not enabled configuration.

# CredibleExec: manual setup

The app has two explicit environments. Start locally to verify the economic loop without paying for services. Live mode uses Base mainnet, Privy embedded wallets, a published Bazantic Recipe, and the 1inch Classic Swap API. Local mode does not claim to exercise those services.

## 1. Install and check the project

Install Node.js **22.16 or newer in the 22 LTS line** and pnpm **12.4.1**. Node's built-in SQLite API is used; on Node 22 it prints an experimental warning. Use one persistent Node server for this MVP.

Open a terminal in the repository root:

```powershell
pnpm install
pnpm contracts:build
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm dev` opens the app at http://localhost:3000. Without configuration it displays setup requirements and disables financial actions. It does not show fabricated commitments or collateral.

## 2. First run: local chain, no API keys

In terminal 1:

```powershell
pnpm local:chain
```

Leave it running. This starts a loopback-only EVM on port 8545, deploys the real bond contract plus clearly named test token/execution contracts, and funds separate test accounts. It writes `.local/local.env` and `.local/deployment.json` and prints the treasury address.

In terminal 2:

```powershell
pnpm local:web
```

Open http://localhost:3000. Use the printed treasury address. The page is labeled **Local development chain**. The local script loads its own environment; it does not overwrite `app/.env.local`.

In terminal 3:

```powershell
pnpm local:demo
```

This performs two complete HTTP/API-to-chain flows. It checks actual USDC balances after funding and settlement. Success returns 100 test USDC to the agent. Controlled underperformance delivers 90% of the promised test ETH and transfers the agent's 100 test USDC to the user. The approved mandate is never weakened. Repeating settlement must preserve the same settlement hash.

Refresh **Commitments** in the app to see the two records and their evidence. Each chain restart creates fresh accounts, contracts, and a separate SQLite file. Stop with Ctrl+C when finished. These are disposable test accounts; do not send public-chain assets to them.

## 3. Create the live environment file

```powershell
Copy-Item app/.env.example app/.env.local
```

Keep `EXECUTION_MODE=live`. Never put a private key or secret in a `NEXT_PUBLIC_` variable. Only the Privy app ID is public.

Set `APP_ORIGIN` to your exact app origin, initially `http://localhost:3000`, later your HTTPS domain. Choose a durable `DATABASE_PATH`. Relative database paths are resolved from `app/` when Next runs; use an absolute path on a deployment server.

## 4. Get a Base RPC URL

You need a Base mainnet RPC endpoint, chain ID **8453**, that supports **`debug_traceTransaction` with `callTracer`**. Native ETH does not produce an ERC-20 Transfer event, so a receipt-only RPC is insufficient for automatic settlement.

Your existing RPC provider can supply this URL. If selecting a new provider, explicitly check its trace support and plan limits before funding anything. Set:

```dotenv
RPC_URL=https://your-base-rpc-endpoint
CONFIRMATIONS=2
```

Run `pnpm doctor` after completing the remaining settings. Two confirmations are an MVP observation threshold, not a claim of Ethereum L1 finality. More confirmations trade latency for stronger confirmation depth.

## 5. Create three separate operator accounts

Create fresh EVM accounts in a wallet tool you trust:

1. **Deployer/admin:** deploys the bond and manages the settlement authority.
2. **Agent:** supplies agent-owned USDC collateral and pays its bond-transaction gas.
3. **Settlement operator:** submits activation and verified release/slash transactions; needs ETH for gas.

Store their private keys in `DEPLOYER_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, and `SETTLEMENT_PRIVATE_KEY` respectively. Use distinct accounts. The user's key is never placed on the server: Privy manages it.

Fund the deployer, agent, and settlement accounts with a small amount of **ETH on Base** for gas. Fund the agent with **USDC on Base** for collateral. The configured default bond is 100 USDC (`AGENT_BOND_AMOUNT=100000000`, six decimal places). You can choose a smaller fixed amount before creating live commitments; the UI displays that amount.

This live environment uses actual assets. No funded account or mainnet transaction is needed to run the local demonstration.

## 6. Deploy the bond contract

First inspect the deployment parameters and estimated gas without broadcasting:

```powershell
pnpm contracts:deploy
```

When you are ready to pay deployment gas:

```powershell
pnpm contracts:deploy --broadcast
```

The script requires Base chain 8453, checks USDC decimals, deploys the bond, waits for confirmations, and writes `contracts/deployments/base.json`. Copy the printed address into `BOND_CONTRACT_ADDRESS` in `app/.env.local`.

The fixed live USDC address is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. The contract's `bondToken()` must match it and `settlementAuthority()` must match your settlement account. Remove the deployer key from the environment used by your running app after deployment; keep it securely elsewhere if you need administration.

## 7. Configure Privy

1. Open the [Privy dashboard](https://dashboard.privy.io/) and create an application.
2. Copy the application ID into `NEXT_PUBLIC_PRIVY_APP_ID`.
3. Copy its app secret into server-only `PRIVY_APP_SECRET`.
4. Enable Ethereum embedded wallets and the login methods you want to use; this UI offers email and wallet login.
5. Allow `http://localhost:3000` during development and your exact HTTPS origin when deploying.
6. Restart Next after changing the public app ID. Public environment values are compiled into the browser bundle, so rebuild when changing them in production.
7. Connect in the app. Fund the resulting **Privy embedded user wallet** with Base USDC for the swap and Base ETH for gas.

The backend verifies Privy access tokens and checks that the chosen Ethereum embedded wallet belongs to the authenticated user. The frontend uses Privy's transaction confirmation UI for the exact allowance and swap. No unrestricted server delegation is enabled.

See [Privy user wallets](https://docs.privy.io/wallets/overview/solutions/user-wallets) and [sending Ethereum transactions](https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction).

## 8. Configure 1inch

1. Open the [1inch Business developer portal](https://business.1inch.com/portal/).
2. Create a project/application and enable the **Classic Swap API v6.1**.
3. Create an API key and put it in `ONEINCH_API_KEY`.
4. Confirm your plan permits Base quotes and swap calldata requests. The server sends this key only to `api.1inch.com`.

The app requests exact `amount`, `receiver`, and `minReturn`; it does not silently relax the user's minimum or request unlimited token approvals. It decodes the generic V6 `swap` calldata and checks the router, sender, assets, recipient, amount, minimum return, and flags. An optimized route with an unsupported selector is rejected with **Try another quote**. This is an intentional current integration limit, not a reason to sign undecoded calldata.

The supplied Aqua and SwapVM repositories describe distinct liquidity/strategy primitives. This MVP implements the Classic Swap execution interface permitted by document 09; it does not claim an Aqua or SwapVM integration. See [Classic Swap v6.1 parameters](https://business.1inch.com/portal/documentation/apis/swap/classic-swap/methods/v6.1/1/swap/method/get), [Aqua](https://github.com/1inch/aqua), and [SwapVM](https://github.com/1inch/swap-vm).

## 9. Expose the app to Bazantic

Bazantic must call the workflow tools on your backend. Localhost is not reachable from its servers. Run the app on a persistent HTTPS Node host or expose your development app through an HTTPS tunnel you control. Set `APP_ORIGIN` to that public origin.

Generate a gateway secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `BAZANTIC_TOOL_SECRET`. The gateway sends it in `x-bazantic-key`. Do not put it in the Recipe prompt or inputs.

Your public OpenAPI document is at:

```text
https://YOUR-APP/api/tools/openapi
```

Only the seven constrained workflow tools are in this document. Do not register the entire user API as agent tools.

## 10. Register the Bazantic gateway

The official CLI is installed in the app workspace, pinned to a version that actually contains Recipe commands:

```powershell
pnpm --filter app exec baz --version
pnpm --filter app exec baz login
pnpm --filter app exec baz whoami
```

`login` prints a browser approval URL. Open it and approve the device. This step grants account identity, not spending authority.

In the Bazantic dashboard, create a gateway with:

| Setting | Value |
| --- | --- |
| Base/upstream URL | Your public HTTPS app origin |
| Specification | `https://YOUR-APP/api/tools/openapi` |
| Authentication | API key, custom header delivery |
| Header name | `x-bazantic-key` |
| Header value | Your `BAZANTIC_TOOL_SECRET` |

Review the methods and their prices, then deploy. CLI registration is also possible, but credentials and pricing still need the dashboard:

```powershell
pnpm --filter app exec baz gateway add --spec-url https://YOUR-APP/api/tools/openapi --endpoint https://YOUR-APP --name "CredibleExec Tools" --auth-type api-key --status draft --json
pnpm --filter app exec baz gateway list --json
```

Copy the real gateway `slug` and `endpointUrl` from the listing. **Do not construct a gateway URL yourself.** Verify its MCP catalog at `endpointUrl` plus `/mcp` lists the seven `credibleexec_*` tools. Some gateway responses use SSE (`data:` lines), so account for that when inspecting JSON.

See [deploying a gateway](https://bazantic.com/docs/deploy-a-gateway) and the [Bazantic skill](https://bazantic.com/skill).

## 11. Create and publish the Recipe

Generate the exact definition using your actual gateway slug:

```powershell
pnpm recipe:generate YOUR-GATEWAY-SLUG
```

Review `bazantic/recipe.json`. Confirm its `tool_bindings` names match your gateway's live catalog. It contains three phases:

1. Compile: read context → extract intent → deterministic validation → user review.
2. Fund: readiness → real agent collateral deposit → bounded execution preparation.
3. Settle: confirmed evidence → deterministic verification → contract settlement.

Privy signing is deliberately between phases two and three. Recipe text cannot bypass the persisted user approval or supply a settlement verdict.

Create the draft:

```powershell
pnpm --filter app exec baz recipe create ../bazantic/recipe.json --json
```

Bazantic derives the handle from the name. Open the draft in its dashboard, review it, and test with a job created by this app if needed. The illustrative job ID in the definition is not a runnable record. Publish after reviewing tools and prices:

```powershell
pnpm --filter app exec baz recipe publish YOUR-RECIPE-HANDLE --json
```

Set `BAZANTIC_RECIPE_HANDLE` to the returned handle. See [Recipes](https://bazantic.com/docs/recipes).

## 12. Give the server a capped Bazantic payment grant

Run as the same OS account that will run Next:

```powershell
pnpm --filter app exec baz grant create --name credibleexec --cap 5
```

Open the approval URL, compare the device fingerprint, and approve only the intended spending cap. Fund your Bazantic balance using its dashboard. Use the network matching the payment challenge; live grants commonly settle on Base. Your own gateway's sandbox setting does not automatically make published Recipe calls free.

In that OS user's `~/.bazantic/config.json`, merge the following into the existing `gateway` object, preserving the other configuration:

```json
{
  "gateway": {
    "account": "credibleexec",
    "maxAmountUsd": "0.10",
    "network": "base"
  }
}
```

Set the per-call ceiling to the actual price you reviewed. A live call can charge USDC even when an upstream call fails. Check your grant:

```powershell
pnpm --filter app exec baz grant list --json
```

The app starts the official `baz recipe mcp` adapter. It discovers the live paid gateway and performs its payment protocol. The backend does not hand-build x402 payment headers. The adapter child process receives only OS necessities and its own Bazantic payment configuration, not your agent/settlement keys or Privy secret.

## 13. Validate and run a small live commitment

```powershell
pnpm doctor
pnpm dev
```

1. Sign in with Privy.
2. Enter an affordable swap amount, explicit minimum output, exact treasury, and enough time for wallet confirmations and chain inclusion. Five or ten minutes is easier for the first run than sixty seconds.
3. Review the displayed absolute deadline and all amounts. If it is too close, go back and create a new preview; the app never extends an approved deadline.
4. Approve the commitment. Wait for the agent's bond deposit to confirm.
5. Click **Authorize swap**. Privy may first ask to reset a prior allowance, then approve the exact USDC amount. Wait for confirmation and click again when prompted.
6. Authorize the prepared swap. The app records its hash and independently collects confirmed evidence.
7. Inspect the settlement result and explorer links. If the RPC lacks traces or confirmations are pending, click **Check evidence & settle** later. A missing dependency is not a successful swap.

Do not induce financial underperformance with public funds merely to test the failure screen. The controlled failure proof belongs to `pnpm local:demo`.

## 14. Hosting and operation

Use a persistent Node server/container with a writable disk, HTTPS, and the Bazantic CLI configuration mounted for that server user. This SQLite/CLI design is **not suitable for ephemeral serverless deployment** or multiple hosts sharing an ordinary local file.

```powershell
pnpm build
pnpm --filter app start
```

Configure the host's request timeout to at least 180 seconds. Back up the SQLite database using an SQLite-aware backup method, including the WAL state. Keep it private: the operation journal contains signed transaction bytes. Never delete it to resolve a pending transaction; the journal prevents accidental duplicate broadcasts.

Users can resume saved commitments from history. Automatic unattended recovery when no user is present is not implemented; an operator should review pending records. The gateway needs public HTTPS inbound access, and the app needs outbound access to Privy, Bazantic, 1inch, and its RPC.

## 15. Recover an external failure

Before activation, **Cancel commitment** returns deposited collateral to the agent. After activation, the bond stays locked until conclusive settlement or a trusted operator's reviewed external-failure resolution.

For a revert, outage, dropped transaction, or unavailable trace, do not slash automatically. Determine whether the prepared user transaction was mined, replaced, or remains pending. Resolve its nonce and revoke obsolete allowance where appropriate before returning collateral. Otherwise a previously signed swap could still execute after the bond was returned.

The contract exposes settlement-authority-only `resolveExternalFailure(commitmentId, evidenceHash)` after the deadline. The evidence hash must refer to a saved incident record. This is deliberately not an LLM tool or public user endpoint. Use a contract administration tool with the authorized account only after reviewing the chain evidence. Reconcile the application record with the confirmed contract state; see `docs/ARCHITECTURE.md` for the centralized-verifier trust boundary.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Setup required | Fill the named environment variables and restart/rebuild as appropriate. |
| Wrong chain | RPC must return 8453 for live mode. Local mode must use 31337 and loopback. |
| Insufficient collateral | Fund the agent account, not the user account. |
| Minimum unavailable | Change your request only if you choose; generate and approve a new mandate. |
| Unsupported route | Only independently decoded generic V6 swap routes are accepted. Re-quote; never bypass the decoder. |
| Confirmation pending | Retry the saved step. It reconciles the same signed transaction. |
| Evidence inconclusive | Check trace API support, block confirmations, and transaction status. Bond stays held. |
| Recipe missing | Verify handle, publication status, CLI version, and live tool catalog. |
| Gateway 401 | Match `x-bazantic-key` to the server's gateway secret. |
| Gateway 404 | Verify `endpointUrl`, deployed OpenAPI routes, and the gateway's actual catalog. |
| Bazantic payment failure | Check grant name, balance, cap, price ceiling, network, and server OS user. |
| SQLite warning | Node 22 marks built-in SQLite experimental; it is not a failed database write. |
| Ganache native module warning | Windows/Node 22 uses its JavaScript fallback; tests still execute EVM bytecode. |

Live service calls and deployment require your accounts and funds. Builds and local tests cannot establish that your eventual live credentials, gateway, liquidity, and RPC trace plan work together; validate that in step 13.
