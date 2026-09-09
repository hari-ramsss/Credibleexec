```text
It will specify exactly how we divide the application into:

Frontend
    ↓
Agent / Bazantic
    ↓
Mandate Compiler
    ↓
CredibleExec Backend
    ↓
Smart Contract
    ↓
Privy
    ↓
1inch
    ↓
Blockchain
    ↓
Verifier
    ↓
Settlement
```

And, critically, it will include MVP architecture + future extension points + trust boundaries + data flow + failure flow + repository structure, so the coding agent has a precise blueprint before it writes the first line of code.

*Today 1:01 AM*  
*ok lets move on to the next document actually.....*

---

# 02_SYSTEM_ARCHITECTURE.md
# CredibleExec — System Architecture & Technical Blueprint

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`

---

## 1. Purpose

This document defines the technical architecture of CredibleExec.

The goal is to give the coding agent a precise implementation blueprint while keeping the MVP small enough to complete during the hackathon.

The architecture must support:
- Natural-language financial requests.
- AI interpretation into structured mandates.
- Creation of an economically backed commitment.
- Real agent collateral locking.
- User authorization through Privy.
- Financial execution through 1inch.
- Deterministic outcome verification.
- Bond release or slashing.
- A simple user-facing lifecycle.

The architecture must also leave clean extension points for future capabilities without requiring a complete rewrite.

---

## 2. Architectural Principle

The system should be built around one central object:

> **Financial Commitment**

Everything else interacts with that commitment.

```text
                    ┌─────────────┐
                    │    USER     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  FRONTEND   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  BAZANTIC   │
                    │    AGENT    │
                    └──────┬──────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ MANDATE COMPILER│
                  └────────┬────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ CREDIBLEEXEC CORE    │
                │                      │
                │ Commitment + Evidence│
                │ + Settlement         │
                └───────┬───────┬──────┘
                        │       │
                ┌───────┘       └────────┐
                ▼                         ▼
        ┌──────────────┐          ┌──────────────┐
        │ BOND CONTRACT│          │    PRIVY     │
        └──────────────┘          └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    1INCH     │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  BLOCKCHAIN  │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │   VERIFIER   │
                                  └──────┬───────┘
                                         │
                                  ┌──────┴──────┐
                                  ▼             ▼
                               SUCCESS        FAILURE
                                  │             │
                                  ▼             ▼
                              RELEASE        SLASH
                                BOND           BOND
```

---

## 3. System Components

The MVP consists of eight logical components.

| Component | Responsibility |
| --- | --- |
| **Frontend** | User interaction |
| **Agent** | Understand natural-language request |
| **Mandate Compiler** | Convert intent into machine-verifiable conditions |
| **CredibleExec Core** | Manage commitments and lifecycle |
| **Bond Contract** | Hold agent collateral |
| **Privy** | Wallet and authorization |
| **1inch** | Execute financial transaction |
| **Verifier** | Determine whether commitment was fulfilled |

---

## 4. Responsibility Boundaries

This separation is non-negotiable.

### Frontend

Responsible for:
- displaying information
- collecting user input
- showing commitment
- requesting user approval
- showing execution status
- showing settlement result

The frontend must not decide whether a commitment succeeded.

### Agent / Bazantic

Responsible for:
- interpreting natural language
- identifying financial parameters
- producing structured mandate
- orchestrating the workflow

The agent must not directly determine final settlement.

### Mandate Compiler

Responsible for converting:
- Natural language

into:
- Structured financial constraints

Example:
> "Get at least 0.48 ETH"

becomes:
- **minOutput** = 0.48 ETH

### CredibleExec Core

Responsible for:
- creating commitments
- associating mandates with commitments
- tracking lifecycle
- collecting execution evidence
- triggering settlement

### Bond Contract

Responsible for:
- receiving collateral
- locking collateral
- releasing collateral
- slashing collateral
- preventing double settlement

### Privy

Responsible for:
- wallet infrastructure
- authorization
- transaction signing/execution boundary

CredibleExec should use Privy, not rebuild it.

### 1inch

Responsible for:
- quote/execution routing
- performing the financial transaction

1inch is an execution rail, not the accountability mechanism.

### Verifier

Responsible for:
- Determining whether the actual execution satisfies the commitment.

It must operate from objective execution evidence.

---

## 5. Trust Model

The system has several different trust boundaries.

```text
                    USER
                      │
              trusts the interface
                      │
                      ▼
                    AGENT
                      │
          NOT inherently trusted
                      │
                      ▼
                 COMMITMENT
                      │
          economically constrained
                      │
                      ▼
                   PRIVY
                      │
              authorization
                      │
                      ▼
                  1INCH
                      │
                  execution
                      │
                      ▼
                BLOCKCHAIN
                      │
                source of truth
                      │
                      ▼
                 VERIFIER
                      │
             objective evaluation
                      │
                      ▼
                 SETTLEMENT
