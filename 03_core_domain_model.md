03_CORE_DOMAIN_MODEL.md
CredibleExec — Domain Model, Data Structures & State Machine

Version: 1.0
Status: Implementation Specification
Depends on: 01_PRODUCT_CONSTITUTION.md, 02_SYSTEM_ARCHITECTURE.md

---

## 1. Purpose

This document defines the data model of CredibleExec.

The coding agent must use these domain objects as the foundation for:
- smart contracts
- backend services
- verifier
- settlement engine
- frontend state
- API responses
- event handling
- future extensions

The goal is to establish a single vocabulary across the entire application.

---

## 2. Core Domain Model

CredibleExec revolves around this relationship:

```text
USER
 │
 │ creates request
 ▼
AGENT
 │
 │ interprets request
 ▼
MANDATE
 │
 │ becomes accepted commitment
 ▼
COMMITMENT
 │
 ├───────────────┐
 ▼               ▼
BOND          EXECUTION
                 │
                 ▼
          EXECUTION EVIDENCE
                 │
                 ▼
             VERIFICATION
                 │
                 ▼
             SETTLEMENT
```

The distinction between these objects is important.

---

## 3. Domain Objects

The MVP contains these primary objects:
- User
- Agent
- Wallet
- Mandate
- Commitment
- Bond
- Execution
- ExecutionEvidence
- VerificationResult
- Settlement

Not every object needs to become a database table or smart-contract struct.

Some are logical domain objects.

---

## 4. User

Represents the person initiating a financial request.

```typescript
type User = {
    id: string;

    walletAddress: Address;

    createdAt: number;
};
```

**MVP**

Only the following are important:
- `id`
- `walletAddress`

Authentication details belong to Privy.

Do not create a custom authentication system unless required.

---

## 5. Agent

Represents the autonomous execution agent.

```typescript
type Agent = {
    id: string;

    name: string;

    walletAddress: Address;

    bondToken: Address;

    reputation?: AgentReputation;
};
```

For MVP:
- `id`
- `name`
- `walletAddress`
- `bondToken`

is sufficient.

---

## 6. Agent Identity vs Agent Wallet

These are conceptually different.

```text
Agent Identity
      │
      ▼
Agent Wallet
```

The identity represents:
> "Which agent/provider is making this commitment?"

The wallet represents:
> "Where does the agent's collateral come from?"

This distinction becomes important when we later support multiple agents or agent operators.

---

## 7. Wallet

Wallets should not be treated as the same thing as users or agents.

```typescript
type Wallet = {
    address: Address;

    ownerType: "USER" | "AGENT";

    ownerId: string;

    provider: "PRIVY";

    chainId: number;
};
```

Example:

User Wallet
`0xABC...`

Owner:
`USER:user_123`

Agent bond wallet:

Agent Wallet
`0xDEF...`

Owner:
`AGENT:agent_001`

---

## 8. Mandate

The Mandate represents what the user wants the agent to accomplish.

This is the semantic layer.

Example:
> "Swap $1,000 USDC for ETH and send it to my treasury. Get at least 0.48 ETH within 60 seconds."

becomes:

```typescript
type Mandate = {
    id: string;

    principalToken: Address;
    principalAmount: bigint;

    targetToken: Address;

    maxSpend: bigint;
    minOutput: bigint;

    recipient: Address;

    deadline: number;

    executionVenue?: string;
};
```

---

## 9. Mandate vs Commitment

This distinction is extremely important.

- **Mandate:** What the user wants accomplished.
- **Commitment:** What the agent formally accepts responsibility for accomplishing.

Conceptually:

```text
USER REQUEST
     ↓
MANDATE
     ↓
AGENT ACCEPTS
     ↓
COMMITMENT
```

The commitment should reference the mandate that produced it.

---

## 10. Commitment

This is the central object in CredibleExec.

```typescript
type Commitment = {
    id: string;

    mandateId: string;

    agentId: string;

    agentWallet: Address;

    principalToken: Address;

    principalAmount: bigint;

    targetToken: Address;

    maxSpend: bigint;

    minOutput: bigint;

    recipient: Address;

    deadline: number;

    bondAmount: bigint;

    bondToken: Address;

    status: CommitmentStatus;

    createdAt: number;

    activatedAt?: number;

    completedAt?: number;
};
```

