04_BOND_CONTRACT_SPEC.md
CredibleExec — Bond & Commitment Smart Contract Specification

Version: 1.0
Status: Implementation Specification
Depends on: 01_PRODUCT_CONSTITUTION.md, 02_SYSTEM_ARCHITECTURE.md, 03_DOMAIN_MODEL.md

---

## 1. Purpose

This document specifies the onchain economic core of CredibleExec.

The purpose of the contract is simple:

> An agent must lock its own collateral behind an accepted financial commitment, and that collateral can later be released or slashed according to the verified outcome.

The contract is deliberately small.

It should not become:
- a trading contract
- an AI contract
- a wallet
- a general-purpose escrow protocol
- a DEX
- a verifier network
- a governance system

The contract's primary responsibilities are:

```text
CREATE COMMITMENT
        ↓
LOCK AGENT BOND
        ↓
ACTIVATE
        ↓
WAIT FOR OUTCOME
        ↓
SETTLE
   ┌────┴────┐
   ↓         ↓
RELEASE    SLASH
```

---

## 2. Core Economic Model

The contract must maintain a strict separation between:

### User principal

The money being used for the financial operation.

```text
User
 ↓
Privy Wallet
 ↓
1inch
```

and:

### Agent collateral

The money the agent risks by accepting the commitment.

```text
Agent
 ↓
Bond Contract
```

Example:

```text
USER PRINCIPAL
1,000 USDC
       │
       └──────► Financial execution


AGENT COLLATERAL
100 USDC
       │
       └──────► CredibleExec Bond Contract
```

These funds must never be treated as the same balance.

---

## 3. MVP Contract Scope

The MVP contract supports:
- Commitment creation.
- Agent bond deposit.
- Commitment activation.
- Commitment fulfillment.
- Commitment failure.
- Bond release.
- Bond slashing.
- Controlled cancellation.
- Commitment state tracking.
- Event emission.

---

## 4. Explicitly Out of Scope

Do not implement:
- multi-chain contracts
- multiple bond tokens
- dynamic bond pricing
- reputation calculations
- marketplace functionality
- DAO governance
- dispute courts
- optimistic challenges
- multi-verifier quorum
- ZK proofs
- TEE verification
- recurring commitments
- yield generation
- automatic insurance
- arbitrary third-party contract execution

These can be future extensions.

---

## 5. Contract Architecture

The MVP should ideally consist of one primary contract:
- `CredibleExecBond.sol`

Conceptually:

```text
┌───────────────────────────────────┐
│       CredibleExecBond            │
│                                   │
│  Commitment Registry              │
│  Bond Custody                     │
│  State Machine                    │
│  Settlement                       │
│  Access Control                   │
│  Events                           │
└───────────────────────────────────┘
```

Keep the contract simple enough that a reviewer can understand the entire economic mechanism quickly.

---

## 6. Commitment Structure

The contract should maintain a commitment structure approximately equivalent to:

```solidity
struct Commitment {
    address agent;
    address bondToken;
    uint256 bondAmount;

    address principalToken;
    uint256 principalAmount;

    address targetToken;
    uint256 minOutput;
    uint256 maxSpend;

    address recipient;
    uint256 deadline;

    CommitmentStatus status;
}
```

The exact ordering and packing can be optimized later.

Do not prematurely optimize storage at the expense of clarity.

---

## 7. Commitment ID

Every commitment must have a unique identifier.

Recommended:

```solidity
bytes32 commitmentId;
```

The ID must be unique within the contract.

Possible generation:

```solidity
bytes32 commitmentId =
    keccak256(
        abi.encode(
            agent,
            nonce,
            block.chainid
        )
    );
```

Alternatively, a monotonically increasing ID may be used.

For the MVP, a simple counter is preferable if it makes the implementation and frontend integration clearer.

Example:
- Commitment #1
- Commitment #2
- Commitment #3

The frontend can still display a shortened hexadecimal identifier if desired.

---

## 8. Why the Commitment ID Exists

