# 11_COMMITMENT_SETTLEMENT_SPEC.md
# CredibleExec — Economic Commitment Settlement Specification

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_DOMAIN_MODEL.md`, `04_BOND_CONTRACT_SPEC.md`, `05_MANDATE_SPEC.md`, `06_MANDATE_COMPILER_SPEC.md`, `07_BAZANTIC_RECIPE_SPEC.md`, `08_PRIVY_INTEGRATION_SPEC.md`, `09_1INCH_EXECUTION_SPEC.md`, `10_OUTCOME_VERIFIER_SPEC.md`

---

## 1. Objective

Define the economic settlement layer of CredibleExec.

This document specifies exactly what happens to the agent's collateral after execution:

```text
COMMITMENT
    ↓
EXECUTION
    ↓
VERIFICATION
    ↓
┌──────────────┬──────────────┬──────────────┐
│   FULFILLED  │   VIOLATION  │ INCONCLUSIVE  │
│              │              │              │
│ RELEASE BOND │  SLASH BOND  │    WAIT      │
└──────────────┴──────────────┴──────────────┘
```

The settlement layer is what turns:

> "The agent promised."

into:

> "The agent had something economically at stake."

---

## 2. Core Principle

The bond must be real.

A UI element saying:

```text
Agent commitment: $100
```

is not sufficient.

The MVP must actually lock collateral in the CredibleExec bond contract.

```text
AGENT WALLET
     │
     │ $100 USDC
     ▼
CREDIBLEEXEC BOND CONTRACT
     │
     ├── Commitment active
     │
     ├── PASS → return $100
     │
     └── FAIL → slash $100
```

The user's principal remains separate.

---

## 3. Economic Model

Example:

- **User principal:** 1,000 USDC
- **Agent collateral:** 100 USDC

The financial execution operates on the user's authorized funds.

The collateral exists to create economic accountability for the agent.

```text
User money
     ↓
Financial execution

Agent money
     ↓
Accountability mechanism
```

This separation must never be violated.

---

## 4. Settlement Inputs

The settlement layer receives:

```typescript
interface SettlementRequest {
  commitmentId: string;

  verificationResult: VerificationResult;

  settlementReason: SettlementReason;
}
```

Possible settlement classifications:

```typescript
type SettlementReason =
  | "FULFILLED"
  | "COMMITMENT_VIOLATION"
  | "EXPIRED"
  | "CANCELLED"
  | "INCONCLUSIVE";
```

---

## 5. Settlement Outputs

The settlement system should produce:

```typescript
interface SettlementResult {
  commitmentId: string;

  outcome:
    | "BOND_RELEASED"
    | "BOND_SLASHED"
    | "BOND_RETURNED"
    | "NO_SETTLEMENT";

  amount: string;

  recipient: string;

  timestamp: number;

  transactionHash?: string;
}
```

---

## 6. Commitment Lifecycle

The commitment lifecycle is:

```text
CREATED
   ↓
FUNDED
   ↓
ACTIVE
   ↓
   ├──────────────→ FULFILLED
   │                    ↓
   │                BOND RELEASED
   │
   ├──────────────→ FAILED
   │                    ↓
   │                BOND SLASHED
   │
   ├──────────────→ EXPIRED
   │                    ↓
   │                EXPIRATION SETTLEMENT
   │
   └──────────────→ CANCELLED
                        ↓
                  BOND RETURNED
```

`INCONCLUSIVE` is primarily a verification state, not necessarily a permanent commitment state.

---

## 7. State Definitions

### CREATED

Commitment exists but the agent bond has not yet been successfully locked.

- **Bond:** `NOT LOCKED`

Execution must not begin.

### FUNDED

Agent collateral has successfully been deposited.

- **Bond:** `LOCKED`

The commitment can now become active.

### ACTIVE

The commitment is fully established and can be executed.

- **Bond:** `LOCKED`

The mandate conditions are immutable.

### FULFILLED

The verifier has determined that every required commitment condition was satisfied.

- **Bond:** `RELEASED`

### FAILED

A defined commitment condition was objectively violated.

- **Bond:** `SLASHED`

Only failures that qualify under the settlement policy should trigger slashing.

### EXPIRED

The commitment's deadline passed without fulfillment.

The exact treatment must follow the predefined expiration policy.

### CANCELLED

The commitment was cancelled through an authorized cancellation path.

The bond treatment depends on who cancelled and why.

---

## 8. Bond Funding

Before activation:

```text
Agent
  ↓