```

The fundamental philosophy is:

> Do not require the agent to be honest when the system can verify the outcome.

---

## 6. User Funds vs Agent Collateral

This separation must exist throughout the entire architecture.

```text
USER

$1,000 USDC
      │
      ▼
PRIVY WALLET
      │
      ▼
1INCH EXECUTION
```

Separately:

```text
AGENT

$100 USDC
      │
      ▼
CREDIBLEEXEC BOND CONTRACT
```

Never represent the user's principal as the agent's bond.

Never deduct the bond from the user's execution capital.

---

## 7. Commitment as the Central Domain Object

Every execution should reference a commitment.

Conceptually:

```typescript
type Commitment = {
    id: string;

    agent: Address;

    principal: {
        token: Address;
        amount: bigint;
    };

    targetAsset: Address;

    maxSpend: bigint;

    minOutput: bigint;

    recipient: Address;

    deadline: number;

    bondAmount: bigint;

    status: CommitmentStatus;
};
```

Possible statuses:

```typescript
enum CommitmentStatus {
    CREATED,
    FUNDED,
    ACTIVE,
    FULFILLED,
    FAILED,
    EXPIRED,
    CANCELLED
}
```

Do not add dozens of states unless required.

---

## 8. High-Level Data Flow

The primary workflow is:

```text
1. User Request
       ↓
2. Agent Interpretation
       ↓
3. Mandate Creation
       ↓
4. Commitment Creation
       ↓
5. Agent Bond Deposit
       ↓
6. User Authorization
       ↓
7. Financial Execution
       ↓
8. Blockchain Confirmation
       ↓
9. Evidence Extraction
       ↓
10. Deterministic Verification
       ↓
11. Settlement
       ↓
12. UI Result
```

---

## 9. Step 1 — User Request

The frontend receives:
> Swap $1,000 USDC for ETH and send it to my treasury.  
> Get at least 0.48 ETH within 60 seconds.

The frontend should send this request to the agent layer.

It should not attempt to interpret the financial constraints itself.

---

## 10. Step 2 — Agent Interpretation

Bazantic/agent workflow receives:
- `userRequest`

The agent extracts:
- `assetIn`
- `assetOut`
- `amount`
- `recipient`
- `minimum output`
- `deadline`

The agent should produce a structured intermediate representation.

Example:

```json
{
  "assetIn": "USDC",
  "assetOut": "ETH",
  "amount": "1000",
  "recipient": "0x...",
  "minOutput": "0.48",
  "deadlineSeconds": 60
}
```

---

## 11. Step 3 — Mandate Compilation

The intermediate representation becomes a formal commitment.

Example:

```json
{
  "assetIn": "USDC",
  "assetOut": "ETH",
  "maxSpend": "1000",
  "minOutput": "0.48",
  "recipient": "0xTreasury",
  "deadline": 1757466060
}
```

The system must validate the resulting mandate before execution.

---

## 12. Step 4 — Commitment Creation

The backend creates a commitment identifier.

Example:
- `commitmentId`: `0x8f...91`

The commitment should become immutable once activated, except for explicitly supported cancellation paths.

The purpose is to prevent:

```text
Promise created
      ↓
Agent changes promise
      ↓
Execution
      ↓
"Success"
```

The evaluated commitment must be the same commitment the agent accepted.

---

## 13. Step 5 — Agent Bond

The agent deposits collateral.

Example:
- **Commitment value:** $1,000
- **Agent bond:** $100

The bond contract records:
- `commitmentId`
- `agent`
- `bondAmount`
- `token`
- `status`

The commitment cannot become active until the required bond exists.

---

## 14. Step 6 — Privy Authorization

Once the commitment is established:

```text
COMMITMENT
     ↓
AUTHORIZED ACTION
     ↓
PRIVY
```

Privy is the authorization boundary.

The system should ensure the transaction being authorized corresponds to the commitment.

For the MVP, the exact implementation mechanism can be finalized in `07_PRIVY_INTEGRATION_SPEC.md`.

The important architectural rule is:

> Privy authorizes the execution; CredibleExec evaluates its outcome.

---

## 15. Step 7 — 1inch Execution

The execution layer receives the required trade.

Conceptually:

```text
USDC
 ↓
1inch
 ↓
ETH
 ↓