---

## 11. Commitment Status

The MVP state machine is:

```text
CREATED
   │
   ▼
FUNDED
   │
   ▼
ACTIVE
   │
   ├─────────────┐
   ▼             ▼
FULFILLED       FAILED
   │             │
   └──────┬──────┘
          ▼
       TERMINAL
```

Additional states:
- `EXPIRED`
- `CANCELLED`
- `EXTERNAL_FAILURE`

should exist conceptually but should only be implemented where needed.

---

## 12. State Definitions

### CREATED

Commitment exists but the agent has not deposited the required bond.

```text
Commitment
    ↓
Bond missing
```

### FUNDED

Agent collateral has been deposited.

```text
Commitment
    +
Bond
    ↓
FUNDED
```

The commitment is now economically backed.

### ACTIVE

The commitment is ready for execution.

```text
Bond locked
+
Mandate immutable
+
Authorization ready
```

### FULFILLED

The verifier has determined:
> `mandate conditions == satisfied`

The bond becomes eligible for release.

### FAILED

The verifier determined that the agent's commitment was violated.

The bond becomes eligible for slashing.

### EXPIRED

The deadline passed without a valid completion.

Whether expiration results in slashing depends on the failure classification and exact commitment terms.

Do not automatically treat every timeout as malicious agent failure.

### CANCELLED

The commitment was explicitly cancelled through an authorized path.

---

## 13. Commitment State Transition Rules

Allowed transitions:

```text
CREATED → FUNDED
FUNDED → ACTIVE
ACTIVE → FULFILLED
ACTIVE → FAILED
ACTIVE → EXPIRED
CREATED → CANCELLED
FUNDED → CANCELLED
```

Disallowed:

```text
FULFILLED → ACTIVE
FAILED → ACTIVE
FULFILLED → FAILED
FAILED → FULFILLED
```

Terminal states must remain terminal.

---

## 14. Bond

The bond represents collateral posted by the agent.

```typescript
type Bond = {
    commitmentId: string;

    token: Address;

    amount: bigint;

    depositor: Address;

    contractAddress: Address;

    status: BondStatus;

    depositedAt: number;
};
```

Status:

```typescript
type BondStatus =
    | "PENDING"
    | "LOCKED"
    | "RELEASED"
    | "SLASHED";
```

---

## 15. Bond Invariant

The bond must belong economically to the agent.

Therefore:

> **User principal ≠ Agent bond**

Example:

Principal:
- 1,000 USDC

Bond:
- 100 USDC

The system must never silently use:
> 1,100 USDC

from the user and pretend $100 belongs to the agent.

---

## 16. Execution

Represents the actual financial transaction attempt.

```typescript
type Execution = {
    id: string;

    commitmentId: string;

    transactionHash?: string;

    chainId: number;

    executionProvider: string;

    status: ExecutionStatus;

    startedAt?: number;

    completedAt?: number;
};
```

Status:

```typescript
type ExecutionStatus =
    | "PENDING"
    | "SUBMITTED"
    | "CONFIRMED"
    | "REVERTED"
    | "UNKNOWN";
```

---

## 17. Execution vs Commitment

A commitment is the promise.

An execution is the attempt to fulfill the promise.

Therefore:

```text
COMMITMENT
"I promise to achieve X."

        ↓

EXECUTION
"I attempted X."

        ↓

EVIDENCE
"Here is what actually happened."

        ↓

VERIFICATION
"X was / was not achieved."
```

This separation is essential.

---

## 18. Execution Evidence

Evidence represents facts extracted from the blockchain transaction.

```typescript
type ExecutionEvidence = {
    executionId: string;

    transactionHash: string;

    chainId: number;

    success: boolean;

    actualSpend: bigint;

    actualOutput: bigint;

    outputToken: Address;

    recipient: Address;

    blockNumber?: bigint;

    timestamp?: number;

    transfers?: TokenTransfer[];
};
```

---

## 19. Token Transfer

A normalized transfer representation:

```typescript
type TokenTransfer = {
    token: Address;

    from: Address;

    to: Address;

    amount: bigint;
};
```

This allows the verifier to reason about actual movement of assets.

---

## 20. Why Evidence Must Be Separate

