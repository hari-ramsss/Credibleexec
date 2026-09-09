# CredibleExec
## Product Constitution & MVP Definition

- **Version:** 1.0
- **Status:** Foundation Document
- **Product:** CredibleExec
- **Tagline:** Make the agent put money behind its promise.

---

## 1. Purpose of This Document

This document defines the product identity, core problem, MVP boundaries, future expansion paths, user experience principles, and non-negotiable design decisions for CredibleExec.

This document must be treated as the highest-level product specification.

Any implementation decision that conflicts with this document must be reconsidered before coding.

The purpose is to prevent the development agent from:
- overbuilding
- inventing unnecessary features
- confusing authorization with accountability
- turning CredibleExec into a generic AI trading application
- turning CredibleExec into an AI wallet
- turning CredibleExec into an insurance protocol
- adding unnecessary blockchain complexity
- sacrificing UX for technical complexity

---

## 2. Product Definition

### 2.1 One-Sentence Definition

CredibleExec is a financial execution layer for autonomous AI agents where an agent accepts a measurable financial mandate, locks its own collateral behind that commitment, executes through a user-authorized wallet, and has the commitment settled based on the actual onchain outcome.

---

## 3. Core Product Idea

The fundamental problem is:

> An AI agent can be authorized to perform a financial action, but authorization does not mean the agent is accountable for fulfilling the financial objective.

For example:

A user tells an agent:
> "Swap $1,000 USDC for ETH and make sure I receive at least 0.48 ETH within 60 seconds."

A traditional agent system might verify:

```text
Is the agent allowed to spend $1,000?
        ↓
YES
        ↓
Execute transaction
```

CredibleExec introduces another question:

> Did the agent actually fulfill the commitment it accepted?

The agent therefore makes a measurable commitment:

- **Maximum spend:** 1,000 USDC
- **Minimum output:** 0.48 ETH
- **Recipient:** Treasury wallet
- **Deadline:** 60 seconds
- **Agent collateral:** 100 USDC

If the commitment is fulfilled:

```text
SUCCESS
↓
Bond returned
```

If the commitment is objectively violated:

```text
FAILURE
↓
Bond slashed
```

---

## 4. The Core Distinction

CredibleExec must not present itself as another permission system.

The architecture has four distinct responsibilities.

| Component | Responsibility |
| --- | --- |
| **Bazantic** | Agent reasoning and workflow orchestration |
| **Privy** | Wallet and authorization infrastructure |
| **1inch** | Financial execution |
| **CredibleExec** | Commitment, verification and economic settlement |

The conceptual distinction is:

- **Privy answers:** "Can the agent do this?"
- **CredibleExec answers:** "Did the agent do what it promised?"

This distinction is fundamental to the product.

---

## 5. Product Philosophy

CredibleExec follows one central philosophy:

> Permission tells an agent what it may do. Commitment makes the agent accountable for what it promises to accomplish.

The product should therefore expose:

```text
REQUEST
   ↓
PROMISE
   ↓
EXECUTION
   ↓
OUTCOME
```

The user should never need to understand:
- calldata
- RPC endpoints
- nonce management
- transaction encoding
- smart-contract internals
- routing algorithms
- verifier implementation
- gas mechanics

Those belong underneath the product.

---

## 6. Target User

The initial product is designed for users who delegate meaningful financial actions to autonomous agents.

Potential users include:

**MVP**
- individual users delegating financial execution to an agent
- users executing constrained swaps
- users experimenting with autonomous financial agents

**Future**
- businesses
- treasury operators
- DAO treasury managers
- automated payment systems
- agent-to-agent financial services
- autonomous execution providers
- financial automation platforms

The MVP does not need to support all these groups.

---

## 7. MVP User Story

The primary user story is:

> As a user, I want to delegate a financial action to an AI agent while knowing exactly what the agent promised to accomplish and knowing that the agent has economic consequences if it fails to fulfill that commitment.

---

## 8. MVP Scenario

The MVP should focus on one highly polished financial workflow.

