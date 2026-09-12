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

