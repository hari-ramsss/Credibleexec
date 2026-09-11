# 10_OUTCOME_VERIFIER_SPEC.md
# CredibleExec — Deterministic Outcome Verification Engine Specification

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_DOMAIN_MODEL.md`, `04_BOND_CONTRACT_SPEC.md`, `05_MANDATE_SPEC.md`, `06_MANDATE_COMPILER_SPEC.md`, `07_BAZANTIC_RECIPE_SPEC.md`, `08_PRIVY_INTEGRATION_SPEC.md`, `09_1INCH_EXECUTION_SPEC.md`

---

## 1. Objective

Define the deterministic verification layer that answers the most important question in CredibleExec:

> Did the agent actually fulfill the financial commitment it made?

The verifier takes:

```text
Approved Mandate
        +
Actual Blockchain Evidence
        ↓
Deterministic Verification
        ↓
PASS / FAIL / INCONCLUSIVE
```

The verifier must be independent of the AI agent.

The LLM must never be the authority that decides whether an agent fulfilled its financial promise.

---

## 2. Core Principle

CredibleExec is built around:

> The agent should not be able to declare itself successful.

Instead:

- **Agent:** "I completed the task."
- **CredibleExec:** "Let's check the blockchain."

The blockchain-derived execution evidence is compared against the immutable conditions agreed to before execution.

---

## 3. Verification Architecture

```text
                    APPROVED COMMITMENT
                           │
                           │
                           ▼
                    ┌──────────────┐
                    │   MANDATE    │
                    │              │
                    │ maxSpend     │
                    │ minOutput    │
                    │ recipient    │
                    │ deadline     │
                    └──────┬───────┘
                           │
                           │
                           ▼
BLOCKCHAIN ───────→ EXECUTION EVIDENCE
                           │
                           ▼
                  ┌──────────────────┐
                  │ DETERMINISTIC    │
                  │    VERIFIER      │
                  └────────┬─────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
                PASS              FAIL
                  │                 │
                  ▼                 ▼
            RELEASE BOND       SLASH BOND
```

---

## 4. Verification Must Be Deterministic

The verifier must use explicit rules.

For MVP:

**PASS if:**

```text
actualSpend <= maxSpend
AND
actualOutput >= minOutput
AND
actualRecipient == requiredRecipient
AND
executionTimestamp <= deadline
AND
execution belongs to commitment
```

Otherwise:

```text
FAIL
```

There should be no:

> "LLM thinks this was probably successful."

---

## 5. Verification Input

The verifier receives:

```typescript
interface VerificationInput {
  commitment: Commitment;

  mandate: SwapMandate;

  evidence: ExecutionEvidence;
}
```

The commitment should contain the immutable commitment conditions.

The mandate provides the semantic structure.

The evidence represents what actually happened.

---

## 6. Verification Output

Use an explicit result:

```typescript
interface VerificationResult {
  status: "PASS" | "FAIL" | "INCONCLUSIVE";

  commitmentId: string;

  checks: VerificationCheck[];

  verifiedAt: number;

  reason?: string;
}
```

Each individual condition should produce a result.

Example:

```json
{
  "status": "PASS",
  "checks": [
    {
      "condition": "MAX_SPEND",
      "expected": "1000000000",
      "actual": "998500000",
      "passed": true
    },
    {
      "condition": "MIN_OUTPUT",
      "expected": "480000000000000000",
      "actual": "481700000000000000",
      "passed": true
    },
    {
      "condition": "RECIPIENT",
      "expected": "0xABC...",
      "actual": "0xABC...",
      "passed": true
    },
    {
      "condition": "DEADLINE",
      "expected": "1789040000",
      "actual": "1789039982",
      "passed": true
    }
  ]
}
```

This makes the result auditable.

---

## 7. Verification Checks

The MVP has four primary checks.

### Check 1 — Maximum Spend

```text
actualSpend <= maxSpend
```

Example:

```text
Allowed:
1,000 USDC

Actual:
997 USDC

PASS
```

If:

```text
Actual:
1,025 USDC
```

then:

```text
FAIL
```

---

## 8. Check 2 — Minimum Output

```text
actualOutput >= minOutput
```

Example:

```text
Required:
0.48 ETH

Actual:
0.481 ETH

PASS
```

If:

```text
Actual:
0.46 ETH
```

then:

```text
FAIL
```

This is one of the most important commitment checks.

---

## 9. Check 3 — Recipient

Verify:

```text
actualRecipient == mandate.recipient
```

Example:

```text
Expected:
Treasury

Actual:
Treasury

