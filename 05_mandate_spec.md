05_MANDATE_SPEC.md
CredibleExec — Financial Mandate Specification

Version: 1.0
Status: Implementation Specification
Depends on: 01_PRODUCT_CONSTITUTION.md, 02_SYSTEM_ARCHITECTURE.md, 03_DOMAIN_MODEL.md, 04_BOND_CONTRACT_SPEC.md

---

## 1. Purpose

This document defines the financial mandate system of CredibleExec.

The mandate is the bridge between:

```text
Human intention
      ↓
AI interpretation
      ↓
Machine-verifiable financial commitment
```

The mandate answers:
> "What exactly did the agent agree to accomplish?"

This is one of the most important parts of the entire product.

The bond gives the promise economic weight.

The mandate gives the promise precise meaning.

---

## 2. Core Principle

A mandate must be:

> Specific enough that an independent system can determine whether it was fulfilled.

Avoid vague requirements such as:
- "Get me a good price."
- "Get the best deal."
- "Do this quickly."
- "Make a profitable trade."
- "Use the best route."

These are understandable to humans but not objectively settleable.

Instead:
- "Receive at least 0.48 ETH."
- "Spend no more than 1,000 USDC."
- "Send the result to Treasury A."
- "Complete within 60 seconds."

These can be checked against blockchain evidence.

---

## 3. The Mandate Lifecycle

```text
USER REQUEST
     ↓
AI INTERPRETATION
     ↓
STRUCTURED MANDATE
     ↓
MANDATE VALIDATION
     ↓
USER REVIEW
     ↓
USER CONFIRMATION
     ↓
COMMITMENT
     ↓
EXECUTION
```

The mandate must exist before the financial execution begins.

---

## 4. Mandate vs Commitment

These terms must never be conflated.

### Mandate
The financial objective and constraints.
> "Spend at most $1,000 and receive at least 0.48 ETH."

### Commitment
The agent formally accepts responsibility for fulfilling that mandate and posts collateral.

```text
MANDATE
   ↓
Agent accepts
   ↓
COMMITMENT
   +
BOND
```

Therefore:

> The mandate defines the promise. The commitment makes the promise economically accountable.

---

## 5. MVP Mandate Type

The MVP should support one primary mandate type:
- **SWAP**

Example:
- USDC → ETH

This keeps the implementation focused.

However, the data model should be structured so additional mandate types can be introduced later.

---

## 6. MVP Mandate Structure

The canonical MVP mandate is:

```typescript
type SwapMandate = {
    id: string;

    type: "SWAP";

    assetIn: Address;
    assetOut: Address;

    maxSpend: bigint;
    minOutput: bigint;

    recipient: Address;

    deadline: number;

    executionVenue?: string;
};
```

---

## 7. Meaning of Each Field

### `id`
Unique identifier for the mandate.

Example:
- `mandate_001`

### `type`
Identifies the mandate category.

MVP:
- `SWAP`

### `assetIn`
The asset the user wants to spend.

Example:
- USDC

### `assetOut`
The asset the user wants to receive.

Example:
- ETH

### `maxSpend`
Maximum amount the execution is allowed to spend.

Example:
- 1,000 USDC

The verifier checks:
- `actualSpend <= maxSpend`

### `minOutput`
Minimum acceptable amount received.

Example:
- 0.48 ETH

The verifier checks:
- `actualOutput >= minOutput`

### `recipient`
The address that must receive the resulting asset.

Example:
- Treasury A

Verifier:
- `actualRecipient == requiredRecipient`

### `deadline`
The latest acceptable execution time.

Example:
- 60 seconds from activation

### `executionVenue`
Optional execution restriction.

MVP can set:
- 1inch

or leave it as execution metadata depending on how the transaction is constructed.

Do not make this unnecessarily complicated.

---

## 8. Canonical Example

User says:
> "Swap $1,000 USDC for ETH and send it to my treasury. I need at least 0.48 ETH within 60 seconds."

The agent generates:

```json
{
  "type": "SWAP",
  "assetIn": "USDC",
  "assetOut": "ETH",
  "maxSpend": "1000",
  "minOutput": "0.48",
  "recipient": "0xTREASURY",
  "deadline": 60,
  "executionVenue": "1inch"
}
```

The user sees a human-friendly version:

becomes:
- Swap 1,000 USDC → ETH
- Receive at least 0.48 ETH
- Send to Treasury
- Complete within 60 seconds

---

## 9. The Four Core Constraints

The MVP mandate should contain four primary constraints.

- **MAX SPEND**
- **MIN OUTPUT**
- **RECIPIENT**
- **DEADLINE**

Together they are substantially stronger than a simple swap instruction.

---

## 10. Why We Need More Than Minimum Output

If CredibleExec only said:
- `minOutput >= X`

a judge could reasonably argue:
> "Isn't this basically just a limit order?"

The mandate should therefore represent a compound financial commitment.

Example:

```text
             COMMITMENT
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Spend ≤ X   Output ≥ Y   Recipient = Z
                  │
                  ▼
             Deadline ≤ T
```

The agent isn't simply promising a price.

It is accepting responsibility for a specific financial outcome under multiple conditions.

---

## 11. Constraint Categories

The architecture should recognize three categories.

### Financial constraints
- `maxSpend`
- `minOutput`

### Destination constraints
- `recipient`

### Temporal constraints
- `deadline`

Future versions can add:
- `executionVenue`
- `slippage`
- `price range`
- `asset restrictions`
- `gas limit`

---

## 12. Hard vs Soft Requirements

The MVP should use only hard requirements.

A hard requirement means:

> Either the condition is satisfied or it isn't.

Example:
- `minOutput >= 0.48 ETH`

There should be no ambiguity.

Avoid MVP concepts such as:
- "prefer a cheaper route"
- "try to execute quickly"
- "ideally receive more"

These can be introduced later as optimization objectives.

---

## 13. Mandate Validation

Every mandate must pass validation before becoming a commitment.

Validation happens in two stages:

```text
AI-generated mandate
        ↓
Schema validation
        ↓
Financial/logical validation
        ↓
User review
```

---

## 14. Schema Validation

Required:
- `assetIn`
- `assetOut`
- `maxSpend`
- `minOutput`
- `recipient`
- `deadline`

Missing values must cause rejection.

Example:

```json
{
  "assetIn": "USDC",
  "assetOut": "ETH",
  "maxSpend": "1000"
}
```

Result:
- `INVALID_MANDATE`

Missing:
- `minOutput`
- `recipient`
- `deadline`

---

## 15. Address Validation

The system must verify:
- `assetIn` is valid address
- `assetOut` is valid address
- `recipient` is valid address

Reject:
- `0x0000000000000000000000000000000000000000`

where inappropriate.

---

## 16. Amount Validation

Require:
- `maxSpend > 0`
- `minOutput > 0`

Reject:
- `maxSpend = 0`
- `minOutput = 0`

Avoid floating-point arithmetic for token amounts.

Use integer/base-unit representation internally.

---

## 17. Decimal Handling

The UI may display:
- 0.48 ETH

becomes:

but the system should internally use the token's smallest unit.

For ETH:
- 0.48 ETH → `480000000000000000 wei`

For USDC:
- 1,000 USDC → `1000000000` (assuming 6 decimals)

The mandate model should therefore use:
- `bigint`

rather than JavaScript floating-point numbers for financial amounts.

---

## 18. Deadline Validation

The deadline must be:
- `deadline > current time`

For MVP:
- `deadline = activationTime + requestedDuration`

Example:
- 60 seconds

becomes an absolute timestamp when the commitment is created/activated.

---

## 19. Maximum Deadline

The MVP should optionally enforce a reasonable maximum duration.

For example:
- maximum commitment lifetime = 10 minutes

This prevents an accidental request such as:
> "Execute this within 300 years."

The exact limit can be configured.

---

## 20. Logical Consistency

The mandate must represent a meaningful operation.

Reject obviously invalid cases such as:
- `assetIn == assetOut`

unless the product explicitly supports it.

Also reject:
- `recipient` = zero address

and invalid amount relationships.

---

## 21. User Confirmation Boundary

The user must see the interpreted mandate before execution.

This is mandatory.

Flow:

User:
> "Swap $1,000 USDC for ETH..."

        ↓

Agent interpretation

        ↓

```text
┌────────────────────────────┐
│ Here's what I understood:  │
│                            │
│ Spend ≤ $1,000             │
│ Receive ≥ 0.48 ETH         │
│ Recipient = Treasury       │
│ Deadline = 60 sec          │
└────────────────────────────┘
```

        ↓

