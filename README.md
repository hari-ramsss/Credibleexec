# CredibleExec

A bonded execution demo: the user reviews a precise mandate, an agent deposits its own collateral, the user signs through Privy, and confirmed evidence releases or slashes the bond.

The default public network is **Base Sepolia (84532)**. No real-money deployment, 1inch API subscription, paid Bazantic Recipe, or paid trace RPC is needed. A clearly labeled test execution contract and deterministic parser replace those paid/unsupported services. Privy remains enabled for public testnet wallet authorization. Mainnet mode is disabled.

## Start here

Follow [the free testnet setup guide](docs/SETUP.md) for faucet ETH/USDC, wallet setup, contract deployment, and Privy keys.

For a completely offline-services demonstration, use separate terminals:

```sh
pnpm local:chain
pnpm local:web
pnpm local:demo
```

Validation: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Configuration check: `pnpm doctor`.

The test executor is not a market or 1inch swap. It transfers test USDC in and dispenses pre-funded faucet ETH. Its events are trusted test evidence, and its faucet balance can be consumed by other users. Use tiny outputs and top up as needed. The bond remains a real ERC-20 contract with a trusted settlement authority.

The original integration adapters remain in source for reference but are not used by the free demo. See [historical paid integration setup](docs/MAINNET-REFERENCE.md). Existing Tailwind support and custom CSS are preserved.
