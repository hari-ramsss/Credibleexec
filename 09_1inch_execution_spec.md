# 09_1INCH_EXECUTION_SPEC.md
# CredibleExec — 1inch Swap & Execution Rail Specification

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_DOMAIN_MODEL.md`, `04_BOND_CONTRACT_SPEC.md`, `05_MANDATE_SPEC.md`, `06_MANDATE_COMPILER_SPEC.md`, `07_BAZANTIC_RECIPE_SPEC.md`, `08_PRIVY_INTEGRATION_SPEC.md`

---

## 1. Objective

Define how CredibleExec uses 1inch as the execution rail for the MVP financial flow.

For the MVP, 1inch is responsible for answering:

> "How do we execute this already-approved financial mandate?"

It is not responsible for:

- interpreting the user's intent
- defining the user's financial commitment
- deciding whether the agent fulfilled the commitment
- determining whether collateral should be slashed
- maintaining agent reputation
- acting as the product's accountability layer

**Core principle**

> CredibleExec defines the promise. 1inch performs the execution.

---

## 2. MVP Execution

The MVP supports exactly one primary financial operation:

```text
USDC → ETH
```

Example:

User mandate:

```text
Spend ≤ 1,000 USDC
Receive ≥ 0.48 ETH
Send to Treasury
Complete within 60 seconds
```

Execution:

```text
Mandate
   ↓
Execution Request
   ↓
1inch Quote / Execution Data
   ↓
Transaction Construction
   ↓
Privy Authorization
   ↓
Blockchain
   ↓
Execution Evidence
   ↓
CredibleExec Verification
```

---

## 3. Responsibility Boundary

The architecture must remain:

```text
BAZANTIC
"What workflow should happen?"
        ↓
MANDATE COMPILER
"What exactly did the user ask for?"
        ↓
CREDIBLEEXEC
"What did the agent promise?"
        ↓
PRIVY
"Is this action authorized?"
        ↓
1INCH
"How should the swap be executed?"
        ↓
BLOCKCHAIN
"What actually happened?"
        ↓
CREDIBLEEXEC
"Did the actual result satisfy the promise?"
```

Do not allow 1inch to redefine the mandate.

---

## 4. Execution Request

The execution layer should receive a validated mandate, not raw natural language.

Example:

```typescript
interface ExecutionRequest {
  commitmentId: string;

  chainId: number;

  assetIn: string;

  assetOut: string;

  amountIn: string;

  minOutput: string;

  recipient: string;

  deadline: number;

  executionVenue: "1INCH";
}
```

The execution layer should reject requests that have not passed mandate validation.

---

## 5. Exact Amount Semantics

For the MVP:

```text
maxSpend = maximum amount the user permits
```

The execution strategy may choose to spend less.

Example:

```text
Maximum:
1,000 USDC

Actual:
997.50 USDC
```

This can be valid if:

```text
actualSpend ≤ maxSpend
```

The system must not automatically spend the entire maximum merely because it is available.

---

## 6. Minimum Output

The mandate contains:

```text
minOutput
```

This is a commitment condition.

Example:

```text
minOutput = 0.48 ETH
```

The execution request should incorporate appropriate execution protection where supported.

However, the system must still perform independent post-execution verification.

Do not assume:

```text
1inch says transaction is valid
        =
CredibleExec commitment fulfilled
```

Those are different questions.

---

## 7. Quote Retrieval

The execution layer should request a current 1inch quote using:

- `chain`
- `tokenIn`
- `tokenOut`
- `amountIn`

The quote is used to determine whether the mandate appears executable.

Conceptually:

```text
Mandate
   ↓
1inch Quote
   ↓
Expected output
   ↓
Compare with minOutput
```

Example:

```text
Required:
≥ 0.48 ETH

Current quote:
0.4819 ETH

Result:
Potentially executable
```

If the quote is:

```text
0.46 ETH
```

the system should not blindly proceed.

Show:

> "Current execution conditions cannot satisfy your agent's commitment."

---

## 8. Quote ≠ Execution

This distinction is critical.

A quote represents an expected execution result.

The blockchain transaction represents the actual execution result.

Therefore:

```text
QUOTE
  ↓
Planning information

TRANSACTION
  ↓
Actual execution

ONCHAIN EVIDENCE
  ↓
Settlement truth
```

CredibleExec must settle using actual execution evidence rather than a quote.

---

## 9. Pre-Execution Check

Before requesting Privy authorization:

Validate:

- [x] Commitment exists
- [x] Commitment is ACTIVE
- [x] Correct chain
- [x] Correct input asset
- [x] Correct output asset
- [x] Amount within maxSpend
- [x] Current quote can satisfy minOutput
- [x] Recipient is correct
- [x] Deadline has not expired
- [x] Agent bond is locked

If any required condition fails:

> DO NOT AUTHORIZE

---

## 10. Deadline Handling

Suppose:

```text
Current time:
14:00:00

