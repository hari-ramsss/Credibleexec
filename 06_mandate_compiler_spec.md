# 06_MANDATE_COMPILER_SPEC.md
# CredibleExec — Mandate Compiler Specification

- **Version:** 1.0
- **Status:** Implementation Specification
- **Depends on:** `01_PRODUCT_CONSTITUTION.md`, `02_SYSTEM_ARCHITECTURE.md`, `03_DOMAIN_MODEL.md`, `04_BOND_CONTRACT_SPEC.md`, `05_MANDATE_SPEC.md`

---

## 1. Objective

Define the exact mechanism that converts a user's natural-language financial request into a structured, deterministic, reviewable mandate that can later become a CredibleExec commitment.

The compiler is responsible for understanding the user's intent.

It is not responsible for deciding whether the commitment succeeded or failed.

**Core pipeline**

```text
USER REQUEST
     ↓
INTENT EXTRACTION
     ↓
MANDATE GENERATION
     ↓
DETERMINISTIC VALIDATION
     ↓
NORMALIZATION
     ↓
USER REVIEW
     ↓
COMMITMENT CREATION
```

Example:

User:
> "Swap $1,000 USDC for ETH and send it to my treasury.  
> I need at least 0.48 ETH within a minute."

                     ↓

```json
{
  "type": "SWAP",
  "assetIn": "USDC",
  "assetOut": "ETH",
  "maxSpend": "1000000000",
  "minOutput": "480000000000000000",
  "recipient": "0x...",
  "deadline": "...",
  "executionVenue": "1inch"
}
```

The user must see and approve this structured interpretation before a commitment is created.

---

## 2. Design Principles

The compiler MUST follow these principles.

### 2.1 AI interprets; deterministic code validates

The AI (LLM / Bazantic workflow) extracts intent parameters.

Deterministic code validates:
- address formats
- balance sufficiency
- logical bounds
- deadline minimums
- asset support

The AI must not be the final authority on whether a mandate is valid.

### 2.2 Never silently invent missing information

If the user request is ambiguous:

> "Swap some USDC for ETH."

The compiler must not invent:
- `minOutput = 0.48 ETH`
- `recipient = 0x000...`
- `deadline = 60s`

It must reject the input or request clarification.

### 2.3 User confirmation is mandatory

The extracted mandate must be displayed back to the user in human-readable form before commitment creation.

Silently executing an AI interpretation without user confirmation is strictly prohibited.

---

## 3. Compiler Input

The compiler receives:

```typescript
type CompilerInput = {
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
  "userRequest": "Swap 1000 USDC for ETH and send it to my treasury. Get at least 0.48 ETH within 60s.",
  "userId": "user_123",
  "userWallet": "0xABC...",
  "chainId": 1
}
```

---

## 4. Compiler Output

The compiler produces a `CompilationResult`:

```typescript
type CompilationResult = 
    | { status: "SUCCESS"; mandate: SwapMandate; summary: MandateSummary }
    | { status: "CLARIFICATION_NEEDED"; questions: string[] }
    | { status: "ERROR"; code: MandateCompilerErrorCode; message: string };
```

---

## 5. Mandate Schema

The generated mandate follows `SwapMandate`:

```typescript
type SwapMandate = {
    version: 1;
    type: "SWAP";
    assetIn: Address;
    assetOut: Address;
    maxSpend: bigint;
    minOutput: bigint;
    recipient: Address;
    deadline: number;
    executionVenue: "1inch";
};
```

---

## 6. Human-Readable Summary

Alongside the raw mandate object, produce a `MandateSummary` for the UI:

```typescript
type MandateSummary = {
    action: string;             // "Swap USDC for ETH"
    maxSpendDisplay: string;    // "1,000 USDC"
    minOutputDisplay: string;   // "0.48 ETH"
    recipientDisplay: string;   // "Treasury (0x123...)"
    deadlineDisplay: string;    // "60 seconds"
};
```

---

## 7. Compiler Pipeline

The compilation process is structured into 6 sequential stages:

```text
Stage 1: Intent Extraction (LLM / Bazantic)
   ↓
Stage 2: Entity Resolution (Token symbols -> Contract Addresses)
   ↓
Stage 3: Amount Conversion (Decimals -> Base Units / Wei)
   ↓
Stage 4: Validation (Schema, Logical, Bounds)
   ↓
Stage 5: Canonicalization (Deterministic Serialization & Hashing)
   ↓
Stage 6: Summary Generation (Human-Readable UI Payload)
```

---

## 8. Stage 3 — Entity Resolution