USER CONFIRMS

        ↓

COMMITMENT

The AI must not silently turn its interpretation into a financial commitment.

---

## 22. Ambiguous Request Handling

Suppose the user says:
> "Buy me some ETH at a good price."

The agent should not invent the missing constraint.

Instead:
> "What is the minimum amount of ETH you want to receive?"

Or:
> "What is the maximum USDC you're willing to spend?"

The agent should ask for clarification when objective settlement conditions are missing.

---

## 23. Example: Good Request

> "Swap 1,000 USDC for ETH.  
> Receive at least 0.48 ETH.  
> Send it to Treasury A.  
> Complete within 60 seconds."

Can become a commitment.

---

## 24. Example: Bad Request

> "Get me the best possible ETH price."

Cannot become a commitment without defining:
- minimum output
- maximum spend

---

## 25. Example: Dangerous Request

> "Trade my USDC however you think is best."

The agent should not automatically generate an unrestricted mandate.

Instead it should request explicit boundaries.

---

## 26. Agent Interpretation Requirements

The AI should extract:
- `assetIn`
- `assetOut`
- `amount`/`maxSpend`
- `minOutput`
- `recipient`
- `deadline`

It must distinguish between:
- Explicit user constraints

and:
- Agent assumptions

The agent should never present an assumption as though the user specified it.

---

## 27. Assumption Handling

If the user says:
> "Send it to my treasury."

and the system has a previously configured treasury address:
- Treasury = `0xABC...`

the UI should make the resolved address visible in an appropriate human-readable form.

Example:
- **Recipient:** Treasury wallet

Advanced view:
- `0xABC...123`

The user should be able to verify the destination before approval.

---

## 28. Mandate Preview

The frontend should display the mandate as a financial commitment card.

Example:

```text
┌───────────────────────────────────┐
│         AGENT COMMITMENT           │
│                                   │
│  Swap                             │
│  1,000 USDC → ETH                 │
│                                   │
│  Minimum received                 │
│  0.48 ETH                         │
│                                   │
│  Recipient                        │
│  Treasury                         │
│                                   │
│  Deadline                         │
│  60 seconds                       │
│                                   │
│  Agent collateral                 │
│  $100                             │
│                                   │
│     [ APPROVE & EXECUTE ]         │
└───────────────────────────────────┘
```

This is the primary user-facing representation of the mandate.

---

## 29. Canonical Representation

Once confirmed, the mandate must be serialized deterministically.

Conceptually:

```typescript
type CanonicalMandate = {
    version: 1;

    type: "SWAP";

    assetIn: Address;
    assetOut: Address;

    maxSpend: bigint;
    minOutput: bigint;

    recipient: Address;

    deadline: number;
};
```

The `version` field is important.

Future versions can evolve the mandate format:
- version 1
- version 2
- version 3

without breaking historical commitments.

---

## 30. Mandate Versioning

MVP:
- `version = 1`

Do not implement multiple versions yet.

But always store the version explicitly.

Future:
- V1 → basic swap
- V2 → compound constraints
- V3 → recurring commitments

---

## 31. Mandate Hash

The canonical mandate can be hashed:

```text
id="l4g3rh"
mandateHash = hash(canonicalMandate)
```

This hash can be associated with the commitment.

Conceptually:

```text
Natural language
      ↓
Structured mandate
      ↓
Canonical serialization
      ↓
Hash
      ↓
Commitment
```

This creates a strong binding between:
> what the user approved

and:
> what the protocol evaluates.

---

## 32. Do Not Hash Raw Natural Language

Do not make:
- `hash("Swap some ETH please...")`

the primary commitment identity.

Natural language can contain:
- punctuation changes
- synonyms
- formatting differences
- ambiguous phrasing

Instead hash the canonical structured representation.

---

## 33. Example Canonical Mandate

Conceptually:

```json
{
  "version": 1,
  "type": "SWAP",
  "assetIn": "0xUSDC",
  "assetOut": "0xWETH",
  "maxSpend": "1000000000",
  "minOutput": "480000000000000000",
  "recipient": "0xTREASURY",
  "deadline": 1757466060
}
```

This is the authoritative representation.

---

## 34. Mandate → Commitment