PASS
```

If the output was delivered elsewhere:

```text
FAIL
```

Even if the amount was correct.

---

## 10. Check 4 — Deadline

Verify:

```text
executionTimestamp <= mandate.deadline
```

Example:

```text
Deadline:
14:01:00

Execution:
14:00:42

PASS
```

If:

```text
Execution:
14:01:04
```

then:

```text
FAIL
```

The original deadline must never be modified after commitment creation.

---

## 11. Commitment Binding

The verifier must make sure the evidence actually belongs to the commitment being evaluated.

Verify relationships such as:

- `commitmentId`
- `mandateHash`
- `chainId`
- `transactionHash`
- `wallet/executor`

are consistent.

Conceptually:

```text
Evidence
    ↓
Transaction
    ↓
Correct wallet/executor
    ↓
Correct commitment
```

Do not allow an unrelated successful transaction to satisfy a commitment.

---

## 12. Mandate Hash Verification

The approved mandate should have a canonical representation.

Example:

```text
Canonical Mandate
       ↓
Hash
       ↓
mandateHash
```

The verifier can ensure the commitment's stored mandate hash corresponds to the conditions being evaluated.

This prevents a dangerous situation where:

```text
Original commitment:
minOutput = 0.48 ETH

Verifier receives:
minOutput = 0.45 ETH
```

The verifier must evaluate the original approved conditions.

---

## 13. No Mutable Verification Criteria

Once the commitment becomes active:

- `MAX SPEND`
- `MIN OUTPUT`
- `RECIPIENT`
- `DEADLINE`

must be immutable for that commitment.

The verifier should not fetch a newer user preference and use that instead.

The commitment is evaluated against the conditions that were actually accepted.

---

## 14. Evidence Source

Evidence should ultimately originate from blockchain state.

Potential sources:

- Transaction receipt
- Transaction logs/events
- Token transfer events
- Block timestamp
- Relevant contract state

For the MVP, use the simplest reliable evidence path available.

Do not build an unnecessarily complicated indexing infrastructure.

---

## 15. Transaction Receipt

The first verification step should determine whether the transaction itself succeeded.

Conceptually:

```text
Transaction
    ↓
Receipt
    ↓
Success?
```

If the transaction reverted:

```text
status = REVERTED
```

The verifier must not pretend the financial objective was fulfilled.

However, whether the bond is slashed should depend on the commitment's failure policy.

---

## 16. Transaction Success ≠ Commitment Success

This distinction is essential.

Example:

```text
Transaction:
SUCCESS ✓
```

but:

```text
Actual output:
0.46 ETH

Required:
0.48 ETH
```

Therefore:

```text
Transaction = SUCCESS
Commitment = FAIL
```

This is a central feature of CredibleExec.

---

## 17. Evidence Extraction

The verifier should extract actual financial values from the transaction.

For example:

- **Input:** USDC transfer from execution wallet
- **Output:** ETH received by Treasury

The verifier then calculates:

- `actualSpend`
- `actualOutput`
- `actualRecipient`
- `executionTimestamp`

Do not rely on frontend-provided values.

---

## 18. Token Amount Precision

All verification must use integer base units.

Example:

```text
0.48 ETH
```

becomes:

```text
480000000000000000
```

Then:

```text
actualOutput >= 480000000000000000
```

Never perform financial comparisons using JavaScript floating-point numbers.

Use:

- `bigint`
- `decimal libraries`
- `fixed-point arithmetic`

where appropriate.

---

## 19. Verification Order

Use a predictable verification sequence:

1. Commitment exists
2. Commitment is verifiable
3. Mandate hash matches
4. Transaction exists
5. Transaction belongs to correct chain
6. Transaction belongs to correct executor
7. Transaction succeeded
8. Extract actual financial outcome
9. Check max spend
10. Check minimum output
11. Check recipient
12. Check deadline
13. Produce final result

---

## 20. PASS Logic

The MVP verifier should implement:

```typescript
const passed =
  actualSpend <= mandate.maxSpend &&
  actualOutput >= mandate.minOutput &&
  actualRecipient === mandate.recipient &&
  executionTimestamp <= mandate.deadline &&
  evidence.commitmentId === commitment.id;
```

If every condition passes:

```text
PASS
```

---

## 21. FAIL Logic

If objective evidence proves a commitment condition was violated:

```text
FAIL
```

Example:

```text
Expected output:
≥ 0.48 ETH

Actual:
0.46 ETH

Result:
FAIL