The transaction hash cannot be the commitment ID.

A commitment exists before execution.

Therefore:

```text
Commitment #42
      │
      ├── Bond
      ├── Execution
      ├── Evidence
      └── Settlement
```

The transaction hash only appears later:

```text
Commitment #42
      ↓
Execution
      ↓
0xABC123... transaction hash
```

---

## 9. Commitment Status

Use:

```solidity
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

The MVP does not need a complicated state machine.

---

## 10. State Machine

```text
                 ┌─────────────┐
                 │   CREATED   │
                 └──────┬──────┘
                        │
                 deposit bond
                        │
                        ▼
                 ┌─────────────┐
                 │   FUNDED    │
                 └──────┬──────┘
                        │
                     activate
                        │
                        ▼
                 ┌─────────────┐
                 │    ACTIVE   │
                 └──────┬──────┘
                    ┌───┴────┐
                    │        │
                  pass      fail
                    │        │
                    ▼        ▼
              ┌─────────┐ ┌─────────┐
              │FULFILLED│ │ FAILED  │
              └─────────┘ └─────────┘
```

Terminal states:
- `FULFILLED`
- `FAILED`
- `EXPIRED`
- `CANCELLED`

must not transition back to `ACTIVE`.

---

## 11. Commitment Creation

Function:

```solidity
function createCommitment(
    ...
) external returns (uint256 commitmentId);
```

The creator supplies the commitment parameters.

At creation:
- `status` = `CREATED`

No bond has necessarily been deposited yet.

---

## 12. Creation Validation

The contract must reject invalid commitments.

Minimum requirements:
- `agent` != `address(0)`
- `bondToken` != `address(0)`
- `principalToken` != `address(0)`
- `targetToken` != `address(0)`
- `recipient` != `address(0)`
- `bondAmount` > 0
- `principalAmount` > 0
- `maxSpend` > 0
- `minOutput` > 0
- `deadline` > `block.timestamp`

Additional logical constraints should be validated where appropriate.

---

## 13. Agent Ownership

The agent address stored in the commitment represents the entity responsible for the bond.

Example:

Commitment #42:
- **Agent:** `0xABC...`
- **Bond:** 100 USDC

The agent must be the account depositing the bond unless the architecture explicitly supports an authorized operator.

For MVP:
- Keep the agent/bond depositor relationship simple.
- Avoid building complex delegated staking logic.

---

## 14. Bond Deposit

Function:

```solidity
function depositBond(
    uint256 commitmentId
) external;
```

The caller transfers the required bond token into the contract.

Example:

```text
Agent Wallet
     │
     │ 100 USDC
     ▼
CredibleExecBond
```

After successful deposit:

```text
CREATED
   ↓
FUNDED
```

---

## 15. Token Standard

The MVP should use an ERC-20-compatible token for the bond.

Recommended demo asset:
- **USDC**

The contract should use safe token transfer patterns.

Conceptually:

```solidity
IERC20(token).transferFrom(
    msg.sender,
    address(this),
    amount
);
```

The implementation should use a safe ERC-20 handling library/pattern rather than assuming every token behaves perfectly.

---

## 16. Bond Accounting

The contract must maintain a clear relationship:

```text
commitmentId
      ↓
bondToken
bondAmount
      ↓
locked balance
```

The contract must not rely purely on an offchain database to know whether a bond exists.

The actual token balance must reside in the contract.

---

## 17. Bond Invariant

For an active commitment:

> **lockedBond >= requiredBond**

The system must never mark:
- `status = ACTIVE`

while pretending a bond exists when the token transfer failed.

---

## 18. Activation

Function:

```solidity
function activateCommitment(
    uint256 commitmentId
) external;
```

Activation should only succeed when:
- commitment exists
- AND `status == FUNDED`
- AND bond exists
- AND deadline has not passed

After activation:

```text
FUNDED → ACTIVE
```

---

## 19. Commitment Immutability

Once activated:

The financial conditions must not be modifiable.

Specifically, these values must not change:
- `agent`
- `bondAmount`
- `principalToken`
- `principalAmount`
- `targetToken`
- `maxSpend`
- `minOutput`
- `recipient`
- `deadline`

This prevents:

```text
Original commitment
minOutput = 0.48 ETH

        ↓

