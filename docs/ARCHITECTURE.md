# Implementation decisions and trust boundaries

The nine supplied specifications define the product. Their staged authoring directions such as “do not build the frontend yet” are not additional user requests; the user's explicit request to implement the whole project takes precedence. The original documents remain unchanged.

## Modules

| Location | Responsibility |
| --- | --- |
| `app/components` | Review, Privy confirmation, progress, evidence, history |
| `app/lib/server/api.ts` | Authenticated user API and bounded gateway tools |
| `app/lib/server/workflow.ts` | Explicit lifecycle and persisted workflow stages |
| `app/lib/server/chain.ts` | Onchain binding and durable signed-operation journal |
| `app/lib/server/store.ts` | SQLite records, locks, uniqueness, rate limits |
| `app/lib/server/bazantic.ts` | Official paid Recipe MCP adapter; local baseline isolated |
| `app/lib/server/execution.ts` | 1inch quotes and decoded transaction construction |
| `app/lib/server/evidence.ts` | RPC receipts, USDC transfers, native ETH traces |
| `packages/domain` | Shared schemas, hashes, states, wire types, generated bond ABI |
| `packages/mandate` | Intent validation, exact amounts, addresses, deadline, preview |
| `packages/verifier` | Pure deterministic PASS / FAIL / INCONCLUSIVE |
| `contracts/src/CredibleExecBond.sol` | Agent-only deposit, immutable terms, authorized settlement |

## Resolved specification conflicts

- **Confirmation timing:** the user reviews and approves before a commitment or bond is created. This follows the compiler's explicit approval boundary rather than the Recipe document's alternate ordering.
- **Deadline:** an absolute deadline is frozen at compilation and displayed for approval. No activation-time rewrite changes an approved hash. Requests too close to expiry are rejected.
- **ETH:** the live target is native ETH, represented by the standard nonzero `0xeeee…eeee` sentinel. WETH is not silently substituted. Receipt logs alone cannot prove native ETH delivery; transaction-scoped traces are required.
- **Amounts:** exact decimal strings are the JSON/SQLite representation; all arithmetic uses bigint. `amountIn` is an explicit chosen amount and can be below `maxSpend`.
- **Failure:** objective successful-execution violations can slash. Reverted, unconfirmed, mismatched, or incomplete evidence yields INCONCLUSIVE/HOLD. A late successfully executed transaction violates the recorded deadline. Infrastructure failures without reliable evidence are not automatically penalized.
- **Chain:** Base mainnet is the single live network supported by this build. Its separate loopback-only local EVM is a development fixture, not a claimed public testnet integration.
- **1inch:** Classic Swap v6.1 implements document 09. Aqua/SwapVM were reviewed and are not represented as implemented.
- **Bazantic:** current Recipes run fixed prompts and bound gateway tools. Three invocations bridge explicit user/Privy pauses; persistence and idempotency belong to CredibleExec. The model cannot supply a settlement verdict.

## Trust model

The bond is genuine ERC-20 custody. Only the agent account can deposit. Settlement pays the agent on success or the original user wallet on failure (which may differ from the user's chosen ETH recipient). The contract uses SafeERC20, ReentrancyGuard, checks-effects-interactions, immutable terms, exact receipt accounting, and terminal states.

The settlement authority is trusted. It can submit a dishonest outcome if compromised; the contract does not verify offchain RPC facts independently. The two-step owner can rotate that authority, so the owner is also trusted. There is no arbitrary owner withdrawal function. This MVP is not decentralized verification, insurance, guaranteed profit, or MEV protection.

User API calls require a verified Privy token and an owned embedded wallet. A user cannot replace a reviewed mandate with arbitrary calldata. Gateway tools authenticate separately and can operate only on a server-created job in its allowed phase, with persisted approval and strict sequencing. No gateway tool accepts raw evidence, a verdict, a wallet key, or a transaction to sign.

## Hashing and evidence

`mandateHash = keccak256(UTF8(canonicalJSON(validatedMandate)))`; keys are sorted, amounts are decimal strings, and addresses are checksummed before hashing. The onchain commitment additionally hashes `abi.encode(chainId, bondContract, commitmentId, Terms)` and stores all immutable terms. Backend settlement re-reads and compares them.

Each user execution is bound to stored sender, chain, target, calldata, value, and nonce. A transaction hash cannot settle multiple commitments. Evidence includes the block hash and timestamp, confirmations, USDC spend net of same-transaction refunds, and native ETH received net of successful same-transaction outflows. Reverted trace subtrees and delegatecalls are excluded from value transfer accounting. The canonical block is rechecked before settlement.

## Persistence and retry semantics

SQLite WAL stores commitments, drafts, jobs, transaction bindings, nonce reservations, and signed contract-operation bytes. A signer lock and unique signer/nonce prevent concurrent nonce reuse. Signed bytes are saved before broadcast. Retrying a contract operation uses the same hash; it does not silently create a new transaction. Errors leave saved state recoverable through the UI.

The user wallet signs its exact prepared nonce via Privy. Browser storage remembers a returned submission hash before calling the backend. A lost wallet response can be retried at that same nonce without producing a second mined spend. Operator reconciliation is needed if the wallet's transaction history is unavailable or a different transaction consumed its reserved nonce.

This is a persistent single-host service, not a distributed workflow engine. Public endpoints are rate limited. Unattended background retries, gas replacement for stuck operator transactions, multiple hosts, RPC quorum, and L1-finality settlement are future work.

## Tests and limitations

Tests exercise real Solidity execution on a local EVM, exact token balances, unauthorized settlement, state violations, deadline checks, deterministic compilation, route decoding, and HOLD behavior. `pnpm local:demo` is a separate full HTTP workflow proof with real local transfers and a controlled failure fixture.

The local parser and executor are explicitly isolated and disabled in production. The live 1inch decoder currently supports the generic V6 `swap` selector, rejecting unknown optimized routes rather than signing them unchecked. Live Privy/Bazantic/1inch end-to-end verification requires configured accounts, a published reachable gateway/Recipe, a payment grant, and funded wallets.