Reason:
MIN_OUTPUT_NOT_SATISFIED
```

---

## 22. INCONCLUSIVE Logic

Introduce:

```text
INCONCLUSIVE
```

for cases where the system does not have sufficient reliable evidence to make a determination.

Examples:

- Transaction not yet confirmed
- Required event data unavailable
- Indexer temporarily unavailable
- Evidence incomplete

Do not convert uncertainty into failure.

This is important for fair economic settlement.

---

## 23. Verification Error Codes

Use explicit codes:

```typescript
enum VerificationErrorCode {
  COMMITMENT_NOT_FOUND,
  MANDATE_HASH_MISMATCH,
  WRONG_CHAIN,
  WRONG_EXECUTOR,
  TRANSACTION_NOT_FOUND,
  TRANSACTION_REVERTED,
  EVIDENCE_INCOMPLETE,
  MAX_SPEND_EXCEEDED,
  MIN_OUTPUT_NOT_MET,
  WRONG_RECIPIENT,
  DEADLINE_EXCEEDED
}
```

Infrastructure-specific errors should remain distinguishable from actual commitment violations.

---

## 24. Agent-Attributable Failure

The verifier should distinguish:

- **Objective commitment failure**  
  Example:
  ```text
  Transaction confirmed
  Actual output = 0.46 ETH
  Required output = 0.48 ETH
  ```
  This is a clear financial-condition violation.

- **Infrastructure failure**  
  Example:
  ```text
  RPC temporarily unavailable
  ```
  This is not automatically an agent failure.

The settlement layer must use the appropriate classification.

---

## 25. Failure Classification

Use:

```typescript
type VerificationClassification =
  | "FULFILLED"
  | "COMMITMENT_VIOLATION"
  | "EXECUTION_FAILURE"
  | "INFRASTRUCTURE_FAILURE"
  | "INCONCLUSIVE";
```

This is better than simply `PASS / FAIL` internally.

The UI can still simplify the result to:

```text
FULFILLED
FAILED
```

when appropriate.

---

## 26. Example — Successful Commitment

Mandate:

```text
Max spend: 1,000 USDC
Min output: 0.48 ETH
Recipient: Treasury
Deadline: 14:01:00
```

Evidence:

```text
Spend: 998 USDC
Output: 0.481 ETH
Recipient: Treasury
Execution: 14:00:31
```

Checks:

```text
MAX_SPEND       ✓
MIN_OUTPUT      ✓
RECIPIENT       ✓
DEADLINE        ✓
```

Result:

```text
PASS
```

Settlement:

```text
Bond → RELEASED
```

---

## 27. Example — Minimum Output Failure

Mandate:

```text
Min output: 0.48 ETH
```

Evidence:

```text
Actual output: 0.46 ETH
```

Checks:

```text
MAX_SPEND       ✓
MIN_OUTPUT      ✕
RECIPIENT       ✓
DEADLINE        ✓
```

Result:

```text
FAIL
```

Reason:

```text
MIN_OUTPUT_NOT_MET
```

Settlement:

```text
Bond → SLASHED
```

assuming this violation meets the commitment's predefined slashing conditions.

---

## 28. Example — Recipient Failure

Mandate:

```text
Recipient: Treasury
```

Actual:

```text
Recipient: Unexpected wallet
```

Even if:

```text
Spend ✓
Output ✓
Deadline ✓
```

the result is:

```text
FAIL
```

because the financial commitment was not fulfilled.

---

## 29. Example — Deadline Failure

Mandate:

```text
Deadline: 14:01:00
```

Actual execution:

```text
14:01:13
```

Result:

```text
FAIL
```

The verifier must not extend the deadline because:

> "The transaction was almost on time."

The condition is objective.

---

## 30. Controlled Failure Demo

The hackathon implementation must include a safe way to demonstrate failure without relying on unpredictable market behavior.

Recommended:

```text
TEST MODE
```

Example:

```text
Commitment:
Receive ≥ 0.48 ETH

Controlled execution:
Receive 0.46 ETH
```

Then demonstrate:

```text
Authorization ✓
Transaction ✓
Verification ✕
Bond → SLASHED
```

This is substantially more convincing than hoping a live market execution naturally fails.

---

## 31. Production vs Demo Mode

Clearly separate:

```text
DEMO MODE
```

from:

```text
LIVE MODE
```

Demo mode may use:

- testnet
- mock execution evidence
- controlled token balances
- deterministic failure scenarios

But the UI must make it obvious when the system is simulated.

Never present simulated settlement as real mainnet settlement.

---

## 32. Settlement Trigger

After verification:

```text
PASS
 ↓
releaseBond(commitmentId)
```

or:

```text
COMMITMENT_VIOLATION
 ↓