Required recipient
```

The system stores the resulting transaction hash:
- `txHash`

The transaction hash becomes the link between:

```text
Commitment
       ↓
Execution
       ↓
Blockchain evidence
```

---

## 16. Step 8 — Blockchain as Evidence Source

After execution, the system must retrieve actual transaction results.

The blockchain should be treated as the source of truth for:
- transaction success/failure
- actual token transfers
- amounts
- recipient
- timestamps/block information

Do not rely solely on:
> agent says: "I received 0.48 ETH"

Instead:

```text
Blockchain
    ↓
Observed transfers
    ↓
Actual execution result
```

---

## 17. Step 9 — Outcome Verification

The verifier receives:
- Mandate
- Transaction evidence

It evaluates objective conditions.

Example:

```typescript
const fulfilled =
    actualSpend <= mandate.maxSpend &&
    actualOutput >= mandate.minOutput &&
    actualRecipient === mandate.recipient &&
    executionTime <= mandate.deadline;
```

Result:
- **FULFILLED**

or:
- **FAILED**

The verifier should additionally produce failure reasons.

Example:

```json
{
  "status": "FAILED",
  "reasons": [
    "MIN_OUTPUT_NOT_MET"
  ]
}
```

This will be valuable for the UI.

---

## 18. Step 10 — Settlement

The verifier result feeds into settlement.

**Success**

```text
VERIFIER
   ↓
PASS
   ↓
SETTLEMENT
   ↓
RELEASE BOND
```

**Failure**

```text
VERIFIER
   ↓
FAIL
   ↓
SETTLEMENT
   ↓
SLASH BOND
```

Settlement must be idempotent.

A commitment must never be settled twice.

---

## 19. API Boundary

The frontend should communicate with a backend/service layer rather than directly orchestrating everything.

Conceptually:

```text
Frontend
   │
   ▼
API
   │
   ├── Agent
   ├── Commitment
   ├── Execution
   ├── Verification
   └── Settlement
```

Suggested API surface:

```text
POST /api/mandates
POST /api/commitments
GET  /api/commitments/:id
POST /api/commitments/:id/activate
POST /api/commitments/:id/execute
GET  /api/commitments/:id/status
POST /api/commitments/:id/settle
```

These endpoints are conceptual.

The exact API contract will be defined later.

---

## 20. Recommended Repository Structure

The coding agent should eventually produce a structure approximately like:

```text
credibleexec/
│
├── apps/
│   └── web/
│
├── contracts/
│   └── CredibleExecBond.sol
│
├── packages/
│   ├── mandate/
│   ├── verifier/
│   ├── execution/
│   └── shared/
│
├── services/
│   ├── agent/
│   ├── commitment/
│   ├── verifier/
│   └── settlement/
│
├── tests/
│   ├── contracts/
│   ├── mandate/
│   ├── verifier/
│   └── integration/
│
└── docs/
```

This is a logical target, not an instruction to build every directory immediately.

---

## 21. Smart Contract Boundary

The smart contract should remain intentionally small.

Its responsibility is economic custody and settlement.

Conceptual interface:

```solidity
createCommitment(...)
depositBond(...)
activateCommitment(...)
settleSuccess(...)
settleFailure(...)
cancelCommitment(...)
```

The contract should not:
- call an LLM
- call 1inch APIs
- parse natural language
- calculate AI reasoning
- perform complex offchain verification
- become a general-purpose trading contract

---

## 22. Offchain vs Onchain Responsibilities

This distinction is critical.

| Function | Location |
| --- | --- |
| Natural-language interpretation | Offchain |
| AI reasoning | Offchain |
| Bazantic workflow | Offchain |
| Mandate construction | Offchain |
| UI | Offchain |
| Quote retrieval | Offchain |
| 1inch orchestration | Offchain |
| Bond custody | Onchain |
| Commitment settlement state | Onchain |
| Actual transaction | Onchain |
| Transaction evidence | Blockchain |
| Outcome calculation | Initially offchain/deterministic |
| Final bond transfer | Onchain |

The MVP should not attempt to force everything onchain.

---

## 23. MVP Trust Model

We must be technically honest.

The MVP may contain trusted offchain infrastructure, especially around:
- evidence collection
- verifier execution
- settlement triggering

Therefore the MVP should not claim:
> "Fully trustless autonomous financial accountability."

Instead:
> "CredibleExec uses deterministic outcome verification and onchain collateral settlement."

If the verifier is centralized in the MVP, document that honestly.

---

## 24. Future Trust-Minimization Path

The architecture should leave room for:

**MVP**

```text
Single verifier
```

**Future**

```text
Multiple independent verifiers
     ↓