Once the user approves:

```text
MANDATE
   │
   ├── mandateHash
   │
   ▼
COMMITMENT
   │
   ├── commitmentId
   ├── agent
   ├── bond
   └── mandate
```

The commitment should preserve the conditions required for settlement.

---

## 35. Execution Venue

MVP execution:
- 1inch

The mandate may contain:
- `executionVenue = 1inch`

However, do not make the entire domain model fundamentally dependent on 1inch.

Future:

```text
ExecutionRouter
 ├── 1inch
 ├── DEX B
 ├── Payment Rail
 └── Other Provider
```

The mandate describes the desired outcome.

The execution layer determines how to achieve it within permitted constraints.

---

## 36. Mandate vs Execution Strategy

This distinction is important.

The user says:
> "Receive at least 0.48 ETH."

That is the mandate.

The agent decides:
> "I will use 1inch route X."

That is the execution strategy.

Therefore:

```text
MANDATE
"What must be achieved?"

        ↓

STRATEGY
"How should I attempt it?"

        ↓

EXECUTION
"What actually happened?"
```

The agent may change its strategy before execution, provided it remains within the user's mandate.

---

## 37. Strategy Flexibility

For example:

Mandate:
- Receive ≥ 0.48 ETH
- Spend ≤ 1,000 USDC

The agent might find:
- Route A

then decide:
- Route B

if Route B still satisfies the mandate.

This is one reason CredibleExec is more than a static transaction.

The agent has freedom over how to execute while remaining accountable for what it promised.

---

## 38. Future Mandate Type — Payment

A future mandate could be:
> "Pay Vendor A 5,000 USDC by 5 PM."

Structured:

```typescript
{
    type: "PAYMENT",
    asset: "USDC",
    amount: 5000,
    recipient: vendor,
    deadline: timestamp
}
```

Same commitment infrastructure.

---

## 39. Future Mandate Type — Treasury Transfer

Example:
> "Move 20,000 USDC from operating wallet to treasury wallet before the end of the day."

```text
TRANSFER
```

The same:
- Bond
- Verification
- Settlement

can be reused.

---

## 40. Future Mandate Type — Recurring Purchase

Example:
> "Buy $500 of ETH every Monday for the next 12 weeks."

This would introduce:
- Schedule
- Repeated commitments

without fundamentally changing the concept.

---

## 41. Future Mandate Type — Cross-Chain

Example:
> "Move 5,000 USDC from Base to Arbitrum and deliver at least 4,950 USDC to Treasury B."

Future mandate:
- `sourceChain`
- `destinationChain`
- `maxSpend`
- `minOutput`
- `recipient`
- `deadline`

The core model remains:

```text
MANDATE
→ EXECUTION
→ EVIDENCE
→ VERIFICATION
→ SETTLEMENT
```

---

## 42. Future Compound Conditions

The future mandate system can evolve into:

```text
MANDATE
 │
 ├── Financial conditions
 │
 ├── Recipient conditions
 │
 ├── Time conditions
 │
 ├── Venue conditions
 │
 ├── Risk conditions
 │
 └── Asset conditions
```

Example:
> "Spend no more than 10,000 USDC, receive at least 4.8 ETH, send only to Treasury A, execute within 2 minutes, and use an approved venue."

---

## 43. Future Optimization Objectives

Once hard constraints are established, the agent can optimize inside them.

Example:

**HARD:**
- Spend ≤ $1,000
- Receive ≥ 0.48 ETH
- Recipient = Treasury
- Deadline ≤ 60 sec

**OPTIMIZE:**
- Minimize gas
- Maximize output
- Minimize execution time

This is a much more powerful architecture.

The agent has:
> freedom within constraints

rather than:
> unrestricted financial authority

---

## 44. Future Conditional Commitments

A future mandate could contain:
> `IF ETH price < $4,000 THEN execute`

or:
> `IF Treasury balance < $10,000 THEN refill Treasury`

This moves toward autonomous treasury management.

Not MVP.

---

## 45. Future Agent Negotiation

Eventually the agent could propose:

User:
> "Get me at least 0.48 ETH."

Agent:
> "I can accept this with a $100 bond."

User:
> "Accepted."

This would turn the mandate into a negotiated economic commitment.

Again, future only.

---

## 46. MVP Mandate JSON Schema