Agent changes it

        ↓

minOutput = 0.45 ETH

        ↓

Agent "successfully" fulfills
```

That would make the commitment meaningless.

---

## 20. Commitment Hash

For stronger binding between the mandate and onchain commitment, calculate a canonical commitment hash.

Conceptually:

```solidity
bytes32 commitmentHash = keccak256(
    abi.encode(
        agent,
        principalToken,
        principalAmount,
        targetToken,
        maxSpend,
        minOutput,
        recipient,
        deadline
    )
);
```

Store the hash alongside the commitment.

The precise encoding should be finalized during implementation.

The important property is:

> The commitment evaluated offchain must correspond exactly to the commitment registered onchain.

---

## 21. Settlement Architecture

The contract should not determine whether the financial objective was fulfilled by itself in the MVP.

Instead:

```text
Blockchain execution
       ↓
Evidence
       ↓
Deterministic verifier
       ↓
PASS / FAIL
       ↓
Authorized settlement call
       ↓
Bond contract
```

This keeps the contract simple.

---

## 22. Settlement Success

Function:

```solidity
function settleSuccess(
    uint256 commitmentId
) external;
```

Requirements:
- commitment exists
- `status == ACTIVE`
- authorized settlement caller

Then:

```text
ACTIVE
  ↓
FULFILLED
```

and:

```text
Bond
  ↓
Agent
```

---

## 23. Settlement Failure

Function:

```solidity
function settleFailure(
    uint256 commitmentId
) external;
```

Requirements:
- commitment exists
- `status == ACTIVE`
- authorized settlement caller

Then:

```text
ACTIVE
  ↓
FAILED
```

and:

```text
Bond
  ↓
Slash recipient / protocol treasury
```

---

## 24. Who Receives the Slashed Bond?

For MVP, use a simple and transparent destination.

Possible options:

### Option A — User receives it

```text
Agent bond
     ↓
User
```

This creates the strongest intuitive narrative:
> "The agent failed, so the user receives the collateral."

### Option B — Protocol treasury

```text
Agent bond
     ↓
CredibleExec treasury
```

### Option C — Split

```text
Bond
 ├── User
 └── Protocol
```

### Recommended MVP

Use:

> **The user receives the slashed bond.**

It makes the product story immediately understandable.

For example:
- Agent commitment: $100
- Commitment failed.
- $100 collateral → returned to user

This also creates a very strong demo moment.

The exact percentage can be made configurable later.

---

## 25. Slashing Must Not Mean "User Lost Money"

The product must clearly communicate:

```text
USER PRINCIPAL
+
AGENT COLLATERAL
```

If the agent fails:

**User principal:**
- subject to actual execution outcome

**Agent collateral:**
- slashed according to commitment

The bond is not a guarantee against market loss.

Do not advertise:
> "You cannot lose money."

Instead:
> "The agent has economic consequences when it violates the commitment."

---

## 26. Settlement Authorization

This is one of the most important security decisions.

The contract cannot allow:
- `anyone → settleFailure()`

without controls.

Otherwise:

```text
Attacker
 ↓
settleFailure(commitment)
 ↓
Agent loses bond
```

The MVP therefore needs an authorized settlement mechanism.

Recommended:
- `OWNER` / `SETTLEMENT_ROLE`

or an equivalent access-control mechanism.

---

## 27. MVP Trust Boundary

This means the MVP has an explicit trust assumption:

```text
Verifier
   ↓
Authorized settlement service
   ↓
Bond contract
```

The settlement service can call:
- `settleSuccess()`
- `settleFailure()`

The contract does not independently know whether the verifier's conclusion is correct.

This must be documented honestly.

---

## 28. Future Trustless Settlement

Future architecture can replace the trusted settlement caller with:

```text
Verifier A
Verifier B
Verifier C
      ↓
   QUORUM
      ↓