approve USDC
  ↓
Bond Contract
  ↓
depositBond(commitmentId, amount)
```

The contract must verify:

```text
amount == requiredBond
```

or otherwise follow the commitment's exact bond rules.

---

## 9. Bond Ownership

The contract should record:

```solidity
interface Bond {
  commitmentId: string;

  agent: address;

  token: address;

  amount: uint256;

  status:
    | "LOCKED"
    | "RELEASED"
    | "SLASHED";
}
```

The bond belongs economically to the agent.

The contract temporarily holds it while the commitment is active.

---

## 10. Bond Must Be Commitment-Specific

Do not maintain one ambiguous global balance such as:

```text
Agent bond:
$10,000
```

without associating collateral with individual commitments.

Instead:

```text
Agent
 │
 ├── Commitment #001 → $100 locked
 ├── Commitment #002 → $250 locked
 └── Commitment #003 → $500 locked
```

Each commitment should have clearly attributable collateral.

This prevents accounting ambiguity.

---

## 11. Activation

A commitment becomes active only after:

```text
id="activation"
Commitment created
        +
Bond funded
        +
Mandate valid
        ↓
ACTIVE
```

The contract must not allow `ACTIVE` with `bondAmount = 0` for the MVP.

---

## 12. Successful Settlement

If the verifier returns:

```text
FULFILLED
```

then:

```text
ACTIVE
  ↓
FULFILLED
  ↓
RELEASE BOND
```

The bond returns to the agent.

Example:

```text
Agent bond:
100 USDC

Result:
FULFILLED

Settlement:
100 USDC → Agent
```

---

## 13. Failed Settlement

If the verifier determines:

```text
COMMITMENT_VIOLATION
```

then:

```text
ACTIVE
  ↓
FAILED
  ↓
SLASH BOND
```

For MVP, the slashed bond should go to the user associated with the commitment.

Example:

```text
Agent:
100 USDC bond

Commitment:
FAILED

Settlement:
100 USDC → User
```

This makes the economic consequence immediately understandable.

---

## 14. Why the User Receives the Slashed Bond

The MVP should keep the economic flow simple:

- **SUCCESS:** Agent → gets bond back
- **FAILURE:** Agent → loses bond; User → receives slashed bond

This gives the user a direct reason to care about agent accountability.

Future versions can introduce:

- User
- Challenger
- Protocol treasury
- Insurance pool

but those are unnecessary for MVP.

---

## 15. Partial Slashing

Do not implement partial slashing in the MVP unless there is a compelling reason.

Use:

- `PASS` → 100% release
- `QUALIFYING FAILURE` → 100% slash

This keeps the mechanism easy to explain.

Future versions can support:

- minor violation → 10% slash
- major violation → 100% slash

based on predefined conditions.

---

## 16. INCONCLUSIVE

If verification returns `INCONCLUSIVE`, the bond should generally remain locked rather than immediately releasing or slashing it.

```text
ACTIVE
   ↓
INCONCLUSIVE
   ↓
WAIT / RETRY VERIFICATION
```

This protects both sides from settlement based on incomplete evidence.

---

## 17. Example Infrastructure Failure

Suppose:

```text
Transaction submitted
        ↓
RPC becomes unavailable
```

The system cannot currently determine the result.

Do not do:

```text
RPC unavailable
     ↓
SLASH
```

Instead:

```text
Evidence incomplete
     ↓
INCONCLUSIVE
     ↓
Retry evidence collection
```

---

## 18. Expiration

Suppose:

```text
Deadline:
14:01:00
```

and the commitment remains unfulfilled.

After the defined expiration point:

```text
ACTIVE
   ↓
EXPIRED
```

The MVP must explicitly define the expiration settlement policy.

Recommended simple rule:

> If the commitment expires without a qualifying fulfillment, the agent's bond is slashable only when the expiration represents an agent-attributable failure under the commitment's execution policy.

Do not blindly equate `deadline passed` with `agent fault` when infrastructure or external execution failures are responsible.

---

## 19. MVP Simplification for Expiration

To keep the hackathon implementation manageable, use a narrow MVP rule:

```text
Successful qualifying execution before deadline → FULFILLED
Confirmed commitment violation                 → FAILED
No qualifying execution by deadline             → EXPIRED
```

Then define the economic treatment explicitly in the implementation rather than letting individual services invent their own behavior.

---

## 20. Cancellation

Cancellation must have explicit authority.

Potential actors:

- User
- Agent
- Protocol

For MVP, support only clearly defined cancellation paths.

Recommended:

Before activation:
```text
CREATED → CANCELLED
```
Bond not yet locked → no bond settlement.

Active commitment:

Do not allow arbitrary cancellation after the agent has begun execution.

Otherwise an adversarial user could:

```text
Agent executes
     ↓