Deadline:
14:01:00
```

The execution flow must account for:

- quote retrieval
- transaction preparation
- user authorization
- transaction submission
- confirmation

A request that is already near expiry should not be presented as safely executable.

Example:

```text
14:00:58
```

If authorization is still pending, the system should handle the commitment according to its deadline policy rather than pretending execution remains safe.

---

## 11. Transaction Construction

The application should use the execution data provided by the supported 1inch integration.

Conceptually:

```text
Validated mandate
      ↓
1inch execution API
      ↓
Transaction request
      ↓
Privy
      ↓
User/agent authorization
      ↓
Blockchain
```

The LLM must never directly generate:

- `to`
- `data`
- `value`

for arbitrary transaction execution.

---

## 12. Recipient Handling

The recipient in the mandate must remain authoritative.

If:

```text
recipient = Treasury
```

then the resulting execution must deliver the output to the approved Treasury address.

The system must verify the actual recipient after execution.

Do not allow the execution provider to silently replace the destination.

---

## 13. Slippage

Slippage must not be confused with the user's commitment.

Example:

User promise:
```text
Receive ≥ 0.48 ETH
```

The execution strategy may configure suitable transaction protection around that objective.

But CredibleExec ultimately evaluates:

```text
actualOutput >= 0.48 ETH
```

This makes the financial commitment understandable:

> "The agent promised at least 0.48 ETH."

rather than:

> "The agent promised 1% slippage."

---

## 14. Example Successful Execution

Mandate:

```text
Input:
1,000 USDC

Minimum output:
0.48 ETH

Recipient:
Treasury

Deadline:
60 seconds
```

1inch execution:

```text
Actual spend:
998.20 USDC

Actual output:
0.4816 ETH

Recipient:
Treasury
```

Verifier:

```text
998.20 ≤ 1,000      ✓
0.4816 ≥ 0.48       ✓
recipient correct   ✓
deadline satisfied  ✓
```

Result:

```text
FULFILLED
```

Bond:

```text
$100 → RETURNED
```

---

## 15. Example Failed Execution

Mandate:

```text
Minimum output:
0.48 ETH
```

Actual execution:

```text
Output:
0.462 ETH
```

Verifier:

```text
0.462 < 0.48
```

Result:

```text
FAILED
```

Even if:

```text
Privy authorization ✓
1inch execution ✓
Transaction confirmed ✓
```

the commitment can still fail.

This is the core CredibleExec demonstration.

---

## 16. Execution Evidence

After the transaction is confirmed, collect objective evidence.

Minimum MVP evidence:

```typescript
interface ExecutionEvidence {
  commitmentId: string;

  transactionHash: string;

  chainId: number;

  timestamp: number;

  inputAsset: string;

  outputAsset: string;

  actualInputAmount: string;

  actualOutputAmount: string;

  recipient: string;
}
```

Additional useful fields:

- block number
- execution provider
- gas used
- transaction status

can be added where reliably available.

---

## 17. Evidence Must Come From Actual Execution

Do not use:

> LLM interpretation

as execution evidence.

Do not use:

> 1inch quote

as final evidence.

Do not use:

> frontend optimistic state

as final evidence.

Use confirmed blockchain-derived information.

---

## 18. Output Amount Verification

The verifier should determine the actual output amount from the transaction's resulting token transfers/state.

For the MVP:

```text
actualOutput
```

must represent the amount of ETH actually received by the specified recipient.

Do not simply use:

```text
quotedOutput
```

because the actual execution may differ.

---

## 19. Input Amount Verification

Similarly:

```text
actualSpend
```

must represent the actual USDC spent.

The verifier should compare:

```text
actualSpend ≤ maxSpend
```

rather than assuming the requested amount was actually spent.

---

## 20. Recipient Verification

The verifier should compare:

```text
actualRecipient
```

against:

```text
mandate.recipient
```

Example:

```text
Required:
0xTreasury

Actual:
0xTreasury

✓
```

If funds were sent somewhere else:

```text
Required:
0xTreasury

Actual:
0xOther

✕
```

The commitment must not be considered fulfilled.

---

## 21. Deadline Verification

The verifier must use a defined timestamp source.

For the MVP, use the blockchain-confirmed transaction timestamp where available.

Check:

```text
executionTimestamp ≤ commitment.deadline
```

This must be deterministic.

---

## 22. Final Verification Formula

The MVP success condition is:

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
execution corresponds to the approved commitment
```

Otherwise:

```text
FAIL
```

This logic must exist outside the LLM.

---

## 23. Do Not Over-Penalize External Failures

A major design requirement is distinguishing:

- **Agent failure**
- from: **External failure**