Settlement
```

Or:

```text
Verifier
   ↓
Challenge period
   ↓
Final settlement
```

Or potentially cryptographically verifiable evidence.

The contract should therefore keep the settlement interface relatively clean.

---

## 29. Settlement Idempotency

This is mandatory.

Once:

```text
ACTIVE → FULFILLED
```

a second call to:
- `settleSuccess()`

must fail.

Likewise:

```text
ACTIVE → FAILED
```

must prevent:
- `settleFailure()`
- `settleSuccess()`

from executing again.

Simple rule:

```solidity
require(
    commitment.status == CommitmentStatus.ACTIVE,
    "Commitment not active"
);
```

before settlement.

---

## 30. Reentrancy Protection

Because the contract transfers ERC-20 tokens during settlement, the implementation must protect against unsafe external token interactions.

Use a standard reentrancy protection mechanism where appropriate.

The goal is to prevent:

```text
settlement
   ↓
token transfer
   ↓
malicious callback
   ↓
settlement again
```

Even though the MVP uses a standard token such as USDC, the contract should follow safe contract-development practices.

---

## 31. Checks-Effects-Interactions

Settlement should follow:

```text
CHECK
  ↓
UPDATE STATE
  ↓
TRANSFER FUNDS
```

rather than:

```text
TRANSFER
  ↓
UPDATE STATE
```

Example conceptual order:

```solidity
require(status == ACTIVE);

status = FULFILLED;

bondToken.safeTransfer(agent, bondAmount);
```

This reduces reentrancy and double-settlement risks.

---

## 32. Cancellation

Cancellation should be deliberately limited.

A user should not be able to arbitrarily cancel an already active commitment and steal the agent's bond.

Similarly, the agent should not be able to cancel an active commitment whenever it becomes inconvenient.

Recommended MVP:

```text
CREATED → CANCELLED
FUNDED  → CANCELLED
```

before execution begins, subject to defined authorization.

Once:
- `ACTIVE`

the commitment should normally proceed to:
- `FULFILLED`
- `FAILED`
- `EXPIRED`

---

## 33. Deadline Handling

The commitment has:
- `deadline`

Example:
- `deadline = now + 60 seconds`

The contract should prevent activation after the deadline.

For settlement, however, be careful.

The contract itself may not know the exact execution timestamp of the financial transaction unless that evidence is provided through the settlement mechanism.

Therefore:

> Do not pretend the smart contract alone can prove every deadline condition in the MVP.

The verifier determines the outcome using execution evidence.

---

## 34. Expiration

An optional function:

```solidity
function expireCommitment(
    uint256 commitmentId
) external;
```

can be introduced.

Conceptually:

```text
ACTIVE
  ↓
deadline passes
  ↓
EXPIRED
```

But the economic consequence of expiration must be carefully defined.

Do not automatically slash merely because:
- `block.timestamp > deadline`

without determining whether the agent was actually responsible.

For the first MVP, expiration can remain a controlled path if implementation time is limited.

---

## 35. Events

The contract must emit lifecycle events.

Recommended:

```solidity
event CommitmentCreated(
    uint256 indexed commitmentId,
    address indexed agent,
    uint256 bondAmount
);
event BondDeposited(
    uint256 indexed commitmentId,
    address indexed agent,
    uint256 amount
);
event CommitmentActivated(
    uint256 indexed commitmentId
);
event CommitmentFulfilled(
    uint256 indexed commitmentId
);
event CommitmentFailed(
    uint256 indexed commitmentId
);
event BondReleased(
    uint256 indexed commitmentId,
    address indexed recipient,
    uint256 amount
);
event BondSlashed(
    uint256 indexed commitmentId,
    address indexed recipient,
    uint256 amount
);
```

These events are important beyond the MVP.

They can later feed:
- reputation
- analytics
- dashboards
- indexing
- agent history
- marketplace ranking

---

## 36. Recommended Contract Interface

The conceptual public interface is:

```solidity
interface ICredibleExecBond {