Quorum
     ↓
Settlement
```

Potential future architecture:

```text
                TRANSACTION
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Verifier A  Verifier B  Verifier C
          │          │          │
          └──────────┼──────────┘
                     ▼
                   QUORUM
                     │
                     ▼
                 SETTLEMENT
```

This is an extension, not MVP scope.

---

## 25. Future Architecture Hooks

The system should be designed so the following can eventually plug into the same commitment model.

### Multiple asset types
- USDC → ETH
- USDC → USDT
- ETH → USDC

### Multiple execution venues

Instead of:

```text
Commitment → 1inch
```

future architecture can support:

```text
Commitment
     ↓
Execution Router
     ├── 1inch
     ├── Other DEX
     └── Payment Rail
```

### Recurring commitments

```text
Commitment
     ↓
Schedule
     ↓
Execution
     ↓
Settlement
     ↓
Next execution
```

### Reputation

The settlement engine can emit historical results:
- FULFILLED
- FAILED
- FULFILLED
- FULFILLED

which can later feed an agent reputation system.

### Agent marketplace

The commitment layer can become the foundation for:

```text
User
 ↓
Choose Agent
 ↓
Agent Posts Bond
 ↓
Execute
 ↓
Settle
```

---

## 26. Future Architecture: Agent Reputation

A future reputation service could consume settlement events:

```text
Settlement Event
       ↓
Reputation Engine
       ↓
Agent History
```

Example:

```text
Agent: AlphaExec

Fulfilled:       194
Failed:            6
Success rate:   97%
Total bonded:  $21,400
```

The core system should therefore emit structured settlement events.

---

## 27. Future Architecture: Agent Marketplace

Potential future flow:

```text
USER
 │
 │ mandate
 ▼
AGENT MARKETPLACE
 │
 ├── Agent A
 ├── Agent B
 └── Agent C
       │
       ▼
 selected agent
       │
       ▼
 CredibleExec
```

Agents compete on:
- reliability
- collateral
- fees
- execution speed
- supported mandates

---

## 28. Future Architecture: Business Treasury

The same commitment abstraction can support:

```text
Business
   ↓
Treasury Mandate
   ↓
Agent
   ↓
Bond
   ↓
Execution
   ↓
Settlement
```

Example:
> "Pay our supplier 10,000 USDC before 5 PM."

The architecture remains:

```text
Mandate
+
Bond
+
Execution
+
Verification
+
Settlement
```

Only the mandate types change.

---

## 29. Future Architecture: Compound Commitments

The MVP has four core constraints.

Future commitments may support:

```typescript
conditions: [
    MaxSpend,
    MinOutput,
    Recipient,
    Deadline,
    AllowedVenue,
    SlippageLimit,
    PriceRange,
    AssetRestriction
]
```

This turns the commitment system into a general financial mandate engine.

---

## 30. Failure Architecture

Every failure must have an explicit source.

```text
                   EXECUTION
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
           AGENT    PROTOCOL   EXTERNAL
           ERROR     ERROR      ERROR
              │        │          │
              ▼        ▼          ▼
            SLASH    DEFINE     NO AUTO
                     POLICY     SLASH
```

The implementation should never blindly execute:

```text
transaction != expected
       ↓
SLASH
```

without classifying the failure.

The exact failure taxonomy will be defined in `14_FAILURE_HANDLING_SPEC.md`.

---

## 31. Security Boundary

The architecture must protect against:

### Commitment modification
An active commitment must not be silently changed.

### Bond theft
Only authorized settlement paths may release/slash collateral.

### Double settlement
A commitment may only transition once into a terminal state.

### Fake evidence
The verifier must use independently obtained transaction data.

### Wrong transaction
The transaction evaluated must correspond to the commitment.

### Unauthorized execution
Execution must pass through the intended authorization boundary.

---

## 32. Event-Driven Architecture

The bond contract should emit events that allow the rest of the system to track lifecycle.

Conceptually:

```solidity
event CommitmentCreated(...);
event BondDeposited(...);
event CommitmentActivated(...);
event CommitmentFulfilled(...);
event CommitmentFailed(...);
event BondReleased(...);
event BondSlashed(...);
```

This will become especially useful for future:
- reputation
- analytics
- dashboards
- indexing
- agent history
- marketplace ranking

---

## 33. MVP vs Future Architecture

| Area | MVP | Future |
| --- | --- | --- |
| **Chain** | One | Multi-chain |
| **Asset** | USDC/ETH | Multiple assets |
| **Agent** | One | Agent marketplace |
| **Bond** | Fixed/simple | Dynamic |
| **Verification** | Deterministic | Multi-verifier |
| **Execution** | 1inch | Multiple venues |
| **Commitments** | One-shot | Recurring |
| **Reputation** | Basic history | Full reputation |
| **Users** | Individual | Businesses/DAOs |
| **Disputes** | Limited | Optimistic challenges |
| **UI** | Simple flow | Advanced dashboard |
| **Analytics** | Basic | Full analytics |
| **Governance** | None | Potentially DAO |
| **ZK/TEE** | None | Optional future research |

---

## 34. Critical Architecture Rule

Do not build the future architecture into the MVP.

Instead:

> Build interfaces that allow the future architecture to plug in.

For example:

**Bad:**
- Verifier = hardcoded giant function

**Better:**

```typescript
interface OutcomeVerifier {
    verify(
        mandate: Mandate,
        evidence: ExecutionEvidence
    ): VerificationResult;
}
```

The MVP can have:
- `DeterministicVerifier`

Later:
- `MultiVerifier`
- `OptimisticVerifier`
- `ZKVerifier`

without redesigning the entire application.

---

## 35. Suggested Internal Interfaces

These interfaces should eventually exist conceptually.

```typescript
interface MandateCompiler {
    compile(request: string): Mandate;
}