User cancels
     ↓
User avoids commitment
```

This would undermine the economic model.

---

## 21. User Cancellation

If user cancellation is supported after bond funding, the contract must define what happens.

For MVP, the safest approach is:

> Once a commitment becomes ACTIVE, neither party can unilaterally cancel it without following the predefined commitment policy.

This keeps the accountability mechanism simple.

---

## 22. Agent Cancellation

Similarly, the agent should not be able to escape a commitment by simply calling `cancel()` after activation.

Otherwise:

```text
Agent accepts commitment
      ↓
Market conditions become unfavorable
      ↓
Agent cancels
      ↓
Bond returned
```

would eliminate the economic accountability.

---

## 23. Settlement Authority

The contract should not blindly trust arbitrary frontend requests.

Settlement must originate from an authorized settlement mechanism.

Conceptually:

```text
Verifier
   ↓
Authorized settlement service
   ↓
Bond contract
```

The contract verifies that the caller is authorized to settle.

---

## 24. Centralization Boundary

For the MVP, it is acceptable to use a designated settlement authority.

Example:

```text
CredibleExec backend/verifier
        ↓
authorized settlement role
        ↓
bond contract
```

But the project must explicitly document:

> The MVP uses an authorized verifier/settler rather than a fully decentralized dispute mechanism.

Do not claim that the MVP is completely trustless if it is not.

---

## 25. Future Decentralized Settlement

Future versions can replace the single authorized verifier with:

```text
Verifier A
Verifier B
Verifier C
       ↓
   Quorum
       ↓
 Settlement
```

or:

```text
Verification
     ↓
Challenge window
     ↓
No challenge
     ↓
Settlement
```

This is a future decentralization path.

---

## 26. Settlement Authorization

The contract should use role-based access control.

Conceptually:

```text
SETTLER_ROLE
```

Only authorized settlement infrastructure may call:

- `settleSuccess()`
- `settleFailure()`

The exact implementation should follow the smart-contract architecture established in `04_BOND_CONTRACT_SPEC.md`.

---

## 27. Settlement Idempotency

Settlement must be one-way.

Example:

```text
ACTIVE
 ↓
FULFILLED
 ↓
BOND RELEASED
```

A second call `settleSuccess()` must revert.

Likewise:

```text
ACTIVE
 ↓
FAILED
 ↓
BOND SLASHED
```

cannot later become `FULFILLED`.

---

## 28. State Transition Table

| Current State | Event | Next State | Bond |
|---|---|---|---|
| `CREATED` | Bond funded | `FUNDED` | Locked |
| `FUNDED` | Activated | `ACTIVE` | Locked |
| `ACTIVE` | Verified success | `FULFILLED` | Released |
| `ACTIVE` | Verified violation | `FAILED` | Slashed |
| `ACTIVE` | Deadline reached | `EXPIRED` | Policy-defined |
| `CREATED` | Cancelled | `CANCELLED` | Returned/no lock |
| `FUNDED` | Valid cancellation | `CANCELLED` | Returned |
| `ACTIVE` | Arbitrary cancel | Rejected | Remains locked |
| `FULFILLED` | Any settlement | Rejected | Already released |
| `FAILED` | Any settlement | Rejected | Already slashed |

---

## 29. Settlement Events

Emit events for every important economic transition.

Example:

```solidity
event BondDeposited(
    bytes32 indexed commitmentId,
    address indexed agent,
    uint256 amount
);
event CommitmentFulfilled(
    bytes32 indexed commitmentId
);
event CommitmentFailed(
    bytes32 indexed commitmentId,
    bytes32 reason
);
event BondReleased(
    bytes32 indexed commitmentId,
    address indexed agent,
    uint256 amount
);
event BondSlashed(
    bytes32 indexed commitmentId,
    address indexed recipient,
    uint256 amount
);
```

These events create an auditable economic history.

---

## 30. Settlement Reason

When slashing occurs, store a machine-readable reason.

Examples:

- `MIN_OUTPUT_NOT_MET`
- `MAX_SPEND_EXCEEDED`
- `WRONG_RECIPIENT`
- `DEADLINE_EXCEEDED`

This allows the UI to explain:

> "The agent was required to deliver at least 0.48 ETH but delivered 0.46 ETH."

instead of:

> "Bond slashed."

---

## 31. Settlement Transaction

The settlement service should submit an onchain transaction:

```text
Verification
     ↓