The implementation should ultimately validate approximately:

```json
{
  "type": "object",
  "required": [
    "version",
    "type",
    "assetIn",
    "assetOut",
    "maxSpend",
    "minOutput",
    "recipient",
    "deadline"
  ],
  "properties": {
    "version": {
      "type": "integer"
    },
    "type": {
      "const": "SWAP"
    },
    "assetIn": {
      "type": "string"
    },
    "assetOut": {
      "type": "string"
    },
    "maxSpend": {
      "type": "string"
    },
    "minOutput": {
      "type": "string"
    },
    "recipient": {
      "type": "string"
    },
    "deadline": {
      "type": "integer"
    }
  }
}
```

The exact validation library will be selected during implementation.

---

## 47. Error Model

Mandate compilation/validation should return structured errors.

Example:

```typescript
type MandateError =
    | "MISSING_AMOUNT"
    | "MISSING_MIN_OUTPUT"
    | "MISSING_RECIPIENT"
    | "MISSING_DEADLINE"
    | "INVALID_ADDRESS"
    | "INVALID_AMOUNT"
    | "INVALID_DEADLINE"
    | "AMBIGUOUS_REQUEST"
    | "UNSUPPORTED_ASSET"
    | "UNSUPPORTED_OPERATION";
```

---

## 48. User-Friendly Error Messages

Never expose:
- `INVALID_ADDRESS_FORMAT`

as the primary UI message.

Instead:
> I couldn't identify the treasury wallet. Please select a recipient.

Technical error:
- `INVALID_RECIPIENT`

can remain available under technical details.

---

## 49. Mandate Security Rules

The system must:
- never silently change user constraints
- never invent missing financial limits
- never execute before confirmation
- never allow the LLM to bypass schema validation
- never allow an activated mandate to mutate
- never allow an invalid mandate to become a commitment

---

## 50. Critical Design Rule

The AI is responsible for:
> Understanding the user.

The protocol is responsible for:
> Enforcing the resulting commitment.

Therefore:

```text
AI
 ↓
Interpretation

Protocol
 ↓
Validation
 ↓
Commitment
 ↓
Verification
 ↓
Settlement
```

This separation should remain throughout the project.

---

## 51. MVP Definition of Done

The mandate system is complete when:
- Natural-language swap request can be interpreted.
- Structured mandate can be generated.
- Required fields are validated.
- Invalid/ambiguous requests are rejected or clarified.
- Financial amounts use exact integer representation.
- Deadline is represented as an absolute timestamp.
- User can review the mandate.
- User must explicitly confirm it.
- Canonical representation exists.
- Mandate hash can be generated.
- Commitment references the mandate/hash.
- Activated mandate conditions cannot be changed.
- Verifier can consume the mandate without using the LLM.
- UI can display human-readable constraints.

---

## 52. The Core Mental Model

The entire mandate system can be remembered as:

```text
                    USER
                     │
                     │
             "What I want"
                     │
                     ▼
                  AGENT
                     │
             "What I understood"
                     │
                     ▼
                 MANDATE
                     │
          "What must be achieved"
                     │
                     ▼
               COMMITMENT
                     │
           "I accept responsibility"
                     │
                     ▼
                   BOND
                     │
           "I put money behind it"
                     │
                     ▼
                EXECUTION
                     │
              "What happened?"
                     │
                     ▼
               VERIFICATION
                     │
          "Did you actually deliver?"
```

That is the core intellectual model of CredibleExec.

---

## 53. Future Vision

The long-term product should eventually allow a user to express something as simple as:
> "Handle this financial task for me."

while the system turns it into:

```text
Objective
+
Constraints
+
Deadline
+
Execution freedom
+
Economic accountability
```

The agent gets freedom to decide how to execute.

The user retains control over what outcome is acceptable.

And the agent bears economic consequences if it violates the commitment.

---

## 54. Implementation Boundary

The coding agent should not yet implement:
- generic condition DSL
- recurring mandates
- cross-chain mandates
- payment mandates
- conditional mandates
- agent negotiation
- optimization objectives
- mandate marketplace

Those are future extension points.

For the MVP, implement:

```text
SWAP
+
MAX SPEND
+
MIN OUTPUT
+
RECIPIENT
+
DEADLINE
```

and make those five concepts rock-solid.