Examples of potentially external problems:

- RPC outage
- 1inch API outage
- chain congestion
- temporary infrastructure failure
- wallet provider outage

The MVP should have an explicit policy for these cases.

Do not blindly implement:

```text
transaction failed → slash bond
```

because that creates an unfair accountability mechanism.

---

## 24. MVP Failure Policy

For the hackathon, keep the policy simple.

### Clear commitment failure

Example:

```text
Transaction successfully executed
BUT
financial conditions not satisfied

→ FAILED

→ bond settlement can proceed.
```

### Execution/infrastructure failure

Example:

```text
Transaction never successfully executed
because an infrastructure dependency failed.

→ do not automatically classify as financial underperformance.
```

Handle according to the commitment state/expiration policy.

This limitation should be documented honestly in the demo.

---

## 25. No Mempool Claims

The MVP must not claim that CredibleExec:

- prevents sandwich attacks
- monitors the mempool
- rescues transactions before mining
- guarantees execution price
- detects malicious routing before confirmation

The 1inch integration is simply the execution rail.

Post-execution evidence is what matters for settlement.

---

## 26. No MEV Guarantee

Do not market the system as:

> "MEV protection."

The product promise is:

> Measurable fulfillment of an approved financial commitment.

The user does not need to understand MEV to use CredibleExec.

---

## 27. API Abstraction

Do not hard-code the entire application around 1inch.

Create an execution-provider abstraction:

```typescript
interface ExecutionProvider {
  getQuote(
    request: QuoteRequest
  ): Promise<Quote>;

  buildExecution(
    request: ExecutionRequest
  ): Promise<UnsignedTransaction>;

  getExecutionEvidence(
    transactionHash: string
  ): Promise<ExecutionEvidence>;
}
```

MVP implementation:

```text
OneInchExecutionProvider
```

Future:

- `UniswapExecutionProvider`
- `OtherExecutionProvider`

---

## 28. Why the Abstraction Matters

CredibleExec's core product is:

> financial commitment

not:

> 1inch swap UI

Therefore:

```text
CredibleExec
      ↓
ExecutionProvider
      ↓
1inch
```

rather than:

```text
CredibleExec
      ↓
hard-coded 1inch assumptions everywhere
```

---

## 29. Execution Status

The execution subsystem should maintain:

- `PREPARING`
- `QUOTED`
- `AWAITING_AUTHORIZATION`
- `AUTHORIZED`
- `SUBMITTED`
- `CONFIRMED`
- `REVERTED`
- `EXPIRED`
- `UNKNOWN`

This should remain separate from commitment status.

For example:

```text
Execution: CONFIRMED
Commitment: FAILED
```

is perfectly valid.

The transaction executed successfully, but the financial promise was not fulfilled.

---

## 30. User Experience During Execution

The user should see:

- **Step 1:** Preparing your agent's execution...
- **Step 2:** Checking whether the current market can satisfy the commitment...
- **Step 3:** Ready to execute.
- **Step 4:** Waiting for authorization...
- **Step 5:** Executing your swap...
- **Step 6:** Verifying whether the agent fulfilled its commitment...

This makes the process understandable without exposing infrastructure details.

---

## 31. Quote Failure UX

If current conditions cannot satisfy the mandate:

```text
Required:
≥ 0.48 ETH

Current expected:
0.46 ETH
```

show:

> The agent cannot currently satisfy its commitment.

Then offer:

- `[Try Again]`
- `[Cancel]`

Do not silently weaken:

```text
0.48 ETH
```

to:

```text
0.46 ETH
```

---

## 32. Never Mutate the Mandate to Fit the Quote

This is a critical invariant.

Bad:

```text
Mandate:
≥ 0.48 ETH

Quote:
0.46 ETH

System:
Change mandate → 0.46 ETH
```

Correct:

```text
Mandate:
≥ 0.48 ETH

Quote:
0.46 ETH

System:
Cannot currently satisfy commitment.
```

If the user wants to change the objective, create a new user-approved mandate.

---

## 33. Re-Quote Handling

Market conditions can change between:

- quote
- and: authorization

Therefore the execution layer should revalidate the quote when necessary.

But:

> Re-quoting must never change the approved financial constraints.

The only thing that can change is the execution route/price opportunity within those constraints.

---

## 34. Transaction Confirmation

Do not treat:

```text
transaction submitted
```

as:

```text
execution completed
```

Use:

```text
SUBMITTED
   ↓
CONFIRMED
   ↓
EVIDENCE COLLECTED
   ↓
VERIFIED
```

The commitment should not be settled from a transaction hash alone.

---

## 35. Idempotency

Execution requests must be idempotent.

If the backend retries after a timeout:

```text
Request #1
→ transaction submitted
→ response lost
```

Retry must not unintentionally produce:

```text
Transaction #1
Transaction #2
```

Use a commitment/execution identifier to track the operation.

---

## 36. Security Requirements

The implementation must:

- validate chain ID
- validate token addresses
- validate recipient
- validate amount
- validate deadline
- bind execution to commitment ID
- avoid arbitrary calldata from the LLM
- use trusted 1inch integration
- verify transaction receipt
- verify actual financial outcome
- prevent duplicate settlement
- never mutate approved mandates
- never treat quotes as final evidence

---

## 37. MVP Technical Boundaries

The MVP should support:

```text
Chain: ONE
Input: USDC
Output: ETH
Execution: 1inch
Wallet: Privy
Commitment: CredibleExec
Verification: Deterministic
Settlement: CredibleExec bond contract
```

Do not build multiple execution providers yet.

---

## 38. Future Extensions

The abstraction should eventually support:

- **Multiple execution venues**
  ```text
  Mandate
     ↓
  Execution Optimizer
     ├── 1inch
     ├── Uniswap
     └── Other venues
  ```
  The optimizer can choose the route while remaining constrained by the mandate.

- **Execution-quality objectives**  
  Future mandates could specify:
  - Minimum output
  - Maximum gas
  - Maximum execution time
  - Preferred venue
  - Maximum price impact  
  These must all become objectively verifiable conditions.

- **Cross-chain execution**  
  Future:
  ```text
  USDC on Chain A
         ↓
  Cross-chain execution
         ↓
  ETH on Chain B
         ↓
  Verify destination state
  ```
  This should only be introduced once the single-chain model is reliable.

- **Multiple executions**  
  A future commitment may permit up to N execution attempts while preserving the same financial objective.  
  Example:
  ```text
  Agent may retry execution
  until: deadline OR commitment fulfilled
  ```
  This requires a more sophisticated commitment state machine.

- **Execution-provider reputation**  
  Future CredibleExec reputation could track:
  - successful commitments
  - failed commitments
  - average fulfillment rate
  - average execution quality
  - bond history  
  Do not implement this in the MVP.

---

## 39. Future Agent Marketplace

Eventually, users could choose:

```text
Agent A
Fulfillment rate: 99.1%
Bond: $500

Agent B
Fulfillment rate: 96.4%
Bond: $250

Agent C
Fulfillment rate: 99.7%
Bond: $1,000
```

The user would select an agent based on:

- commitment history
- collateral
- supported mandates
- execution quality
- reputation

This turns the execution layer into a potential market for accountable financial agents.

---

## 40. What 1inch Should Look Like in the Product

1inch should feel like infrastructure.

The user should primarily see:

```text
CredibleExec
```

not:

```text
1inch trading terminal
```

The story is:

> "Your agent promised to execute a financial action. CredibleExec made that promise economically accountable, Privy authorized the action, and 1inch provided the execution route."

That is much stronger than building another swap interface.

---

## 41. Definition of Done

`09_1INCH_EXECUTION_SPEC.md` is complete when:

- [ ] MVP supports USDC → ETH.
- [ ] Execution receives a validated mandate.
- [ ] 1inch provides the execution path.
- [ ] Quotes are used only for planning/readiness.
- [ ] Quotes are never treated as final execution evidence.
- [ ] Transaction construction is separated from LLM output.
- [ ] Privy authorizes the resulting transaction.
- [ ] Transaction confirmation is tracked.
- [ ] Actual spend is captured.
- [ ] Actual output is captured.
- [ ] Recipient is verified.
- [ ] Execution timestamp is captured.
- [ ] Evidence is associated with the correct commitment.
- [ ] Deterministic verification evaluates the actual result.
- [ ] Failed financial outcomes can be demonstrated.
- [ ] External/infrastructure failures are not blindly treated as agent failures.
- [ ] Mandates cannot be weakened to accommodate unfavorable quotes.
- [ ] Execution is idempotent.
- [ ] 1inch is hidden behind an ExecutionProvider abstraction.
- [ ] Future execution venues can be added without redesigning CredibleExec.

---

## Implementation-Agent Instruction

The most important rule for this document is:

> 1inch executes the transaction. It does not define whether the agent kept its promise.

Keep the following distinction intact:

```text
1inch Quote
    ↓
"What might happen?"

Blockchain Execution
    ↓
"What actually happened?"

CredibleExec Verifier
    ↓
"Did what happened satisfy the promise?"
```

And the complete product story remains:

```text
BAZANTIC
   ↓
Understands the request

CREDIBLEEXEC
   ↓
Turns it into an accountable commitment

PRIVY
   ↓
Authorizes the action

1INCH
   ↓
Executes the financial action

BLOCKCHAIN
   ↓
Produces objective evidence

CREDIBLEEXEC
   ↓
Settles the agent's commitment
```