Settlement transaction
     ↓
Bond contract
     ↓
State update
     ↓
Token transfer
```

Store `settlementTransactionHash` alongside the commitment.

---

## 32. User Result

After successful settlement:

### Fulfilled

```text
┌─────────────────────────────┐
│       ✓ FULFILLED           │
│                             │
│ Agent delivered:            │
│ 0.4817 ETH                  │
│                             │
│ Commitment:                 │
│ SATISFIED                   │
│                             │
│ Agent bond:                 │
│ $100 RETURNED               │
└─────────────────────────────┘
```

### Failed

```text
┌─────────────────────────────┐
│     ✕ COMMITMENT FAILED     │
│                             │
│ Required: ≥ 0.48 ETH        │
│ Received: 0.46 ETH          │
│                             │
│ Agent bond:                 │
│ $100 SLASHED                │
└─────────────────────────────┘
```

---

## 33. Economic Invariant

The system must guarantee:

```text
id="economic-invariant"
```

> An agent cannot claim commitment fulfillment while simultaneously retrieving the bond without a valid settlement result.

Likewise:

> A user cannot receive the bond without a valid qualifying failure.

The settlement contract is the enforcement boundary.

---

## 34. Reentrancy Protection

Bond settlement involves token transfers.

The contract must use safe patterns:

```text
Checks → Effects → Interactions
```

and appropriate reentrancy protection.

Do not implement:

```text
transfer()
then
update state
```

when the reverse ordering is required for safety.

---

## 35. Token Safety

For MVP, use one known collateral token:

```text
USDC
```

The contract should use a standard ERC-20 interface.

Do not support arbitrary collateral tokens until the accounting is proven.

---

## 36. Decimal Handling

The contract should use raw token units.

Example:

```text
100 USDC = 100000000 raw units
```

No floating-point representation should exist anywhere in settlement calculations.

---

## 37. Bond Amount Visibility

The user should always know:

```text
Agent collateral: $100
```

and:

> This is the agent's money, not yours.

This is one of the strongest UX moments in the product.

---

## 38. Do Not Call It Insurance

Avoid:

> "Your transaction is insured for $100."

That implies a broader financial guarantee.

Instead say:

> "The agent has committed $100 of its own collateral to this mandate."

The mechanism is an economic commitment, not general-purpose insurance.

---

## 39. Do Not Promise Full Loss Protection

If the user loses money because:

- ETH price moves
- market changes
- gas increases
- external systems fail

the bond should not automatically be described as compensation for all losses.

The bond only represents the predefined commitment.

Example:

```text
Agent promised: ≥ 0.48 ETH
Agent delivered: 0.481 ETH
→ fulfilled.
```

The user could still lose economic value relative to some external market benchmark.

That is outside the MVP commitment unless explicitly included.

---

## 40. Why This Is Different From a Limit Order

A limit order might say:

> Buy ETH if price reaches X.

CredibleExec says:

> The agent accepts responsibility for fulfilling: Spend ≤ X, Receive ≥ Y, Recipient = Z, Deadline = T

The difference is:

```text
LIMIT ORDER
     ↓
Execution condition

CREDIBLEEXEC
     ↓
Agent commitment
     +
Economic collateral
     +
Post-execution verification
     +
Settlement
```

Do not allow the MVP to collapse into merely another limit-order UI.

---

## 41. Why Privy Does Not Replace Settlement

Privy may establish:

> "Agent is authorized to execute this transaction."

CredibleExec establishes:

> "Agent has financially committed to the outcome."

Therefore:

```text
Authorization ≠ Accountability
```

This distinction should appear in technical documentation and the demo.

---

## 42. Future Partial Slashing

Future versions may support condition-specific penalties.

Example:

- Output shortfall: 1% → 10% bond slash
- Output shortfall: 10% → 50% slash
- Wrong recipient: 100% slash

This requires a carefully designed economic model.

Do not implement it in MVP.

---

## 43. Future Challenge Mechanism

A future settlement system could support:

```text
Verifier says FAIL
        ↓
