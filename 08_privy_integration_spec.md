# 08_PRIVY_INTEGRATION_SPEC.md
# CredibleExec — Privy Wallet & Execution Authorization Specification

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_DOMAIN_MODEL.md`, `04_BOND_CONTRACT_SPEC.md`, `05_MANDATE_SPEC.md`, `06_MANDATE_COMPILER_SPEC.md`, `07_BAZANTIC_RECIPE_SPEC.md`

---

## 1. Objective

Define exactly how Privy is used inside CredibleExec for wallet management, transaction authorization, and controlled financial execution.

Privy must be a core component of the product, not simply an authentication provider.

**The central architectural distinction is:**

> Privy determines whether the agent is authorized to perform an action. CredibleExec determines whether the agent fulfilled the financial commitment it made.

---

## 2. Privy’s Role

Privy is responsible for:

```text
Wallet creation / access
        ↓
Wallet ownership
        ↓
Authorization
        ↓
Transaction signing
        ↓
Bounded execution controls
```

CredibleExec is responsible for:

```text
Mandate
   ↓
Commitment
   ↓
Agent collateral
   ↓
Execution evidence
   ↓
Outcome verification
   ↓
Bond settlement
```

These responsibilities must not be mixed.

---

## 3. Complete Architecture

```text
                         USER
                          │
                          ▼
                    BAZANTIC RECIPE
                          │
                          ▼
                   MANDATE COMPILER
                          │
                          ▼
                   VALIDATED MANDATE
                          │
                          ▼
                 CREDIBLEEXEC COMMITMENT
                          │
                  Agent locks bond
                          │
                          ▼
                       PRIVY
                  Authorization Layer
                          │
                          ▼
                       1INCH
                   Execution Provider
                          │
                          ▼
                     BLOCKCHAIN
                          │
                          ▼
                  EXECUTION EVIDENCE
                          │
                          ▼
                 CREDIBLEEXEC VERIFIER
                     ┌────┴────┐
                     ▼         ▼
                   PASS       FAIL
                     │         │
                     ▼         ▼
               RELEASE BOND  SLASH BOND
```

---

## 4. Wallet Model

The MVP should use one primary Privy-controlled wallet for the agent's financial execution.

Conceptually:

```text
User
 │
 └── Privy Wallet
        │
        ├── User-controlled funds
        │
        └── Agent-authorized execution
```

However, the agent's bond must remain separate from the user's principal.

Example:

```text
USER PRINCIPAL
$1,000 USDC
      │
      ▼
PRIVY WALLET
      │
      ▼
Financial execution


AGENT COLLATERAL
$100 USDC
      │
      ▼
CREDIBLEEXEC BOND CONTRACT
```

The user's $1,000 must never be treated as the agent's collateral.

---

## 5. Critical Economic Separation

This is one of the most important product invariants.

> User money ≠ Agent bond

Example:

- **User:** $1,000 USDC
- **Agent:** $100 USDC collateral

If execution fails:

- **User's $1,000** → handled according to transaction outcome
- **Agent's $100** → subject to commitment settlement

The agent must not satisfy its bond obligation by simply putting the user's funds at risk.

---

## 6. Who Is the Agent?

The MVP should model the executing agent/operator as an identifiable entity.

Conceptually:

```typescript
interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  bondBalance: string;
  status: "ACTIVE" | "INACTIVE";
}
```

The agent's wallet is the source of the collateral.

For a hackathon MVP, this may be a single predefined agent.

Example:

```text
CredibleExec Agent
```

Future versions can support multiple independent agents.

---

## 7. User Wallet vs Agent Wallet

For maximum clarity, distinguish:

- **User wallet**  
  Holds: User principal  
  and is controlled through Privy.

- **Agent wallet**  
  Provides: Agent collateral  
  and represents the economic accountability of the agent.

Conceptually:

```text
                CREDIBLEEXEC

        ┌─────────────────────────┐
        │                         │
        ▼                         ▼
   USER WALLET               AGENT WALLET
     Privy                       │
       │                         │
       ▼                         ▼
 User funds                 Bond contract
                               │
                               ▼
                         Agent collateral
```

This separation should be visible in the architecture even if the MVP implementation simplifies some operational details.

---

## 8. Why Privy Is Necessary

The system should not merely say:

> "Connect your wallet with Privy."

Privy must provide the actual authorization boundary for the financial action.

The product story is:

```text
Agent proposes action
       ↓
User reviews mandate
       ↓
Privy authorizes bounded execution
       ↓