**Recommended scenario**
USDC → ETH

Example request:
> "Swap $1,000 USDC for ETH and send it to my treasury. I want at least 0.48 ETH within 60 seconds."

The agent converts this into a structured commitment:

```json
{
  "assetIn": "USDC",
  "assetOut": "ETH",
  "maxSpend": "1000 USDC",
  "minOutput": "0.48 ETH",
  "recipient": "TREASURY",
  "deadline": "60 seconds",
  "agentBond": "100 USDC"
}
```

---

## 9. MVP User Experience

The entire user journey should feel like:

```text
WHAT DO YOU WANT?
        ↓
HERE'S WHAT YOUR AGENT PROMISED
        ↓
EXECUTE
        ↓
DID IT DELIVER?
```

### Screen 1 — Request

- **Headline:** What do you want your agent to do?
- **Input:** Swap $1,000 USDC for ETH and send it to my treasury. Get at least 0.48 ETH within 60 seconds.
- **Button:** Create Commitment

---

## 10. Screen 2 — Agent Commitment

Display:
> Here's what your agent understood

- **Spend:** ≤ 1,000 USDC
- **Receive:** ≥ 0.48 ETH
- **Recipient:** Treasury
- **Deadline:** 60 seconds

Then prominently display:

> **Agent Commitment**
> 
> **100 USDC**
> 
> The agent locks this collateral behind its promise.  
> You don't pay this.

- **Button:** Approve & Execute

This is one of the most important screens in the product.

---

## 11. Screen 3 — Execution

Display a simple progress flow:

```text
✓ Commitment created
✓ Agent collateral locked
✓ Authorization approved
● Executing
○ Verifying outcome
○ Settling commitment
```

Do not expose raw transaction mechanics by default.

Advanced technical information can exist behind:
> *View technical details*

---

## 12. Screen 4 — Successful Settlement

Example:

```text
Commitment Fulfilled ✓

Received
0.482 ETH

Required
0.480 ETH

Spent
997.42 USDC

Execution time
34 seconds
```

Then:
- **Agent commitment:** $100 returned

This communicates the economic lifecycle clearly.

---

## 13. Screen 5 — Failed Settlement

The failure state is an essential part of the MVP.

Example:

```text
Commitment Failed
Authorization        ✓
Transaction          ✓
Recipient            ✓
Minimum output       ✕
```

Then:

```text
Received
0.461 ETH

Required
0.480 ETH
```

Finally:
- **Agent commitment:** $100 slashed

This is the core demonstration of CredibleExec.

---

## 14. MVP Architecture

At the conceptual level:

```text
                    USER
                      │
                      ▼
                 WEB APP
                      │
                      ▼
                 BAZANTIC
                      │
                      ▼
             MANDATE COMPILER
                      │
                      ▼
             CREDIBLEEXEC CORE
                │           │
                │           │
                ▼           ▼
           BOND CONTRACT   MANDATE
                │           │
                └─────┬─────┘
                      │
                      ▼
                    PRIVY
                      │
                      ▼
                    1INCH
                      │
                      ▼
                 BLOCKCHAIN
                      │
                      ▼
                OUTCOME VERIFIER
                      │
                 ┌────┴────┐
                 │         │
               PASS       FAIL
                 │         │
                 ▼         ▼
             RELEASE     SLASH
                BOND       BOND
```

---

## 15. MVP Components

The MVP consists of:

**Required**
- Web application
- AI agent
- Natural-language mandate generation
- Structured mandate validation
- CredibleExec commitment system
- Real collateral/bond
- Smart contract
- Privy wallet/authorization
- 1inch execution
- Blockchain transaction
- Deterministic outcome verifier
- Settlement mechanism
- Success state
- Failure state

**Not required for MVP**
- multi-chain
- multiple agents
- agent marketplace
- reputation network
- DAO governance
- ZK verification
- TEE infrastructure
- decentralized verifier network
- insurance
- yield generation
- recurring commitments
- complex dispute resolution
- agent-to-agent marketplace