Token symbols must resolve to checksummed contract addresses.

- `"USDC"` → `0x07865c6E87B9F70255377e024ace6630C1Eaa37F`
- `"ETH"` / `"WETH"` → `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`

Unrecognized symbols must cause `UNSUPPORTED_ASSET` compilation error.

---

## 9. Recipient Resolution

Resolves recipient targets:

- Explicit address: `"0x123..."` → `0x123...`
- Alias: `"my treasury"` → `defaultRecipient` provided in input context

If `"treasury"` cannot be resolved to a non-zero address, return `MISSING_RECIPIENT`.

---

## 10. Deadline Resolution

Converts relative durations into absolute timestamps.

- `"60 seconds"` → `currentTime + 60`
- `"1 minute"` → `currentTime + 60`
- `"5 minutes"` → `currentTime + 300`

Minimum deadline allowed: **15 seconds**  
Maximum deadline allowed: **24 hours**

---

## 11. Ambiguity Handling

When intent is missing critical financial boundaries:

User:
> "Buy me some ETH."

Compiler returns:

```typescript
{
    status: "CLARIFICATION_NEEDED",
    questions: [
        "How much USDC do you want to spend?",
        "What is the minimum amount of ETH you want to receive?"
    ]
}
```

---

## 12. Do Not Guess Financial Constraints

The compiler MUST NOT guess parameters for missing financial constraints.

**PROHIBITED:**
- Defaulting `maxSpend` to full wallet balance.
- Setting `minOutput` based on current spot market rate without user consent.
- Setting `recipient` to the agent's own wallet address.

---

## 13. Why Measurable Constraints Matter

For an outcome verifier to work, constraints must be objectively verifiable on-chain:

| Vague Request (REJECT) | Measurable Mandate (ACCEPT) |
| --- | --- |
| "Swap for a good price" | `minOutput >= 0.48 ETH` |
| "Send it to my wallet quickly" | `deadline <= currentTime + 60` |
| "Don't spend too much" | `maxSpend <= 1000 USDC` |

---

## 14. Validation Pipeline

Deterministic code checks:

1. **Schema Check:** All required fields present.
2. **Address Check:** Non-zero, valid EVM hex checksums.
3. **Amount Check:** `maxSpend > 0`, `minOutput > 0`.
4. **Deadline Check:** `deadline > currentTime + 15s`.
5. **Logic Check:** `assetIn != assetOut`.

---

## 15. JSON Schema Validation

Validate raw JSON output using JSON schema before instantiation:

```json
{
  "type": "object",
  "required": ["version", "type", "assetIn", "assetOut", "maxSpend", "minOutput", "recipient", "deadline"],
  "properties": {
    "version": { "const": 1 },
    "type": { "const": "SWAP" },
    "assetIn": { "type": "string" },
    "assetOut": { "type": "string" },
    "maxSpend": { "type": "string" },
    "minOutput": { "type": "string" },
    "recipient": { "type": "string" },
    "deadline": { "type": "integer" }
  }
}
```

---

## 16. Asset Validation

Ensure `assetIn` and `assetOut` are supported on target `chainId`.

Rejections:
- `assetIn == assetOut` → `SAME_ASSET_SWAP`
- Unknown token symbol → `UNSUPPORTED_ASSET`

---

## 17. Amount Validation

Amounts must be converted to base units according to token decimals:

- USDC (6 decimals): `1000` → `1000000000`
- ETH (18 decimals): `0.48` → `480000000000000000`

Floating-point representations in final mandate are prohibited.

---

## 18. Recipient Validation

Check:
- `recipient != address(0)`
- `recipient` is valid 20-byte EVM address format.

---

## 19. Deadline Validation

Check:
- `deadline > currentTime + 15`
- `deadline <= currentTime + 86400` (24h max)

---

## 20. Cross-Field Validation

Logical check:
- `maxSpend` must not exceed user's current token balance (`INSUFFICIENT_BALANCE`).

---

## 21. Execution Venue

MVP execution venue is fixed:

```typescript
executionVenue = "1inch";
```

Future versions may support routing across Uniswap, CowSwap, or custom solvers.

---

## 22. AI Prompt Architecture

The system prompt for Bazantic / LLM intent extraction must enforce structured JSON output:

```text
System Prompt:
Extract swap intent into structured JSON.
Return JSON ONLY matching the following schema.
Do NOT generate markdown explanation.
If required fields are missing, return "clarificationNeeded".
```

---

## 23. Tool Access