1inch executes
```

Without Privy, CredibleExec would need to implement its own wallet authorization infrastructure.

Therefore:

> Privy protects the user's authority; CredibleExec adds economic accountability to the agent's promise.

---

## 9. Authorization Flow

The MVP flow:

1. User enters request
2. Agent generates mandate
3. Mandate is deterministically validated
4. User reviews mandate
5. Commitment is created
6. Agent bond is locked
7. Execution transaction is prepared
8. Privy authorization is requested
9. Privy signs/authorizes transaction
10. Transaction is submitted
11. Execution evidence is collected
12. Outcome is verified
13. Bond is released or slashed

The critical ordering is:

```text
USER APPROVAL
      ↓
COMMITMENT
      ↓
PRIVY AUTHORIZATION
      ↓
EXECUTION
```

Do not authorize financial execution before the user has approved the commitment.

---

## 10. Privy Authorization Context

When requesting authorization, the application should know:

```typescript
interface AuthorizationContext {
  commitmentId: string;

  mandateHash: string;

  chainId: number;

  executionProvider: string;

  transactionTarget: string;

  transactionValue: string;

  transactionData: string;
}
```

This context allows the application to associate the authorized transaction with the specific commitment.

The raw transaction should not be constructed directly by the LLM.

---

## 11. Transaction Construction

Transaction construction must follow:

```text
Validated Mandate
        ↓
Execution Provider
        ↓
Transaction
        ↓
Privy Authorization
```

Not:

```text
User prompt
        ↓
LLM
        ↓
arbitrary calldata
```

This prevents the language model from becoming an unrestricted transaction generator.

---

## 12. Privy Policy / Control Layer

Where supported by the selected Privy implementation, use Privy's wallet controls/policies to further constrain the agent's execution authority.

Examples of useful controls include:

- Allowed chain
- Allowed contract / execution target
- Allowed transaction type
- Spending limits

The exact controls used must match the actual Privy APIs available during implementation.

Do not fabricate unsupported policy capabilities.

---

## 13. Important Responsibility Boundary

Privy policies are an authorization/control mechanism.

They are not the CredibleExec verifier.

For example:

- **Privy:** "Is this transaction allowed?"
- **CredibleExec:** "Did the transaction satisfy the user's financial commitment?"

A transaction can therefore be:

```text
Privy authorization = VALID
```

while:

```text
CredibleExec commitment = FAILED
```

This is an extremely important demo scenario.

---

## 14. The Key Demo

The strongest demonstration should intentionally produce two outcomes.

### Scenario A — Success

```text
User request
     ↓
Mandate approved
     ↓
Agent bond locked
     ↓
Privy authorization ✓
     ↓
1inch execution ✓
     ↓
Financial conditions ✓
     ↓
Bond returned
```

UI:

```text
COMMITMENT FULFILLED

0.4817 ETH received

$100 agent commitment
RETURNED
```

### Scenario B — Failure

Create a controlled test where the transaction executes but does not satisfy the commitment.

Mandate:
```text
Receive ≥ 0.48 ETH
```

Actual:
```text
0.46 ETH
```

Then:

```text
Privy authorization ✓
Transaction ✓
Financial objective ✕
        ↓
Bond SLASHED
```

UI:

```text
COMMITMENT FAILED

Authorization       ✓
Transaction          ✓
Financial objective  ✕

Agent commitment
$100 → SLASHED
```

This visually explains why CredibleExec exists in addition to Privy.

---

## 15. Do Not Misrepresent Authorization

Avoid language such as:

> "Privy guarantees the agent will execute correctly."

Privy does not provide the economic commitment layer.

Instead:

> "Privy authorizes the action; CredibleExec evaluates whether the agent delivered the promised financial outcome."

---

## 16. Privy + CredibleExec Relationship

The architecture should be summarized as:

```text
PRIVY
Authorization
     +
CREDIBLEEXEC
Accountability
     +
1INCH
Execution
     +
BAZANTIC
Agent orchestration
```

Each component has a clear reason to exist.

---

## 17. Commitment Binding

Every execution must be associated with exactly one commitment.

Example:

```typescript
interface ExecutionContext {
  commitmentId: string;
  mandateHash: string;
  walletAddress: string;
  transactionHash?: string;
}
```

The backend must reject attempts to associate an execution with an unrelated commitment.

---

## 18. Mandate Hash

When the user approves the mandate:

```text
Canonical Mandate
       ↓
Hash
       ↓
Commitment
```

The hash should identify the exact conditions the agent agreed to.

Example:

```text
mandateHash = hash(canonicalMandate)
```

The system should preserve this binding through the execution lifecycle.

---

## 19. Preventing Mandate Mutation

After:

```text
USER APPROVES
```

the mandate must become immutable for that commitment.

Do not allow:

```text
Original:
minimumOutput = 0.48 ETH

        ↓

