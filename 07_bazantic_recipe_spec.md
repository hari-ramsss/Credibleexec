# 07_BAZANTIC_RECIPE_SPEC.md
# CredibleExec — Bazantic Recipe & Agent Orchestration Specification

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_DOMAIN_MODEL.md`, `04_BOND_CONTRACT_SPEC.md`, `05_MANDATE_SPEC.md`, `06_MANDATE_COMPILER_SPEC.md`

---

## 1. Objective

Define how Bazantic is integrated into CredibleExec as the agent orchestration layer.

Bazantic must be a real functional dependency of the workflow.

It must not be added merely to:
- display a "Bazantic" badge
- make an unnecessary API call
- wrap a single LLM request
- claim sponsor integration without changing the workflow

The Recipe should turn the user's natural-language request into a repeatable financial-agent workflow that connects intent interpretation, mandate preparation, execution, evidence collection, and settlement preparation.

**Core principle**

> Bazantic orchestrates the agent workflow. CredibleExec owns the financial commitment and deterministic settlement.

---

## 2. Bazantic's Role

CredibleExec has several distinct responsibilities:

```text
USER
  ↓
BAZANTIC
  │
  ├─ Interpret request
  ├─ Resolve context
  ├─ Build mandate
  ├─ Validate workflow readiness
  └─ Orchestrate execution
        ↓
     PRIVY
        ↓
      1INCH
        ↓
   BLOCKCHAIN
        ↓
 CREDIBLEEXEC
        │
        ├─ Verify outcome
        └─ Settle commitment
```

Bazantic therefore sits primarily in the agent orchestration layer.

It does not replace:
- Privy authorization
- 1inch execution
- deterministic mandate validation
- smart-contract bond accounting
- outcome verification

---

## 3. Recipe Objective

Create a reusable Recipe representing the CredibleExec execution workflow:

```text
Natural Language Request
        ↓
Understand Intent
        ↓
Resolve Addresses / Context
        ↓
Compile Mandate
        ↓
Validate Mandate
        ↓
Create / Fund Commitment
        ↓
User Approval
        ↓
Privy Authorization
        ↓
1inch Execution
        ↓
Collect Blockchain Evidence
        ↓
Verify Outcome
        ↓
Settle Bond
```

The Recipe ensures the process follows the defined order.

---

## 4. Recipe Input

The Recipe receives:

```typescript
type RecipeInput = {
    userRequest: string;
    userId: string;
    userWallet: Address;
    chainId: number;
    defaultRecipient?: Address;
};
```

Example:

```json
{
  "userRequest": "Swap $1,000 USDC for ETH and send it to my treasury. Get at least 0.48 ETH within 60 seconds.",
  "userId": "user_123",
  "userWallet": "0xUSER...",
  "chainId": 1
}
```

---

## 5. Recipe Output

The Recipe produces a structured execution summary:

```typescript
type RecipeOutput = {
    recipeId: string;
    mandate: SwapMandate;
    commitmentId: string;
    bondStatus: "LOCKED" | "RELEASED" | "SLASHED";
    executionHash?: string;
    verificationResult: "PASS" | "FAIL";
    settlementResult: "RELEASE" | "SLASH";
    logs: RecipeLog[];
};
```

---

## 6. Recipe Stages

The Recipe is structured into 10 explicit stages:

1. **Stage 1 — Parse Intent**  
   Convert natural-language input into raw intent parameters.

2. **Stage 2 — Resolve Context**  
   Resolve token addresses, decimal precisions, and default recipients.

3. **Stage 3 — Compile Mandate**  
   Call Mandate Compiler to construct `SwapMandate`.

4. **Stage 4 — Readiness Check**  
   Validate mandate, check user wallet balance, and check agent bond availability.

5. **Stage 5 — Commitment Preparation**  
   Create un-activated commitment with registered bond requirement.

6. **Stage 6 — User Approval**  
   Present commitment card to user for explicit approval.

7. **Stage 7 — Privy Authorization**  
   Request transaction signing through Privy authorization boundary.

8. **Stage 8 — Execution**  
   Dispatch trade execution via 1inch DEX router.

9. **Stage 9 — Evidence Collection**  
   Retrieve confirmed transaction receipt and log transfers.

10. **Stage 10 — Deterministic Settlement**  
    Pass evidence to `DeterministicVerifier` and call `settleSuccess` / `settleFailure`.

---

## 7. Stage 2 — Resolve

The Recipe resolves aliases into explicit blockchain identifiers.

- `"USDC"` → `0x07865c6E87B9F70255377e024ace6630C1Eaa37F` (6 decimals)
- `"ETH"` → `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` (18 decimals)
- `"treasury"` → `0xTreasuryWalletAddress...`

Resolutions must be logged explicitly in Recipe execution steps.

---

## 8. Stage 3 — Compile Mandate

Bazantic invokes the Mandate Compiler component.

Inputs:
- resolved token parameters
- spend limits
- output minimums
- recipient
- deadline

Result:
- Validated `SwapMandate` object with `mandateHash`.

---

## 9. Stage 4 — Readiness Check

Pre-execution checks:
- Is `mandate` valid?
- Does user have sufficient `assetIn` balance?
- Has agent approved/deposited `bondAmount`?
- Is RPC node accessible?

If any check fails, abort Recipe before commitment activation.

---

## 10. Stage 5 — Commitment Preparation

The Recipe requests creation of a CredibleExec commitment.

```text
Bazantic Recipe
     ↓