Bazantic agent uses tools:
- `resolveTokenSymbol(symbol)`
- `resolveAddressAlias(alias)`
- `getCurrentTimestamp()`

---

## 24. No Chain-of-Thought Dependency

The mandate compiler output must NOT depend on LLM chain-of-thought text.

Only the structured JSON output is evaluated.

---

## 25. User Review Screen

Render extracted mandate card:

```text
┌────────────────────────────────────────┐
│           REVIEW MANDATE               │
│                                        │
│  Action: Swap USDC for ETH             │
│  Max Spend: 1,000 USDC                 │
│  Min Receive: 0.48 ETH                 │
│  Recipient: Treasury (0x123...)        │
│  Deadline: 60 seconds                  │
│                                        │
│  Agent Bond: $100 USDC                 │
│                                        │
│       [ CONFIRM & ACTIVATE ]           │
└────────────────────────────────────────┘
```

---

## 26. Confirmation Boundary

The user MUST click **Confirm & Activate**.

Until clicked, no commitment exists and no agent bond is locked.

---

## 27. Canonicalization

Deterministic serialization rule:
- Sort keys alphabetically.
- Omit whitespace outside strings.
- Compute SHA-256 / Keccak-256 hash.

```typescript
const canonicalJson = JSON.stringify(mandate, Object.keys(mandate).sort());
const mandateHash = keccak256(toUtf8Bytes(canonicalJson));
```

---

## 28. Commitment Boundary

Once confirmed:
- `SwapMandate` + `mandateHash` are registered in CredibleExec Core.
- Commitment status transitions to `CREATED`.

---

## 29. Failure Categories

Compiler returns standard error codes:
- `MISSING_ASSET_IN`
- `MISSING_ASSET_OUT`
- `MISSING_MAX_SPEND`
- `MISSING_MIN_OUTPUT`
- `MISSING_RECIPIENT`
- `MISSING_DEADLINE`
- `INVALID_ADDRESS`
- `INVALID_AMOUNT`
- `UNSUPPORTED_ASSET`
- `AMBIGUOUS_INTENT`

---

## 30. MVP Supported Language

MVP focuses on English financial requests:
- *"Swap X for Y"*
- *"Buy X with Y"*
- *"Exchange X to Y"*

---

## 31. MVP Unsupported Requests

Reject unsupported complex intents:
- *"Buy ETH if price drops 5%"* (Conditional)
- *"Swap $100 every week"* (Recurring)
- *"Bridge USDC to Arbitrum and buy ETH"* (Cross-chain)

---

## 32. Bazantic Integration

Bazantic orchestrates the compilation workflow:

```text
Bazantic Agent Step 1: LLM Intent Extraction
Bazantic Agent Step 2: Resolve Token Addresses via Tool
Bazantic Agent Step 3: Run Mandate Compiler Validation
Bazantic Agent Step 4: Output Mandate Summary to UI
```

---

## 33. Bazantic Must Not Decide Settlement

Bazantic compiles the mandate before execution.

Bazantic does NOT evaluate outcome after execution.

Outcome evaluation is strictly performed by `DeterministicVerifier`.

---

## 34. Testing Requirements

Unit tests required for Compiler:
- `test_valid_swap_compilation()`
- `test_missing_min_output_triggers_clarification()`
- `test_invalid_address_rejection()`
- `test_decimal_conversion_accuracy()`
- `test_canonical_hash_reproducibility()`

---

## 35. Security Requirements

- Prevent prompt injection attacks from overriding spend limits.
- Sanitize inputs to prevent malicious address injection.
- Validate checksums on all EVM addresses.

---

## 36. MVP vs Future

| Capability | MVP | Future |
| --- | --- | --- |
| **Mandate Types** | Single-step SWAP | Multi-step, Cross-chain, DCA |
| **Language** | English | Multi-lingual |
| **Venue** | 1inch fixed | Multi-venue routing |
| **Constraints** | Hard limits | Soft/Optimized constraints |

---

## 37. Explicit Non-Goals

Do not implement in MVP:
- Natural-language settlement evaluation
- Automated market-rate guessing
- Multi-token bundle swaps

---

## 38. Definition of Done

`06_mandate_compiler_spec.md` is complete when:
- [ ] Intent extraction correctly converts text to `SwapMandate`.
- [ ] Schema & logical validation rejects invalid intents.
- [ ] Token amounts accurately convert to base units (wei / USDC units).
- [ ] User review payload (`MandateSummary`) generates cleanly.
- [ ] Canonical `mandateHash` matches across frontend/backend.