Do not pass raw blockchain responses directly into the verifier.

Instead:

```text
Blockchain RPC / Indexer
        ↓
Evidence Extractor
        ↓
Normalized ExecutionEvidence
        ↓
Verifier
```

This makes the verifier:
- easier to test
- easier to reason about
- easier to replace
- less dependent on one blockchain API

---

## 21. Verification Result

The verifier produces:

```typescript
type VerificationResult = {
    commitmentId: string;

    status: "PASS" | "FAIL";

    reasons: VerificationFailureReason[];

    actualSpend: bigint;

    actualOutput: bigint;

    actualRecipient: Address;

    verifiedAt: number;
};
```

---

## 22. Failure Reasons

Use explicit machine-readable reasons.

```typescript
type VerificationFailureReason =
    | "MAX_SPEND_EXCEEDED"
    | "MIN_OUTPUT_NOT_MET"
    | "WRONG_RECIPIENT"
    | "DEADLINE_EXCEEDED"
    | "TRANSACTION_REVERTED"
    | "INVALID_EXECUTION"
    | "INSUFFICIENT_EVIDENCE"
    | "EXTERNAL_FAILURE";
```

This is preferable to:
> `failureReason = "something went wrong"`

because the frontend can explain the exact failure.

---

## 23. Settlement

Settlement represents the economic conclusion.

```typescript
type Settlement = {
    id: string;

    commitmentId: string;

    verificationResult: "PASS" | "FAIL";

    bondAction: "RELEASE" | "SLASH" | "HOLD";

    transactionHash?: string;

    settledAt: number;
};
```

---

## 24. Settlement Rules

```text
PASS
VerificationResult = PASS
        ↓
BondAction = RELEASE

Agent-attributable FAIL
VerificationResult = FAIL
        ↓
BondAction = SLASH

External failure
VerificationResult = EXTERNAL_FAILURE
        ↓
BondAction = HOLD / RETURN
```

The exact economics will be finalized in the smart-contract specification.

---

## 25. Complete Object Relationship

The complete MVP relationship is:

```text
USER
 │
 └──── creates ────► MANDATE
                         │
                         │ accepted by
                         ▼
                       AGENT
                         │
                         ▼
                    COMMITMENT
                    /                             /                              ▼              ▼
                BOND          EXECUTION
                                  │
                                  ▼
                         EXECUTION EVIDENCE
                                  │
                                  ▼
                             VERIFICATION
                                  │
                                  ▼
                             SETTLEMENT
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                     RELEASE             SLASH
```

---

## 26. Database Model

The MVP does not require a massive database.

A relational representation could contain:
- `users`
- `agents`
- `mandates`
- `commitments`
- `bonds`
- `executions`
- `execution_evidence`
- `settlements`

Relationships:

```text
users
  │
  └── mandates

mandates
  │
  └── commitments

agents
  │
  └── commitments

commitments
  ├── bond
  ├── execution
  └── settlement
```

---

## 27. Suggested Database Fields

### `users`
- `id`
- `wallet_address`
- `created_at`

### `agents`
- `id`
- `name`
- `wallet_address`
- `created_at`

### `mandates`
- `id`
- `asset_in`
- `asset_out`
- `principal_amount`
- `max_spend`
- `min_output`
- `recipient`
- `deadline`
- `execution_venue`
- `created_at`

### `commitments`
- `id`
- `mandate_id`
- `agent_id`
- `bond_amount`
- `bond_token`
- `status`
- `created_at`
- `activated_at`
- `completed_at`

### `executions`
- `id`
- `commitment_id`
- `tx_hash`
- `chain_id`
- `provider`
- `status`
- `started_at`
- `completed_at`

### `execution_evidence`
- `id`
- `execution_id`
- `actual_spend`
- `actual_output`
- `output_token`
- `recipient`
- `block_number`
- `timestamp`

### `settlements`
- `id`
- `commitment_id`
- `verification_status`
- `bond_action`
- `tx_hash`
- `settled_at`

---

## 28. Onchain vs Offchain Data

Not every field needs to exist onchain.

### Onchain

The bond contract should minimally know:
- `commitmentId`
- `agent`
- `bondToken`
- `bondAmount`
- `status`

And enough mandate information to ensure the settlement references the correct commitment.