    function createCommitment(
        ...
    ) external returns (uint256);

    function depositBond(
        uint256 commitmentId
    ) external;

    function activateCommitment(
        uint256 commitmentId
    ) external;

    function settleSuccess(
        uint256 commitmentId
    ) external;

    function settleFailure(
        uint256 commitmentId
    ) external;

    function cancelCommitment(
        uint256 commitmentId
    ) external;

    function getCommitment(
        uint256 commitmentId
    ) external view returns (...);
}
```

The implementation agent must determine the exact Solidity parameter types from the final project configuration.

---

## 37. Access Control

The contract should have clearly defined roles.

Minimum:
- `OWNER`
- `SETTLEMENT_ROLE`

Potentially:
- `PAUSER`

if required.

Do not create a complicated role hierarchy.

---

## 38. Owner Responsibilities

The owner should primarily manage:
- settlement authority configuration
- emergency configuration
- authorized roles

The owner should not be able to arbitrarily steal user or agent funds.

Administrative powers must be minimized.

---

## 39. Emergency Pause

A future-safe implementation may include:
- `pause()`
- `unpause()`

However, pausing should not accidentally trap funds permanently.

If implemented, carefully distinguish:
- new commitments

from:
- withdrawals / settlement of existing commitments

For MVP, a pause mechanism is optional if it complicates the contract.

---

## 40. Bond Token Restrictions

The MVP should use one known token.

For example:
- **USDC**

Do not build:
> any ERC20 imaginable

unless there is a compelling reason.

A configurable bond token can be a future extension.

---

## 41. Recommended MVP Bond Model

Use a simple model:

Commitment value:
- 1,000 USDC

Required agent bond:
- 100 USDC

The bond amount should be known before activation.

The contract should not calculate complicated risk pricing.

---

## 42. Future Dynamic Bond Model

Future:

```text
bond = transaction value × risk multiplier × agent reliability factor
```

For example:

New agent:
- → 10% bond

Established agent:
- → 5% bond

Highly reliable agent:
- → 2% bond

This should not be implemented in the MVP.

---

## 43. Future Reputation Integration

Because settlement events are emitted:
- `CommitmentFulfilled`
- `CommitmentFailed`
- `BondReleased`
- `BondSlashed`

a future reputation service can calculate:
- Fulfillment Rate
- Total Bonded
- Total Slashed
- Average Commitment Size

The contract should therefore emit enough information for indexing.

---

## 44. Future Multi-Verifier Integration

Current:

```text
Verifier
   ↓
Settlement Role
   ↓
Contract
```

Future:

```text
Verifier A ─┐
Verifier B ─┼─→ Settlement Consensus
Verifier C ─┘
                    ↓
                 Contract
```

The contract should avoid embedding verifier-specific logic directly into the MVP.

---

## 45. Future Challenge Mechanism

A future version may allow:

```text
Verifier says PASS
       ↓
Challenge window
       ↓
Anyone can challenge
       ↓
Independent verification
       ↓