CredibleExec Core API
     ↓
Commitment Created & Funded
```

Status becomes `FUNDED`.

---

## 11. Stage 6 — User Approval

Pause or checkpoint Recipe execution until user clicks **Approve & Execute**.

The UI displays:
- Spend limit
- Min output
- Recipient
- Deadline
- **Agent Bond ($100 USDC locked by agent)**

---

## 12. Stage 7 — Privy Authorization

Once approved, Recipe initiates transaction signing via Privy.

```text
BAZANTIC RECIPE
      ↓
PRIVY SDK
      ↓
Signed User Transaction
```

Privy handles key management and signing security.

---

## 13. Stage 8 — Execution

The Recipe submits signed transaction payload to 1inch.

```text
Signed Payload → 1inch Router → Mempool → Blockchain Confirmation
```

Store returned transaction hash: `txHash`.

---

## 14. Stage 9 — Evidence Collection

Retrieve transaction receipt from RPC provider.

Extract:
- `actualSpend`
- `actualOutput`
- `outputToken`
- `actualRecipient`
- `executionTime`

Normalize extracted data into `ExecutionEvidence`.

---

## 15. Stage 10 — Deterministic Settlement

Pass `SwapMandate` and `ExecutionEvidence` to CredibleExec Verifier.

```text
CredibleExec Verifier
        │
   ┌────┴────┐
   ▼         ▼
  PASS      FAIL
   │         │
   ▼         ▼
settleSuccess()  settleFailure()
   │         │
   ▼         ▼
RELEASE    SLASH
 BOND       BOND
```

The verifier result dictates smart contract settlement call.

---

## 16. Failure Handling

Recipes must classify errors explicitly:

- **Agent Failure (Slash Bond):**
  - Minimum output violated (`actualOutput < minOutput`)
  - Spend limit exceeded (`actualSpend > maxSpend`)
  - Wrong recipient (`actualRecipient != recipient`)

- **External / System Failure (Do Not Slash):**
  - RPC node timeout
  - 1inch API downtime
  - Chain congestion / dropped transaction before execution

---

## 17. Recipe State

Track stage progress using explicit state Machine:

```typescript
type RecipeState =
    | "INITIALIZED"
    | "INTENT_PARSED"
    | "MANDATE_COMPILED"
    | "COMMITMENT_PREPARED"
    | "AWAITING_USER_APPROVAL"
    | "EXECUTING"
    | "EVIDENCE_COLLECTED"
    | "VERIFIED"
    | "SETTLED"
    | "FAILED";
```

---

## 18. Idempotency

Every stage execution must be idempotent.

If a network timeout occurs during Stage 9 (Evidence Collection), retrying Stage 9 must re-query the transaction receipt without re-submitting trade to 1inch.

---

## 19. Recipe Tool Boundaries

Bazantic uses specialized tools:

- `parseIntentTool`
- `compileMandateTool`
- `createCommitmentTool`
- `execute1inchTool`
- `fetchReceiptTool`
- `settleCommitmentTool`

Tools must have strict TypeScript schemas.

---

## 20. No Arbitrary Transaction Generation

Bazantic must not generate arbitrary bytecode or transactions outside compiled mandate boundaries.

All transactions dispatched to Privy must match `SwapMandate` constraints.

---

## 21. Recipe and Mandate Separation

- **Recipe:** The workflow orchestration steps (how we get from start to finish).
- **Mandate:** The immutable financial contract (what must be delivered).

Modifying the Recipe steps does not change the onchain commitment conditions.

---

## 22. Example Complete Workflow

```text
Bazantic Recipe Execution Sequence:
 1. Parse request ("Swap $1000 USDC for ETH...")
 2. Resolve USDC address
 3. Resolve ETH address
 4. Resolve Treasury address
 5. Resolve 60-second deadline
 6. Compile mandate
 7. Validate mandate
 8. Show user commitment card
 9. User approves execution