Challenge window
        ↓
Agent/challenger submits evidence
        ↓
Independent verification
        ↓
Final settlement
```

This can reduce reliance on one centralized verifier.

---

## 44. Future Reputation Integration

Settlement outcomes can feed the agent reputation system.

```text
FULFILLED → Positive reputation
FAILED    → Negative reputation
```

Combined with bonding:

```text
Bad history
   ↓
Higher required bond
   ↓
More economic accountability
```

This becomes a future agent marketplace primitive.

---

## 45. Future Dynamic Bonding

The bond could eventually depend on:

- transaction value
- mandate complexity
- agent reputation
- deadline
- historical failure rate

Example:

```text
$1,000 commitment
Agent A: $50 bond
Agent B: $150 bond (because Agent B has lower verified reliability)
```

Do not introduce dynamic pricing in the MVP.

---

## 46. Future Agent-to-Agent Commitments

CredibleExec can eventually support:

```text
Agent A
   ↓
"I will execute this financial operation."

Bond
   ↓
Agent B accepts

Execution
   ↓
Verification
   ↓
Settlement
```

This creates a primitive for machine-to-machine economic accountability.

---

## 47. Future Business Mode

For B2B use:

```text
Company
   ↓
Financial mandate
   ↓
Agent
   ↓
Agent collateral
   ↓
Privy organization wallet
   ↓
Execution
   ↓
Verification
   ↓
Settlement
```

Potential applications:

- treasury operations
- automated procurement
- payroll execution
- vendor payments
- recurring financial operations

This aligns naturally with the Privy B2B financial-product direction.

---

## 48. MVP Contract Functions

The MVP contract should expose a minimal interface similar to:

```solidity
createCommitment(...)
depositBond(bytes32 commitmentId, uint256 amount)
activateCommitment(bytes32 commitmentId)
settleSuccess(bytes32 commitmentId)
settleFailure(bytes32 commitmentId, bytes32 reason)
cancelCommitment(bytes32 commitmentId)
```

Only include cancellation paths that are actually required by the finalized state machine.

---

## 49. Contract Invariants

The contract must enforce:

1. Bond cannot be released twice.
2. Bond cannot be slashed twice.
3. A released bond cannot later be slashed.
4. A slashed bond cannot later be released.
5. Active commitments have locked collateral.
6. Commitment conditions cannot mutate after activation.
7. Only authorized settlement mechanisms can settle.
8. Settlement amount cannot exceed locked bond.
9. User principal is not held as agent collateral.
10. Commitment IDs are unique.
11. Zero-value bonds are rejected for MVP.
12. Invalid state transitions revert.

---

## 50. Testing Requirements

### Test 1 — Bond deposit
Agent → deposits $100  
- **Expected:** `Bond = LOCKED`

### Test 2 — Successful settlement
`PASS`  
- **Expected:** `Bond: LOCKED → RELEASED`; Agent receives `$100`

### Test 3 — Failed settlement
`COMMITMENT_VIOLATION`  
- **Expected:** `Bond: LOCKED → SLASHED`; User receives `$100`

### Test 4 — Double release
Call `settleSuccess()` twice.  
- **Expected:** Second call reverts.

### Test 5 — Release after slash
`settleFailure()` → `settleSuccess()`  
- **Expected:** Second call reverts.

### Test 6 — Slash after release
`settleSuccess()` → `settleFailure()`  
- **Expected:** Second call reverts.

### Test 7 — Unauthorized settlement
Random address attempts `settleFailure()`.  
- **Expected:** `REVERT`

### Test 8 — Zero bond
Attempt `bond = 0`.  
- **Expected:** `REVERT`

### Test 9 — Incorrect bond amount
Commitment requires `100 USDC`, Agent deposits `50 USDC`.  
- **Expected:** Commitment cannot activate.

### Test 10 — Immutable commitment
Attempt to modify `minOutput`, `recipient`, `deadline`, or `maxSpend` after activation.  
- **Expected:** `REVERT`

### Test 11 — Inconclusive verification
`Verification = INCONCLUSIVE`  
- **Expected:** Bond remains locked; No automatic slash.

### Test 12 — User cancellation after activation
Attempt unauthorized unilateral cancellation.  
- **Expected:** `REVERT`

---

## 51. End-to-End Test

The most important integration test:

```text
USER REQUEST
     ↓
BAZANTIC
     ↓