---

## 16. Core Economic Model

The most important economic rule is:

> The user's principal and the agent's collateral must remain separate.

Example:

```text
USER FUNDS
1,000 USDC
     │
     ▼
PRIVY-CONTROLLED WALLET


AGENT COLLATERAL
100 USDC
     │
     ▼
CREDIBLEEXEC BOND CONTRACT
```

The agent's collateral must actually be locked.

The UI must never simulate a bond.

A fake number such as:
> "Agent stake: $100"

without actual collateral locked in a contract is not acceptable for the MVP.

---

## 17. Commitment Lifecycle

The MVP commitment lifecycle is:

```text
CREATED
   ↓
FUNDED
   ↓
ACTIVE
   ↓
 ┌───────────────┐
 ↓               ↓
FULFILLED       FAILED
 ↓               ↓
RELEASE         SLASH
BOND            BOND
```

Additional terminal states may include:
- EXPIRED
- CANCELLED
- EXTERNAL_FAILURE

but these should only be implemented when necessary.

---

## 18. What Constitutes Success?

The MVP must use objective, machine-verifiable conditions.

For example:

```text
actualSpend <= maxSpend

AND

actualOutput >= minOutput

AND

actualRecipient == requiredRecipient

AND

executionTimestamp <= deadline
```

The verifier should return:
- **PASS**
or
- **FAIL**

based on observable execution data.

---

## 19. What the AI Must NOT Decide

The LLM must never be the final authority on settlement.

Do not implement:

```text
AI evaluates transaction
        ↓
AI decides whether agent succeeded
```

Instead:

```text
Blockchain facts
        ↓
Deterministic verifier
        ↓
PASS / FAIL
```

The AI can interpret the user's request.

It cannot arbitrarily decide whether its own promise was fulfilled.

---

## 20. Failure Classification

The system must distinguish between:

**Agent-attributable failure**

*Examples:*
- exceeded maximum spend
- failed minimum output
- wrong recipient
- violated deadline
- violated explicit mandate

*Potential consequence:*
- **SLASH**

**External failure**

*Examples:*
- RPC outage
- chain congestion
- infrastructure failure
- unrelated blockchain failure
- execution never reached settlement

*Potential consequence:*
- **NO AUTOMATIC SLASH**

The MVP should make this distinction explicit in its architecture, even if only a limited subset is implemented initially.

---

## 21. MVP Success Criteria

CredibleExec's MVP is considered successful when the following complete workflow works:

```text
User enters natural-language request
        ↓
Agent interprets request
        ↓
Structured commitment generated
        ↓
User reviews commitment
        ↓
Agent collateral locked
        ↓
User authorizes execution through Privy
        ↓
Financial transaction executed
        ↓
Blockchain produces actual outcome
        ↓
Verifier evaluates outcome
        ↓
Bond automatically released OR slashed
        ↓
User sees clear result
```

There must be at least:
- One successful execution
and
- One controlled failed execution.

The failed execution is essential because it proves the economic accountability mechanism rather than merely displaying a successful swap.

---

## 22. Future Expansion Philosophy

The MVP should be deliberately designed so that future functionality can be added without rewriting the core commitment model.

The central abstraction should remain:

```text
MANDATE
+
BOND
+
EXECUTION
+
EVIDENCE
+
SETTLEMENT
```

Everything else can grow around this.

---

## 23. Future Feature Track A — Multiple Financial Actions

After the MVP:

USDC → ETH

can expand into:
- Token swaps
- Stablecoin payments
- Treasury transfers
- Payroll
- Vendor payments
- Cross-chain transfers
- Recurring purchases
- Yield deployment

The commitment model remains the same.

For example:
> "Pay this vendor 500 USDC before Friday."

could become:
- **maxSpend** = 500 USDC
- **recipient** = vendor
- **deadline** = Friday

---

## 24. Future Feature Track B — Recurring Commitments

Agents could accept recurring mandates.

Example:
> "Every Monday, buy $500 of ETH as long as the price remains below $4,000."