### Offchain

The backend can maintain:
- `naturalLanguageRequest`
- agent reasoning
- UI metadata
- execution metadata
- evidence normalization
- verification details
- analytics

The exact contract storage design will be finalized in Document 04.

---

## 29. Commitment Immutability

Once a commitment becomes ACTIVE, the conditions being evaluated must not change.

For example:

Before:
- `minOutput` = 0.48 ETH

must not become:

After execution:
- `minOutput` = 0.45 ETH

This would destroy the meaning of the commitment.

Therefore:

The evaluated mandate must be cryptographically or otherwise securely bound to the activated commitment.

The exact mechanism will be specified in the smart-contract document.

---

## 30. Commitment ID

Every commitment needs a unique identifier.

Recommended conceptual format:
- `commitmentId`

rather than relying solely on:
- `transactionHash`

because a commitment can exist before a transaction exists.

Relationship:

```text
commitmentId
      │
      ├── bond
      ├── execution
      ├── evidence
      └── settlement
```

---

## 31. Commitment Hash

A future-friendly architecture should support a canonical commitment representation.

Conceptually:

```typescript
commitmentHash =
    hash(
        assetIn,
        assetOut,
        maxSpend,
        minOutput,
        recipient,
        deadline,
        agent
    );
```

This allows the system to prove that:
> "The commitment evaluated later is the same commitment accepted earlier."

Do not overcomplicate the hashing mechanism at this stage.

The exact encoding will be defined in Document 04.

---

## 32. Natural Language Is Not the Source of Truth

This is a major design rule.

The following:
> "Please get me the best possible ETH price."

is not directly verifiable.

Therefore the agent must convert natural language into explicit conditions.

For example:

```text
User request
      ↓
Agent interpretation
      ↓
Structured mandate
      ↓
User confirmation
      ↓
Commitment
```

Once confirmed, the structured commitment—not the original sentence—is the settlement authority.

---

## 33. Validation Rules

Before creating a commitment:

### Required
- `assetIn` exists
- `assetOut` exists
- `principalAmount` > 0
- `maxSpend` > 0
- `minOutput` > 0
- `recipient` is valid
- `deadline` is in the future
- `bondAmount` > 0

### Logical validation
- `maxSpend` >= `principalAmount`

where appropriate.

Also ensure:
- `recipient` != zero address

and:
- `deadline` > current time

---

## 34. Dangerous Mandates

The compiler should reject or require clarification for ambiguous requests.

Example:
> "Get me a good ETH price."

There is no objective success criterion.

The system should respond:
> "What is the minimum amount of ETH you want to receive?"

rather than inventing:
- `minOutput` = 0.48 ETH

---

## 35. User Confirmation Boundary

The system should not silently transform an ambiguous request into an executable commitment.

The correct sequence is:

```text
Natural Language
      ↓
AI Interpretation
      ↓
Structured Mandate
      ↓
USER REVIEWS
      ↓
CONFIRM
      ↓
COMMITMENT
```

This is an important UX and security boundary.

---

## 36. Future: Mandate Types

The MVP supports essentially one mandate type:
- `SWAP`

Future types can include:

```typescript
type MandateType =
    | "SWAP"
    | "PAYMENT"
    | "TRANSFER"
    | "PAYROLL"
    | "DCA"
    | "YIELD"
    | "CROSS_CHAIN"
    | "CUSTOM";
```

The core commitment system should not need to change dramatically when these are introduced.

---

## 37. Future: Condition Model

The MVP uses explicit fields:
- `maxSpend`
- `minOutput`
- `recipient`
- `deadline`

Future architecture can generalize these into:

```typescript
type Condition = {
    type: ConditionType;
    operator: Operator;
    value: unknown;
};
```

Example:
- `MAX_SPEND` <= 10,000
- `MIN_OUTPUT` >= 4.8
- `DEADLINE` <= 60s
- `RECIPIENT` == TreasuryA

This could eventually make CredibleExec a generic financial mandate engine.

Do not implement this generalized condition framework in the MVP unless needed.

---

## 38. Future: Reputation Model

The domain model should eventually support:

```typescript
type AgentReputation = {
    fulfilledCommitments: number;

    failedCommitments: number;

    totalBonded: bigint;

    totalSlashed: bigint;

    fulfillmentRate: number;
};
```