MANDATE
     ↓
USER APPROVAL
     ↓
COMMITMENT CREATED
     ↓
AGENT BOND LOCKED
     ↓
PRIVY AUTHORIZATION
     ↓
1INCH EXECUTION
     ↓
BLOCKCHAIN
     ↓
VERIFIER
     ↓
PASS
     ↓
BOND RELEASE
```

Then repeat with controlled failure:

```text
VERIFIER
     ↓
FAIL
     ↓
BOND SLASH
     ↓
USER RECEIVES BOND
```

Both paths must work.

---

## 52. Demo Requirements

The hackathon demo should show the bond moving onchain.

Do not merely change `Bond status: "SLASHED"` in the frontend.

Show:

```text
Agent wallet → Bond contract
```

and then:

```text
Bond contract → Agent (for success)
```

or:

```text
Bond contract → User (for failure)
```

A real transaction hash makes the economic mechanism substantially more credible.

---

## 53. UI Timeline

The result screen should expose:

1. Mandate approved             ✓
2. Agent collateral locked      ✓
3. Privy authorization          ✓
4. Transaction executed         ✓
5. Outcome verified             ✓
6. Bond settled                 ✓

For failure:

1. Mandate approved             ✓
2. Agent collateral locked      ✓
3. Privy authorization          ✓
4. Transaction executed         ✓
5. Financial objective          ✕
6. Bond slashed                 ✓

This tells the entire product story in seconds.

---

## 54. MVP Economic Model

Keep it deliberately simple:

- One agent
- One bond token
- One fixed bond amount
- One commitment
- One verifier
- One settlement authority
- Full release on success
- Full slash on qualifying failure

This is enough to prove the concept.

---

## 55. Future Economic Model

Eventually:

```text
              AGENT
                │
          Reputation
                │
                ▼
        Required Bond
                │
                ▼
          Commitment
                │
        ┌───────┴───────┐
        ▼               ▼
   Fulfilled          Failed
        │               │
   Reputation ↑     Reputation ↓
   Bond ↓           Bond ↑
```

This creates a self-reinforcing accountability market.

---

## 56. Definition of Done

`11_COMMITMENT_SETTLEMENT_SPEC.md` is complete when:

- [ ] Agent collateral is real onchain collateral.
- [ ] User principal is separate from the bond.
- [ ] Bond is associated with a specific commitment.
- [ ] Bond is locked before active execution.
- [ ] Successful commitments release the bond.
- [ ] Qualifying failures slash the bond.
- [ ] Slashed MVP bond goes to the user.
- [ ] INCONCLUSIVE does not automatically slash.
- [ ] Settlement authority is explicitly defined.
- [ ] Settlement is idempotent.
- [ ] Invalid state transitions revert.
- [ ] Active mandates cannot be mutated.
- [ ] Events provide an economic audit trail.
- [ ] Failure reasons are machine-readable.
- [ ] Infrastructure failures are distinguished from commitment violations.
- [ ] Zero/incorrect bond funding is rejected.
- [ ] Unauthorized settlement is rejected.
- [ ] Success and failure are both demonstrated with real or clearly labeled testnet transactions.
- [ ] Future multi-verifier/challenge architecture remains possible.

---

## 57. Implementation-Agent Instruction

Do not implement the bond as a database field or frontend number.

The following:

```text
Agent Commitment: $100
```

is only meaningful if:

```text
Agent Wallet
      ↓
$100 USDC
      ↓
Bond Contract
      ↓
LOCKED
```

actually happens.

The central economic invariant is:

> An agent must have something of its own at stake before its commitment becomes active.

And settlement must be:

```text
VERIFIED FULFILLMENT
        ↓
RELEASE AGENT BOND

VERIFIED COMMITMENT VIOLATION
        ↓
SLASH AGENT BOND
```

Never let the LLM, frontend, or ordinary API response directly determine the movement of collateral.

The final trust architecture should remain:

```text
BAZANTIC
   │
   │ orchestrates
   ▼
MANDATE
   │
   │ defines promise
   ▼
COMMITMENT
   │
   │ locks agent collateral
   ▼
PRIVY
   │
   │ authorizes
   ▼
1INCH
   │
   │ executes
   ▼
BLOCKCHAIN
   │
   │ produces evidence
   ▼
VERIFIER
   │
   ├── FULFILLED ──→ RELEASE BOND
   │
   └── VIOLATION ─→ SLASH BOND
```