The system could create:

```text
Recurring Commitment
        ↓
Execution
        ↓
Verification
        ↓
Settlement
        ↓
Next commitment
```

This should not be implemented in the MVP.

But the domain model should avoid making the architecture impossible to extend to recurring commitments.

---

## 25. Future Feature Track C — Agent Reputation

Successful commitments could build an agent's track record.

Example:

```text
AGENT A

Commitments fulfilled: 97
Commitments failed: 3
Fulfillment rate: 97%
Total committed collateral: $42,000
Average commitment size: $1,000
```

This could eventually produce:
> **CredibleExec Agent Reputation**

However, reputation must be based on actual settled commitments, not user ratings alone.

---

## 26. Future Feature Track D — Dynamic Bonding

Currently:
- $1,000 transaction
- $100 bond

Future versions could calculate bond requirements dynamically.

For example:

```text
Bond = f(transaction value, risk, deadline, agent reputation, mandate complexity)
```

A highly reputable agent may require a smaller bond.

A new agent may need a larger bond.

This creates a potential economic marketplace around agent reliability.

---

## 27. Future Feature Track E — Agent Marketplace

Eventually CredibleExec could become a marketplace for accountable execution providers.

User:
> "Find an agent that can execute this mandate."

Agents:

```text
Agent A
98.7% fulfillment
Bond requirement: 5%

Agent B
96.2% fulfillment
Bond requirement: 3%

Agent C
99.4% fulfillment
Bond requirement: 8%
```

The user chooses based on:
- reputation
- collateral
- execution history
- supported capabilities
- fees

This is future architecture, not MVP.

---

## 28. Future Feature Track F — Multiple Verifiers

The MVP may use a centralized or limited verifier architecture for practicality.

Future versions can move toward:

```text
Execution
     ↓
Verifier 1 ── PASS
Verifier 2 ── PASS
Verifier 3 ── PASS
     ↓
Quorum
     ↓
Settlement
```

Potential mechanisms:
- independent verifiers
- optimistic verification
- challenge periods
- cryptographic evidence
- decentralized verifier networks

Do not implement these merely for buzzwords.

The purpose is to progressively reduce trust in the settlement layer.

---

## 29. Future Feature Track G — Compound Mandates

The MVP uses a small number of conditions.

Future mandates could contain:

```text
Spend limit
+
Minimum output
+
Recipient
+
Deadline
+
Allowed venue
+
Slippage limit
+
Price condition
+
Asset restrictions
+
Risk constraints
```

Example:
> "Convert 10,000 USDC into ETH within 2 minutes, spend no more than 10,000 USDC, receive at least 4.8 ETH, send only to Treasury A, and only execute through approved venues."

CredibleExec becomes a financial commitment compiler rather than simply a swap application.

---

## 30. Future Feature Track H — Agent-to-Agent Commitments

Eventually one agent could hire another.

```text
Agent A
   │
   │ financial mandate
   ▼
Agent B
   │
   │ posts collateral
   ▼
Execution
   │
   ▼
Verification
   │
   ▼
Settlement
```

This could enable an accountable agent economy.

Again, this is a future direction.

---

## 31. Future Feature Track I — Business / Treasury Mode

This is particularly relevant to the Privy B2B financial-product direction.

A future interface could provide:

```text
Company Treasury
────────────────────────

Active commitments       12
Capital delegated         $84,000
Agent collateral          $9,200

Fulfilled                 97%
Failed                     3%

Pending settlements        4
```

Businesses could create policies around:
- payroll
- treasury management
- vendor payments
- recurring payments
- autonomous purchasing

The underlying commitment engine remains unchanged.

---

## 32. Future Feature Track J — Commitment Analytics

A future dashboard could show:

```text
Agent Reliability

Fulfillment Rate       98.4%
Average Settlement      42 sec
Total Commitments       342
Total Collateral        $48,200
Slashed Collateral      $1,700
```

This gives the product a much stronger long-term identity than simply being a swap interface.