slashBond(commitmentId)
```

The verifier should return a signed/authorized result or otherwise communicate with the settlement service according to the architecture.

Do not let the frontend directly decide:

```text
PASS → release
FAIL → slash
```

---

## 33. Settlement Must Be Idempotent

A commitment can only be settled once.

Example:

```text
Verification: PASS
Settlement: RELEASED
```

A second attempt must fail safely.

Likewise:

```text
FAIL → SLASHED
```

must not be slashable again.

---

## 34. Verification Result Storage

Store:

```typescript
interface StoredVerificationResult {
  id: string;

  commitmentId: string;

  transactionHash: string;

  status: string;

  classification: string;

  checks: VerificationCheck[];

  verifiedAt: number;

  evidenceVersion: string;
}
```

This creates an audit trail.

---

## 35. Verification Transparency

The user should be able to see why the commitment passed or failed.

Example:

```text
COMMITMENT FAILED

Minimum output
Required: 0.48 ETH
Received: 0.46 ETH

Maximum spend
Allowed: 1,000 USDC
Actual: 998 USDC

Recipient
Correct ✓

Deadline
Met ✓
```

This is much more trustworthy than:

> "Agent failed."

---

## 36. Verifier Must Be Boring

This component should deliberately be boring.

Do not use:

- LLM reasoning
- subjective scoring
- AI judgment
- sentiment
- market prediction
- probabilistic success
- "agent confidence"

The strongest verifier is:

```text
IF condition A
AND condition B
AND condition C
AND condition D
THEN PASS
ELSE FAIL
```

That simplicity is a feature.

---

## 37. Why This Matters for CredibleExec

The entire product proposition depends on:

```text
Agent promise
       ↓
Objective conditions
       ↓
Objective evidence
       ↓
Objective settlement
```

If any part becomes subjective:

> "AI thinks the agent did well."

the economic accountability mechanism becomes weak.

---

## 38. Future Multi-Verifier Architecture

The MVP can use one deterministic verifier.

Future architecture:

```text
                  EXECUTION
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      Verifier A  Verifier B  Verifier C
          │           │           │
          └───────────┼───────────┘
                      ▼
                    QUORUM
                      │
                      ▼
                  SETTLEMENT
```

Possible verifier implementations:

- Onchain verifier
- Indexer verifier
- Independent service
- Oracle-based verifier

This can reduce dependence on a single verifier.

---

## 39. Future Optimistic Verification

A future version could introduce:

```text
Verification result
        ↓
Challenge window
        ↓
No challenge
        ↓
Settlement
```

or:

```text
PASS
 ↓
Challenge
 ↓
Independent verification
```

This could make the system more decentralized.

Do not implement this in the MVP.

---

## 40. Future Compound Mandates

The verifier should eventually support conditions such as:

```text
actualSpend <= 10,000 USDC
AND
actualOutput >= 5 ETH
AND
recipient == Treasury
AND
executionTimestamp <= deadline
AND
gasUsed <= limit
```

Potential future representation:

```typescript
interface Condition {
  type: ConditionType;
  operator: ComparisonOperator;
  expected: string;
}
```

This provides the foundation for more expressive commitments.

---

## 41. Future Optimization Verification

Future mandates may express objectives such as:

> "Get the best execution available."

This cannot be verified using the current simple model.

A future version could define an explicit benchmark:

```text
actualOutput >= benchmarkOutput - tolerance
```

or:

```text
executionPrice <= referencePrice + tolerance
```

Any such system must define the benchmark before execution.

Do not introduce vague "best price" logic into the MVP.

---

## 42. Future Reputation

Every verified commitment can eventually contribute to:

**Agent Reputation**

Example:

```text
Commitments: 120
Fulfilled: 117
Failed: 3
Fulfillment: 97.5%
```

This enables future agent selection.

However:

> Reputation must be based on verified commitments, not agent self-reporting.

---

## 43. Future Dynamic Bonding

Verified history could eventually influence collateral requirements:

- **High reputation** → lower required bond
- **Low reputation** → higher required bond

This creates an economic feedback loop:

```text
Good execution
→ reputation
→ lower cost of commitment