10. Create/fund commitment onchain
11. Request Privy authorization
12. Execute trade through 1inch
13. Collect transaction evidence from RPC
14. Deterministically verify outcome against mandate
15. Settle bond (Release or Slash)
```

---

## 23. User-Facing Experience

The frontend renders Bazantic stage progression visually:

```text
[✓] Step 1: Request Understood
[✓] Step 2: Mandate Compiled
[✓] Step 3: Agent Bond Locked ($100 USDC)
[●] Step 4: Executing via 1inch...
[ ] Step 5: Verifying Outcome
[ ] Step 6: Final Settlement
```

---

## 24. Bazantic Sponsor Demonstration

The hackathon demo should explicitly demonstrate that Bazantic is materially useful:

1. **Multi-Step Orchestration:** Show workflow execution through structured Recipe stages rather than one black-box script.
2. **Error Recovery:** Demonstrate automatic fallback or clean state handling when RPCs delay receipts.
3. **Traceability:** Provide full step-by-step logs of agent reasoning and tool calls.

---

## 25. Recipe Should Be Repeatable

Given the same natural-language prompt under identical market conditions, the Recipe must execute identical steps:

```text
Prompt → Intent → Mandate → Commitment → Execution → Settlement
```

---

## 26. Recipe Error UX

If Recipe fails at Stage 4 (Readiness Check), display user-friendly message:

> "Insufficient USDC balance in wallet. Please top up your wallet to proceed."

Do not display raw stack traces or internal agent errors.

---

## 27. Logging

Every stage transition must emit a structured log:

```json
{
  "recipeId": "rec_89f12",
  "stage": "STAGE_3_COMPILE_MANDATE",
  "timestamp": 1757466000,
  "status": "SUCCESS",
  "data": {
    "mandateHash": "0x4a8b..."
  }
}
```

---

## 28. Observability

Provide real-time telemetry feed to the frontend over WebSockets / Server-Sent Events (SSE) so users can watch the agent execute in real-time.

---

## 29. Future Recipe Extensions

Future recipes can extend the same framework:
- **Recurring DCA Recipe:** Trigger Recipe on cron schedule.
- **Cross-Chain Swap Recipe:** Add multi-chain bridge stage before 1inch trade.
- **Treasury Rebalance Recipe:** Evaluate multiple wallet balances before mandate compilation.

---

## 30. Explicit Non-Goals

Do not implement in MVP:
- Complex multi-agent bargaining inside Recipe
- Dynamic Recipe step generation at runtime
- Offchain LLM-based outcome settlement

---

## 31. Testing Requirements

Unit & Integration Tests required:
- `test_recipe_full_success_flow()`
- `test_recipe_failure_slashing_flow()`
- `test_recipe_readiness_failure_aborts_early()`
- `test_recipe_idempotent_retry()`

---

## 32. MVP Architecture

```text
┌────────────────────────────────────────┐
│             FRONTEND UI                │
└───────────────────┬────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│           BAZANTIC RECIPE              │
│  (Orchestration & Workflow Tools)      │
└─────────┬────────────────────┬─────────┘
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│   PRIVY SDK /    │  │  CREDIBLEEXEC    │
│ 1INCH EXECUTION  │  │  CORE & VERIFIER │
└──────────────────┘  └──────────────────┘
```

---

## 33. Definition of Done

`07_BAZANTIC_RECIPE_SPEC.md` is complete when:
- [ ] Bazantic is a genuine orchestration dependency.
- [ ] Recipe creates/prepares a CredibleExec commitment.
- [ ] Bond settlement is handled by the CredibleExec settlement path.
- [ ] Bazantic Recipe can be compared against the non-Recipe baseline.

Do not implement Bazantic as a superficial wrapper around an LLM.

> Bazantic should orchestrate that workflow, while CredibleExec remains responsible for the financial commitment, deterministic outcome verification, and bond settlement.