---

## 33. What CredibleExec Should NOT Become

This is equally important.

CredibleExec should not become:

- ❌ **Generic AI trading bot**
  - There are already many.
- ❌ **AI wallet**
  - Privy already provides wallet infrastructure.
- ❌ **Generic transaction firewall**
  - That is authorization/policy territory.
- ❌ **AI CFO dashboard**
  - Too broad and crowded.
- ❌ **Yield optimizer**
  - Not the core problem.
- ❌ **Insurance protocol**
  - CredibleExec is not promising to compensate users for arbitrary market losses.
- ❌ **Generic "agents with bonds"**
  - Collateral-backed agent work already exists as a broader concept.

The product's specific identity is:

> **Economically accountable financial commitments for autonomous execution.**

---

## 34. Non-Negotiable Product Principles

The implementation agent must follow these principles.

### Principle 1 — Commitment before execution
The system must know what the agent promised before the financial action occurs.

### Principle 2 — Agent collateral is real
The bond must exist onchain.

### Principle 3 — User funds and agent collateral are separate
Never mix them.

### Principle 4 — Authorization and accountability are separate
Privy should not be replaced.  
CredibleExec should not duplicate Privy's core role.

### Principle 5 — Settlement is deterministic
The LLM cannot arbitrarily declare success.

### Principle 6 — UX hides blockchain complexity
The user should understand the financial commitment without understanding the protocol.

### Principle 7 — The MVP must remain small
- One chain.
- One primary workflow.
- One financial action.
- One agent.
- One bond.
- One verifier.
- One polished experience.

### Principle 8 — Future features must extend the core abstraction
Future functionality should build around:
- Mandate
- Bond
- Execution
- Evidence
- Settlement

rather than replacing it.

---

## 35. The Core Product Loop

Everything in CredibleExec ultimately belongs to this loop:

```text
          ┌───────────────┐
          │     USER      │
          └───────┬───────┘
                  │
                  ▼
             FINANCIAL
              REQUEST
                  │
                  ▼
             AI AGENT
                  │
                  ▼
             COMMITMENT
                  │
                  ▼
          AGENT POSTS BOND
                  │
                  ▼
             AUTHORIZATION
                  │
                  ▼
              EXECUTION
                  │
                  ▼
            ACTUAL OUTCOME
                  │
                  ▼
             VERIFICATION
                  │
            ┌─────┴─────┐
            ▼           ▼
          PASS         FAIL
            │           │
            ▼           ▼
       RELEASE BOND   SLASH BOND
```

This loop is the heart of the product.

---

## 36. Product North Star

The user should be able to say:

> "I told my agent what I wanted. It told me exactly what it was committing to. It put its own money behind that promise. Then I could see whether it actually delivered."

If the product cannot communicate that experience clearly, the implementation has drifted from the constitution.

---

## 37. Definition of "Done" for Document 01

Document 01 is complete when the development team/AI agent understands:
- what CredibleExec is
- what it is not
- who the user is
- what the MVP does
- what the MVP does not do
- why the bond exists
- why Privy exists
- why 1inch exists
- why Bazantic exists
- what constitutes success
- what constitutes failure
- how the user experiences the product
- what future capabilities should be architecturally possible
- which future capabilities must not be implemented prematurely

---

## 38. Instruction to the Coding Agent

Do not begin implementing the entire product from this document.

This document is the product constitution, not the complete technical implementation specification.

At this stage:

**You SHOULD:**
- understand the product boundaries
- preserve the commitment abstraction
- preserve separation between user funds and agent collateral
- preserve the distinction between authorization and accountability
- design future extensibility around mandates, bonds, execution, evidence and settlement

**You SHOULD NOT:**
- build the frontend yet
- build multi-chain support
- build a marketplace
- build reputation
- build recurring commitments
- build decentralized verification
- build ZK proofs
- build DAO governance
- build insurance
- build yield strategies
- add unnecessary financial products

Those features belong to later documents and should only be implemented if explicitly requested.

---