Bad execution
→ slashing
→ reputation reduction
→ higher future collateral
```

Do not implement dynamic bonding in MVP.

---

## 44. Security Requirements

The verifier must:

- use immutable commitment conditions
- use blockchain-derived evidence
- use integer arithmetic
- verify chain ID
- verify executor identity
- verify transaction status
- verify actual transfers
- verify recipient
- verify deadline
- prevent evidence substitution
- prevent double settlement
- distinguish incomplete evidence from proven failure
- never rely on LLM judgment
- never accept frontend-provided "success" as authoritative

---

## 45. Testing Requirements

### Test 1 — All conditions pass
- **Expected:** `PASS`

### Test 2 — Spend exceeded
- **Expected:** `≤ 1,000 USDC`
- **Actual:** `1,001 USDC`
- **Expected:** `FAIL`, `MAX_SPEND_EXCEEDED`

### Test 3 — Output below minimum
- **Expected:** `≥ 0.48 ETH`
- **Actual:** `0.47 ETH`
- **Expected:** `FAIL`, `MIN_OUTPUT_NOT_MET`

### Test 4 — Wrong recipient
- **Expected:** `FAIL`, `WRONG_RECIPIENT`

### Test 5 — Deadline exceeded
- **Expected:** `FAIL`, `DEADLINE_EXCEEDED`

### Test 6 — Transaction reverted
- **Expected:** `EXECUTION_FAILURE` (Not automatically `COMMITMENT_VIOLATION`)

### Test 7 — Missing evidence
- **Expected:** `INCONCLUSIVE`

### Test 8 — Wrong commitment
Evidence from another commitment must be rejected.
- **Expected:** `FAIL` or `INVALID_EVIDENCE`

### Test 9 — Mandate mutation
Modify the mandate after commitment creation.
- **Expected:** `MANDATE_HASH_MISMATCH`

### Test 10 — Double settlement
Attempt `releaseBond()` twice.
- **Expected:** Second call rejected

---

## 46. MVP Scope

Implement only:

```text
SWAP
 ↓
USDC → ETH
 ↓
4 conditions
 ↓
Deterministic verification
 ↓
PASS / FAIL / INCONCLUSIVE
 ↓
Bond settlement
```

Conditions:

1. Maximum spend
2. Minimum output
3. Recipient
4. Deadline

---

## 47. MVP Non-Goals

Do not implement:

- AI-based verification
- subjective performance scores
- profit guarantees
- market-loss protection
- generalized DeFi strategy verification
- multi-verifier quorum
- optimistic challenges
- decentralized dispute courts
- cross-chain verification
- reputation
- dynamic bonding
- complex oracle infrastructure

---

## 48. Definition of Done

`10_OUTCOME_VERIFIER_SPEC.md` is complete when:

- [ ] Verifier accepts an approved commitment and execution evidence.
- [ ] Verification is deterministic.
- [ ] LLM output cannot determine PASS/FAIL.
- [ ] Maximum spend is checked.
- [ ] Minimum output is checked.
- [ ] Recipient is checked.
- [ ] Deadline is checked.
- [ ] Commitment/evidence binding is checked.
- [ ] Mandate immutability/hash binding is checked.
- [ ] Actual blockchain evidence is used.
- [ ] Transaction success is separated from commitment success.
- [ ] Infrastructure uncertainty can produce INCONCLUSIVE.
- [ ] Agent-attributable violations can be identified.
- [ ] Verification produces explainable individual checks.
- [ ] Settlement is idempotent.
- [ ] Controlled success and failure scenarios exist.
- [ ] Future multi-verifier architecture remains possible.

---

## 49. Implementation-Agent Instruction

This is one of the most critical components of the entire project.

Do not make the verifier intelligent.

**Make it objective.**

The fundamental implementation should be equivalent to:

```text
                    APPROVED PROMISE
                          │
                          ▼
                   ┌─────────────┐
                   │  BLOCKCHAIN │
                   │    FACTS    │
                   └──────┬──────┘
                          │
                          ▼
                  DETERMINISTIC CHECKS
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          Spend        Output      Recipient
             │            │            │
             └────────────┼────────────┘
                          │
                       Deadline
                          │
                          ▼
                    FINAL RESULT
                    ┌─────┴─────┐
                    ▼           ▼
                  PASS         FAIL
                    │           │
                    ▼           ▼
               RELEASE       SLASH
                 BOND          BOND
```

The key product insight should remain visible throughout implementation:

> The agent does not get to decide whether it kept its promise. The blockchain provides the evidence, and CredibleExec evaluates the promise against that evidence.

---

### Next document

`11_COMMITMENT_SETTLEMENT_SPEC.md`

This will define the final economic layer: exactly how PASS, FAIL, INCONCLUSIVE, expiration, bond release, slashing, cancellation, and edge cases transition through the smart contract. This is where we make sure the "agent puts its own money behind its promise" claim is actually enforced onchain rather than being a UI simulation.