Execution starts

        ↓

Changed:
minimumOutput = 0.45 ETH
```

The commitment must settle against the original approved conditions.

---

## 20. Execution Target Restrictions

The MVP should restrict execution to the intended execution provider.

Example:

```text
executionVenue = 1inch
```

The system should not silently switch to another execution venue after the user approves the mandate.

Future versions may support:

- 1inch
- Uniswap
- Other providers

but venue selection must be explicit and auditable.

---

## 21. Authorization Failure

If the user rejects the Privy authorization:

```text
User
 ↓
Reject
 ↓
Authorization failed
```

The application should show:

> "Execution was not authorized."

Do not show:

> "Commitment failed."

These are different events.

If the commitment has already been funded, the system must transition it according to the commitment lifecycle defined in the Bond Contract specification.

---

## 22. Transaction Revert

If Privy authorizes the transaction but the transaction reverts:

```text
Authorization ✓
Transaction ✕
```

The application must capture the failure.

Whether this becomes an agent-attributable failure or an infrastructure/execution failure must follow the explicit failure policy defined by the settlement layer.

Do not automatically slash simply because a transaction reverted.

---

## 23. Expiration

If the deadline passes:

```text
deadline < currentTime
```

the commitment becomes eligible for expiration according to the bond contract rules.

The system must not alter the original deadline simply because execution was delayed.

---

## 24. Security Invariants

The implementation must enforce:

- **Invariant 1:** User principal cannot be treated as agent collateral.
- **Invariant 2:** Agent collateral cannot be withdrawn while committed unless the contract state permits it.
- **Invariant 3:** Approved mandate conditions cannot be modified.
- **Invariant 4:** A transaction must be associated with the correct commitment.
- **Invariant 5:** LLM output cannot directly authorize a transaction.
- **Invariant 6:** Privy authorization does not equal commitment success.
- **Invariant 7:** Settlement cannot be determined by an LLM.
- **Invariant 8:** A commitment cannot be settled twice.

---

## 25. Backend Responsibilities

The backend should coordinate:

```text
User
 ↓
Bazantic
 ↓
Mandate
 ↓
Commitment
 ↓
Privy
 ↓
1inch
 ↓
Evidence
 ↓
Verifier
 ↓
Settlement
```

It should maintain workflow state but should not become an unnecessary source of authority.

The backend should not be able to arbitrarily rewrite an active commitment.

---

## 26. Frontend Responsibilities

The frontend should show:

- **Before authorization:** What you asked, What the agent promised, What the agent risked, What will happen
- **During authorization:** Waiting for authorization...
- **During execution:** Executing...
- **After execution:** Fulfilled / Failed

The frontend must not claim success based on:

```text
API response = success
```

Success should ultimately come from verified execution state.

---

## 27. Recommended UI

### Commitment Review

```text
┌───────────────────────────────────┐
│        AGENT COMMITMENT            │
│                                   │
│ Swap                              │
│ 1,000 USDC → ETH                  │
│                                   │
│ Agent promises                    │
│ ≥ 0.48 ETH                        │
│ ≤ 1,000 USDC                      │
│ Treasury recipient                │
│ Within 60 seconds                 │
│                                   │
│ Agent collateral                  │
│ $100                              │
│                                   │
│ You don't pay this.               │
│ The agent locks it.               │
│                                   │
│        [ Approve & Execute ]      │
└───────────────────────────────────┘
```

---

## 28. Authorization UI

After clicking:

```text
Approve & Execute
```

show:

```text
AUTHORIZE EXECUTION

Your agent is requesting permission
to execute the approved financial action.

[Approve]
[Reject]
```

Do not overwhelm the user with:

- RPC endpoints
- calldata
- nonce
- gas internals
- contract implementation
- internal agent messages

Those belong in an optional technical-details section.

---

## 29. Result UI

### Success

```text
┌──────────────────────────────┐
│                              │
│       ✓ FULFILLED            │
│                              │
│ Received                     │
│ 0.4817 ETH                   │
│                              │
│ Spent                       │
│ 999.42 USDC                  │
│                              │
│ Agent commitment             │
│ $100 RETURNED                │
│                              │
└──────────────────────────────┘
```

### Failure

```text
┌──────────────────────────────┐
│                              │
│       ✕ COMMITMENT FAILED    │
│                              │
│ Expected                     │
│ ≥ 0.48 ETH                   │
│                              │
│ Received                     │
│ 0.46 ETH                     │
│                              │
│ Agent commitment             │
│ $100 SLASHED                 │
│                              │
└──────────────────────────────┘
```

---

## 30. Audit Trail

For every commitment, expose a simplified timeline:

```text
13:41:02
Mandate created