The data should be derived from actual settlement history.

Not:
- 5-star user ratings

as the primary reliability metric.

---

## 39. Future: Dynamic Bond

Eventually:
- `bondAmount`

may be calculated from:
- transaction value
- mandate risk
- agent reputation
- execution complexity

But the MVP should use a simple explicit bond.

Example:
- Bond = 100 USDC

---

## 40. Future: Recurring Commitment

A future commitment may contain:

```typescript
type Schedule = {
    frequency: string;

    nextExecution: number;

    maxExecutions?: number;
};
```

But the MVP must remain one-shot.

---

## 41. Future: Multiple Executions

The current relationship is:

```text
Commitment
    ↓
Execution
```

Future:

```text
Commitment
    │
    ├── Execution 1
    ├── Execution 2
    └── Execution 3
```

This supports:
- recurring execution
- retries
- multi-step workflows
- fallback venues

The MVP should retain the simpler one-to-one relationship.

---

## 42. Future: Agent Marketplace

A future commitment can reference:
- `agentId`

which allows:

```text
User
 ↓
Mandate
 ↓
Agent selection
 ↓
Commitment
```

The commitment engine therefore becomes reusable regardless of how the agent was selected.

---

## 43. The Most Important Invariants

These are rules that must never be violated.

### Invariant 1
A commitment cannot be settled twice.

### Invariant 2
An active commitment cannot have its financial conditions silently changed.

### Invariant 3
The user's principal is not the agent's collateral.

### Invariant 4
A bond cannot be released or slashed without an authorized settlement path.

### Invariant 5
Final verification cannot be determined solely by the LLM.

### Invariant 6
Settlement must reference the exact commitment being evaluated.

### Invariant 7
Natural-language interpretation must occur before commitment creation.

### Invariant 8
The user must be able to see and confirm the structured commitment before execution.

---

## 44. Complete MVP Data Flow

Putting everything together:

```text
USER REQUEST
     │
     ▼
┌──────────────┐
│    MANDATE   │
└──────┬───────┘
       │
       ▼
┌────────────────┐
│   COMMITMENT   │
└───┬────────┬───┘
    │        │
    ▼        ▼
  BOND    AUTHORIZATION
             │
             ▼
          EXECUTION
             │
             ▼
           EVIDENCE
             │
             ▼
        VERIFICATION
             │
       ┌─────┴─────┐
       ▼           ▼
     PASS         FAIL
       │           │
       ▼           ▼
   RELEASE        SLASH
     BOND           BOND
       │           │
       └─────┬─────┘
             ▼
         SETTLEMENT
```

---

## 45. Implementation Rules for the Coding Agent

When implementing the application:

### DO
- Use strongly typed domain objects.
- Keep commitment state transitions explicit.
- Separate mandate from execution.
- Separate evidence from verification.
- Separate verification from settlement.
- Use immutable commitment parameters after activation.
- Give every commitment a unique ID.
- Make settlement idempotent.
- Keep future extension points modular.

### DO NOT
- Put all logic into one backend file.
- Allow the LLM to directly control bond settlement.
- use the transaction hash as the commitment identity.
- store the entire system state only in frontend state.
- couple the verifier directly to the 1inch implementation.
- couple the commitment model directly to one specific UI.
- implement recurring commitments now.
- implement generalized condition DSL now.
- implement reputation now.

---

## 46. Definition of Done

The domain model is correctly implemented when:
- User can be represented.
- Agent can be represented.
- Wallet ownership is explicit.
- Mandate can be represented.
- Commitment references a mandate and agent.
- Bond references a commitment.
- Execution references a commitment.
- Evidence references an execution.
- Verification references a commitment and evidence.
- Settlement references verification.
- Commitment states are explicit.
- Invalid state transitions are rejected.
- Commitment conditions cannot change after activation.
- User principal and agent bond remain separate.
- Future extensions can build around the same model.

---

## 47. Domain Model in One Sentence

The entire data model can be summarized as:

> **A user creates a mandate, an agent accepts it as a commitment backed by a bond, an execution produces blockchain evidence, a verifier evaluates that evidence against the commitment, and settlement releases or slashes the bond.**