Final settlement
```

This can reduce trust in a centralized verifier.

But it is not MVP scope.

---

## 46. Security Invariants

The following properties must hold.

### Invariant 1
A bond can only be released once.

### Invariant 2
A bond can only be slashed once.

### Invariant 3
A fulfilled commitment cannot become failed.

### Invariant 4
A failed commitment cannot become fulfilled.

### Invariant 5
An active commitment cannot be modified.

### Invariant 6
Only authorized settlement callers can settle.

### Invariant 7
The agent's bond belongs to the correct commitment.

### Invariant 8
A commitment cannot become active without a funded bond.

### Invariant 9
A zero-address recipient is invalid.

### Invariant 10
Zero bond amounts are invalid.

### Invariant 11
The contract cannot transfer more bond than is locked.

### Invariant 12
Settlement must be idempotent.

---

## 47. Attack Scenarios

The coding agent must explicitly test:

### Attack 1 — Double settlement
- `settleSuccess()`
- `settleSuccess()`

Second call must fail.

### Attack 2 — Success then failure
- `settleSuccess()`
- `settleFailure()`

Second call must fail.

### Attack 3 — Unauthorized settlement
- `attacker → settleFailure()`

Must fail.

### Attack 4 — Fake bond
Agent attempts to activate without depositing the bond.  
Must fail.

### Attack 5 — Commitment modification
Attempt to change:
- `minOutput`
- `recipient`
- `deadline`

after activation.  
Must fail.

### Attack 6 — Wrong agent
Another account attempts to deposit the agent's bond.  
For MVP, this should fail unless explicitly authorized.

### Attack 7 — Zero bond
- `bondAmount = 0`

Must fail.

### Attack 8 — Expired commitment
Attempt to activate after deadline.  
Must fail.

### Attack 9 — Nonexistent commitment
- `commitmentId = 999999`

Must fail.

### Attack 10 — Reentrancy
Settlement must not permit a malicious token interaction to trigger another settlement.

---

## 48. Unit Tests

At minimum:

### Creation
- ✓ valid commitment created
- ✓ invalid zero addresses rejected
- ✓ invalid amounts rejected
- ✓ invalid deadline rejected

### Bond
- ✓ bond deposited
- ✓ bond balance correct
- ✓ incorrect depositor rejected
- ✓ activation without bond rejected

### Activation
- ✓ funded commitment activates
- ✓ already active commitment cannot activate
- ✓ expired commitment cannot activate

### Success
- ✓ authorized success settlement
- ✓ bond returned
- ✓ state becomes `FULFILLED`
- ✓ event emitted

### Failure
- ✓ authorized failure settlement
- ✓ bond transferred to user
- ✓ state becomes `FAILED`
- ✓ event emitted

### Security
- ✓ unauthorized settlement rejected
- ✓ double settlement rejected
- ✓ state modification rejected
- ✓ reentrancy protected

---

## 49. Integration Test

The most important integration test should reproduce the product's actual economic loop.

```text
Agent
 ↓
Create commitment
 ↓
Deposit 100 USDC
 ↓
Activate
 ↓
Verifier returns PASS
 ↓
Settlement
 ↓
Agent receives 100 USDC
```

Then:

```text
Agent
 ↓
Create commitment
 ↓
Deposit 100 USDC
 ↓
Activate
 ↓
Verifier returns FAIL
 ↓
Settlement
 ↓
User receives 100 USDC
```

The second scenario is particularly important.

---

## 50. Test the Economic Story

The contract tests should verify actual balances.

Example:

Before:
- **Agent:** 100 USDC
- **Contract:** 0 USDC

After deposit:
- **Agent:** 0 USDC
- **Contract:** 100 USDC

After success:
- **Agent:** 100 USDC
- **Contract:** 0 USDC

After failure:
- **User:** +100 USDC
- **Contract:** 0 USDC

This prevents the implementation from accidentally creating a UI-only bond.

---

## 51. Deployment

The MVP should deploy to one testnet / supported development environment.

Do not deploy to multiple chains initially.

Deployment should produce:
- Contract address
- Chain ID
- Bond token address
- Settlement authority address

These should be stored in configuration rather than hardcoded throughout the application.

---

## 52. Contract Configuration

The frontend/backend should consume configuration such as:

```typescript
const credibleExecConfig = {
    chainId,
    contractAddress,
    bondTokenAddress,
};
```

Avoid:
- `const CONTRACT = "0x123...";`

scattered throughout the codebase.

---

## 53. Contract ABI

The generated ABI should be treated as the interface between:

```text
Frontend / Backend
        ↓