13:41:05
User approved

13:41:06
Agent collateral locked

13:41:07
Privy authorization

13:41:09
Transaction submitted

13:41:14
Execution confirmed

13:41:15
Outcome verified

13:41:15
Bond released
```

This gives the user confidence without requiring them to understand blockchain internals.

---

## 31. Future Extensions

The Privy integration should be designed so future versions can support:

- **Multiple agent wallets**
  ```text
  User
   ├── Trading Agent
   ├── Treasury Agent
   └── Payment Agent
  ```

- **Different permissions**
  ```text
  Trading Agent → swaps only
  Payment Agent → payments only
  Treasury Agent → treasury transfers
  ```

- **Business accounts**
  ```text
  Organization
        ↓
  Privy organization wallet
        ↓
  Team permissions
        ↓
  Agent execution
        ↓
  CredibleExec commitment
  ```

This is especially relevant to the Privy B2B financial product direction.

---

## 32. Future Business/Treasury Mode

A future version could support:

```text
CFO
 ↓
"Move $50,000 USDC to payroll
if all payroll conditions are satisfied."
 ↓
Agent
 ↓
Bond
 ↓
Privy organization authorization
 ↓
Execution
 ↓
Verification
 ↓
Settlement
```

Possible future controls:

- role-based permissions
- approval quorum
- spending limits
- multiple agents
- departmental wallets
- treasury mandates
- payroll commitments

Do not implement these in the MVP.

---

## 33. Future Agent Marketplace

Eventually:

```text
User
 ↓
Financial mandate
 ↓
Choose agent
 ↓
Compare:
  Bond
  Reputation
  Success rate
  Supported actions
 ↓
Agent accepts commitment
 ↓
Privy execution
```

This could turn CredibleExec into an agent accountability marketplace.

Again, this is future architecture, not MVP scope.

---

## 34. Future Dynamic Bonding

The MVP uses a fixed bond:

```text
$100
```

Future versions could calculate:

```text
Bond = f(transaction value,
         mandate complexity,
         agent reputation,
         deadline,
         historical performance)
```

For example:

- **Low-risk commitment** → lower bond
- **High-value commitment** → higher bond
- **Low-reputation agent** → higher bond

The MVP should use a simple fixed bond to keep the economics understandable.

---

## 35. MVP Scope

Implement:

```text
ONE CHAIN
ONE PRIVY WALLET
ONE AGENT
ONE FINANCIAL ACTION
ONE EXECUTION VENUE
ONE BOND CONTRACT
ONE AUTHORIZATION FLOW
```

Use:

```text
USDC → ETH
```

as the primary demonstration.

---

## 36. MVP Must Demonstrate

The final demo must prove:

1. User describes financial intent
2. Bazantic interprets it
3. Mandate is generated
4. User reviews it
5. Agent collateral is locked
6. Privy authorizes execution
7. 1inch executes
8. Actual result is observed
9. CredibleExec verifies it
10. Bond is released or slashed

The most important visual proof is:

> AUTHORIZED ≠ FULFILLED

---

## 37. Definition of Done

`08_PRIVY_INTEGRATION_SPEC.md` is complete when:

- [ ] Privy is used for actual wallet/transaction authorization.
- [ ] User funds are separated from agent collateral.
- [ ] User approves the mandate before execution.
- [ ] The execution is bound to a specific commitment.
- [ ] Approved mandate conditions cannot be silently changed.
- [ ] Transaction construction does not originate directly from the LLM.
- [ ] Appropriate Privy controls/policies are used where applicable.
- [ ] Authorization failure is distinct from financial commitment failure.
- [ ] Transaction execution is associated with execution evidence.
- [ ] CredibleExec remains the outcome/accountability layer.
- [ ] LLMs cannot directly release or slash bonds.
- [ ] Success and controlled failure can both be demonstrated.
- [ ] The UX hides unnecessary blockchain complexity.
- [ ] Architecture leaves room for B2B/organization wallets and multiple agents.

---

## Implementation-Agent Instruction

The most important distinction to preserve throughout implementation is:

> Privy protects the user's authority. CredibleExec protects the user's expectation.

Or, even more simply:

> Privy asks: "May the agent do this?"  
> CredibleExec asks: "Did the agent do what it promised?"

Do not turn CredibleExec into another wallet-policy system.  
Do not turn Privy into the outcome verifier.

The product becomes compelling only when these two layers work together:

```text
PRIVY
Permission
     +
CREDIBLEEXEC
Commitment
     +
1INCH
Execution
     +
BAZANTIC
Orchestration
```
