# Implementation validation

Verified locally on Windows with Node 22.16 and the committed pnpm workspace dependencies.

## Passed checks

- Eleven automated tests: real-EVM bond lifecycle and economic balances, authorization, cancellation, duplicate settlement, malicious-token reentrancy, exact mandate compilation, calldata binding, deterministic verification, and inconclusive-evidence handling.
- Two complete HTTP-to-EVM scenarios using `pnpm local:demo`: success releases agent collateral; controlled underperformance transfers agent collateral to the user. Repeated settlement preserves the same transaction hash and balances. Both scenarios were repeated after the settlement recovery changes.
- TypeScript checks for the workspace and Next app, and the app ESLint checks.
- Next production compilation, static generation, and dynamic API route generation.
- Chrome desktop (1440 px) and mobile (390 px) checks: loaded local-mode configuration, example input, navigation, page rendering, no JavaScript page errors, and no horizontal overflow. Screenshots are generated under the ignored `.local/` directory by `pnpm test:browser` with `pnpm local:web` running.

## What still needs live configuration

No mainnet contract was deployed and no real funds were moved. Privy login/signing, authenticated 1inch routes, paid Bazantic Recipe calls, and a provider's Base `callTracer` support require the credentials and account setup described in [SETUP.md](SETUP.md). The local execution fixture is explicitly a test contract; it is not 1inch. The local deterministic parser does not substitute for the live Bazantic Recipe.

The live adapter accepts only independently decoded generic 1inch V6 `swap` calldata. Other optimized route selectors are rejected. Aqua and SwapVM strategies are outside this MVP's Classic Swap implementation. The bond uses a trusted settlement authority; this is not permissionless onchain verification or an audited production financial protocol. Use a single persistent Node server with durable SQLite storage; see [ARCHITECTURE.md](ARCHITECTURE.md) for operational limits and recovery.

## Dependency notices observed

Privy emits an optional Farcaster/Solana module warning and its dependency tree emits Tempo dynamic-import warnings during webpack compilation. These did not fail the build or the tested EVM-only UI. Ganache uses its JavaScript fallback because its optional native uWS binary does not match this Node version. Node 22 labels its built-in SQLite API experimental.