CredibleExecBond
```

The frontend should not reproduce contract logic.

---

## 54. What the Smart Contract Does NOT Know

The contract does not need to understand:
> "Swap $1,000 USDC for ETH"

as natural language.

It receives structured parameters.

It also does not need to know:
- Bazantic reasoning
- 1inch quote
- LLM chain-of-thought

Its job is economic custody and state.

---

## 55. Relationship With the Verifier

The architecture is:

```text
                    BLOCKCHAIN
                        │
                        ▼
                  EXECUTION DATA
                        │
                        ▼
                    VERIFIER
                        │
                   PASS / FAIL
                        │
                        ▼
                SETTLEMENT SERVICE
                        │
                        ▼
                CREDIBLEEXEC BOND
```

The contract should remain independent from the implementation details of the verifier.

---

## 56. Relationship With Privy

Privy controls the wallet used for financial execution.

The bond contract controls the agent collateral.

Therefore:

```text
PRIVY
 ↓
USER / EXECUTION WALLET
```

while:

```text
CREDIBLEEXEC
 ↓
AGENT BOND
```

Do not combine these responsibilities.

---

## 57. Relationship With 1inch

1inch performs the financial action.

```text
Commitment
 ↓
Authorized transaction
 ↓
1inch
 ↓
Blockchain
```

The bond contract does not need to call the 1inch API.

---

## 58. Relationship With Bazantic

Bazantic orchestrates the agent workflow.

```text
User request
 ↓
Bazantic
 ↓
Mandate
 ↓
Commitment
```

The bond contract should not contain agent reasoning logic.

---

## 59. Future Contract Architecture

If CredibleExec grows significantly, the contract architecture could evolve into:

```text
                    CREDIBLEEXEC
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    Commitment      Verification     Reputation
     Registry          Layer           Layer
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                    Settlement
```

But the MVP should not implement this architecture literally.

---

## 60. What Makes This Contract Interesting

The contract itself is intentionally not complicated.

That is a feature.

The innovation is not:
> "We wrote a complicated Solidity contract."

It is:
> "The agent's financial commitment has actual economic consequences."

The contract is the mechanism that makes that statement real.

---

## 61. Definition of Done

The smart-contract implementation is complete only when:
- Contract compiles.
- Contract deploys.
- Commitment can be created.
- Agent can deposit real testnet collateral.
- Bond is held by contract.
- Commitment can be activated.
- Active commitment is immutable.
- Authorized verifier can settle success.
- Bond is returned on success.
- Authorized verifier can settle failure.
- Bond is transferred to the defined recipient on failure.
- Double settlement is impossible.
- Unauthorized settlement fails.
- Required events are emitted.
- Unit tests pass.
- Integration tests pass.
- Actual token balances confirm the economic behavior.

---

## 62. The Critical Demo Requirement

Before moving on to the next document, the coding agent must be able to demonstrate:

### Success

```text
Agent
  │
  ├── locks $100
  │
  ├── fulfills commitment
  │
  └── gets $100 back
```

and:

### Failure

```text
Agent
  │
  ├── locks $100
  │
  ├── violates commitment
  │
  └── loses $100
             │
             ▼
           USER
```

If those two flows work with real testnet tokens, then the core economic primitive of CredibleExec is real.

---

## 63. Important Implementation Constraint

Do not proceed to Privy, 1inch, Bazantic, or frontend integration until the bond contract passes its core tests.

The build order should now be:

```text
01 Product Constitution       ✓
02 System Architecture       ✓
03 Domain Model              ✓
04 Bond Contract             ← BUILD NOW
       │
       ▼
   CONTRACT TESTS
       │
       ▼
05 Mandate Specification
```

---

## 64. Future Possibilities Exposed by This Contract

If we have extra hackathon time later, this contract gives us several high-value directions without changing the fundamental product:

```text
                    BOND CONTRACT
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   Reputation       Dynamic Bonds     Multi-Agent
                                         Market
        │                │                │
        ▼                ▼                ▼
    Agent scores    Risk-adjusted     Agent selection
                                         │
        └────────────────┼────────────────┘
                         ▼
                ACCOUNTABLE AGENT
                    ECONOMY
```

This is why we're keeping the commitment/bond abstraction clean now.