interface ExecutionProvider {
    execute(
        mandate: Mandate
    ): ExecutionResult;
}

interface OutcomeVerifier {
    verify(
        mandate: Mandate,
        evidence: ExecutionEvidence
    ): VerificationResult;
}

interface SettlementProvider {
    settle(
        commitmentId: string,
        result: VerificationResult
    ): SettlementResult;
}
```

This gives the project modularity without overengineering.

---

## 36. Complete MVP Sequence

The coding agent should eventually implement this exact sequence:

```text
USER
 │
 │ natural-language request
 ▼
AGENT
 │
 │ structured intent
 ▼
MANDATE COMPILER
 │
 │ validated mandate
 ▼
COMMITMENT
 │
 │ bond requirement
 ▼
BOND CONTRACT
 │
 │ agent collateral locked
 ▼
PRIVY
 │
 │ authorized execution
 ▼
1INCH
 │
 │ transaction
 ▼
BLOCKCHAIN
 │
 │ actual evidence
 ▼
VERIFIER
 │
 ├──────────────┐
 ▼              ▼
PASS            FAIL
 │              │
 ▼              ▼
RELEASE         SLASH
BOND            BOND
 │              │
 └──────┬───────┘
        ▼
      FRONTEND
        │
        ▼
   FINAL RESULT
```

---

## 37. What the Coding Agent Must Build First

After receiving this document, the coding agent must not start implementing every component.

The implementation should proceed according to subsequent specifications.

The immediate next implementation specification will define the domain model.

Therefore:

> Do not make architectural assumptions that aren't defined in the subsequent documents.

---

## 38. Architecture Acceptance Criteria

Before proceeding to implementation, this architecture is considered correct only if:

- User funds and agent collateral are separate.
- Commitment is the central domain object.
- Agent cannot modify an activated commitment.
- Privy is the authorization layer.
- 1inch is the execution layer.
- Blockchain provides execution evidence.
- Verifier is deterministic.
- LLM does not determine final settlement.
- Bond contract controls collateral.
- Settlement cannot happen twice.
- Success releases collateral.
- Agent-attributable failure can slash collateral.
- External failures are not blindly punished.
- MVP remains one chain / one primary workflow.
- Future capabilities can plug into the commitment model.
- The frontend does not expose unnecessary blockchain complexity.

---

## 39. Architecture North Star

The system can ultimately be understood as five layers:

```text
┌─────────────────────────────────────┐
│              EXPERIENCE             │
│       User + Natural Language       │
├─────────────────────────────────────┤
│              INTELLIGENCE            │
│          Agent + Bazantic            │
├─────────────────────────────────────┤
│             COMMITMENT              │
│       Mandate + Bond + Rules        │
├─────────────────────────────────────┤
│              EXECUTION              │
│          Privy + 1inch              │
├─────────────────────────────────────┤
│             ACCOUNTABILITY           │
│       Blockchain + Verification     │
│             + Settlement             │
└─────────────────────────────────────┘
```

The most important architectural layer is the middle:

> **COMMITMENT**

Because that's where CredibleExec differentiates itself.

---

## 40. Final Implementation Principle

The architecture should make this sentence literally true:

> The agent proposes what it will do, the user authorizes it, the agent puts collateral behind the promise, the transaction happens, and the system independently checks whether the promise was fulfilled.

That is the complete technical story of CredibleExec.

---

