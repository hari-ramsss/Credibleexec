# CredibleExec

CredibleExec makes autonomous financial execution economically accountable. An
agent accepts a user-approved mandate, locks its own bond, executes through an
authorized wallet, and receives or loses that bond according to deterministic
onchain evidence.

## MVP

The first supported workflow is one USDC-to-ETH swap with four hard conditions:

- maximum USDC spend;
- minimum ETH received;
- exact recipient;
- execution deadline.

The user's principal and the agent's collateral are always separate. Privy will
authorize execution, 1inch will supply the execution route, and CredibleExec
will determine whether the approved promise was fulfilled.

## Run the implementation

```sh
pnpm install
pnpm contracts:build
pnpm dev
```

Open http://localhost:3000. Live actions stay disabled until the required services are configured.

For a complete local blockchain demonstration with no API keys, run these in separate terminals:

```sh
pnpm local:chain
pnpm local:web
pnpm local:demo
```

The demo proves actual test-token collateral release and slashing through the app's HTTP endpoints. It explicitly uses a local parser and execution fixture, not the live sponsor services.

**[Follow the complete manual setup guide](docs/SETUP.md)** for RPC access, Privy, 1inch, operator wallets, contract deployment, Bazantic gateway/Recipe publication, and hosting.

**[Architecture, trust assumptions, and implementation limits](docs/ARCHITECTURE.md)** explain the shared packages, immutable hashes, durable transaction journal, and centralized settlement authority.

Validation commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Live configuration check: `pnpm doctor`.

See [recorded validation results](docs/VALIDATION.md) for what passed locally and what needs live credentials.

The live adapter targets Base and native USDC → ETH through 1inch Classic Swap v6.1. Aqua/SwapVM are not implemented. Unknown optimized router selectors are rejected. The included Solidity contracts have automated local tests; they have not undergone an independent security audit. Live end-to-end validation requires your configured accounts, published Bazantic Recipe, RPC trace capability, and funded wallets.
