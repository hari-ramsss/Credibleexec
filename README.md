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

## Current implementation

This repository now includes the first executable vertical foundation:

- canonical swap-mandate construction and hashing;
- deterministic mandate validation;
- commitment lifecycle transitions;
- deterministic execution-outcome verification;
- unit tests for success and failure paths.

No external packages are required for this foundation.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm test
npm run check
```

## Repository layout

```text
packages/
  core/       Commitment lifecycle and domain errors
  mandate/    Validation, canonicalization, and hashing
  verifier/   Evidence-based PASS/FAIL decisions
tests/        Unit and workflow tests
```

The product specifications remain the source for intended behavior. The next
implementation stages are the bond smart contract, persistence/API service,
web interface, and integration adapters for Bazantic, Privy, and 1inch.

