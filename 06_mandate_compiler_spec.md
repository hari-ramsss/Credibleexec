06_MANDATE_COMPILER_SPEC.md
1. Objective

Define the exact mechanism that converts a user's natural-language financial request into a structured, deterministic, reviewable mandate that can later become a CredibleExec commitment.

The compiler is responsible for understanding the user's intent.

It is not responsible for deciding whether the commitment succeeded or failed.

Core pipeline
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

Example:

User:
"Swap $1,000 USDC for ETH and send it to my treasury.
I need at least 0.48 ETH within a minute."

                    ↓

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

The user must see and approve this structured interpretation before a commitment is created.

2. Design Principles

The compiler MUST follow these principles.

2.1 AI interprets; deterministic code validates

The LLM may extract:

asset names
amounts
financial objective
recipient
deadline
execution preferences

The LLM must not determine:

whether an execution passed
whether a bond should be slashed
whether a transaction is valid after execution
whether an external event should excuse failure

Those decisions belong to deterministic application/verification logic.

2.2 Never silently invent missing information

If the user says:

"Send some USDC to my treasury."

The compiler must not invent:

amount
treasury address
deadline
chain

Instead:

{
  "status": "NEEDS_CLARIFICATION",
  "missingFields": [
    "amount",
    "recipient"
  ]
}
2.3 User confirmation is mandatory

The compiler output is not automatically executable.

Natural Language
       ↓
AI Interpretation
       ↓
Validation
       ↓
USER REVIEW  ← mandatory trust boundary
       ↓
Commitment

The system must never create an active financial commitment solely because an LLM generated valid JSON.

3. Compiler Input

The compiler receives:

interface CompilerInput {
  userRequest: string;

  userId: string;

  walletContext?: {
    chainId: number;
    walletAddress: string;
  };

  knownRecipients?: {
    alias: string;
    address: string;
  }[];

  supportedAssets: SupportedAsset[];

  currentTimestamp: number;
}
Important

userRequest is untrusted natural-language input.

It must never be directly inserted into:

transaction calldata
smart-contract parameters
authorization policies
settlement logic
4. Compiler Output

The compiler must return one of two primary states.

Valid mandate
interface CompileSuccess {
  status: "VALID";

  mandate: Mandate;

  warnings: string[];

  summary: string;
}
Clarification required
interface CompileClarification {
  status: "NEEDS_CLARIFICATION";

  missingFields: string[];

  questions: string[];

  partialMandate?: Partial<Mandate>;
}

There should also be an explicit error state:

interface CompileError {
  status: "INVALID";

  errors: CompilerError[];
}
5. Mandate Schema

For the MVP, support only:

SWAP

The normalized mandate should contain:

interface SwapMandate {
  version: "1";

  type: "SWAP";

  chainId: number;

  assetIn: string;

  assetOut: string;

  maxSpend: string;

  minOutput: string;

  recipient: string;

  deadline: number;

  executionVenue?: string;
}

All financial amounts must be represented as integer base units.

Never use floating-point numbers for financial execution.

Example:

$1,000 USDC

becomes:

1000000000

assuming USDC has 6 decimals.

6. Human-Readable Summary

Every valid mandate must also produce a concise human-readable summary.

Example:

Swap up to 1,000 USDC for at least 0.48 ETH, send the ETH to Treasury, and complete the transaction within 60 seconds.

The summary is for the user interface.

The structured mandate is the authoritative representation.

7. Compiler Pipeline
Stage 1 — Receive Request

Example:

"Swap $1,000 USDC for ETH and send it to my treasury.
I need at least 0.48 ETH within a minute."

Do not execute anything.

Stage 2 — Intent Extraction

The AI extracts semantic information.

Conceptually:

{
  "action": "SWAP",
  "inputAsset": "USDC",
  "inputAmount": "1000",
  "outputAsset": "ETH",
  "minimumOutput": "0.48",
  "recipient": "my treasury",
  "deadline": "within one minute"
}

This intermediate representation should not yet be considered executable.

8. Stage 3 — Entity Resolution

Resolve natural-language references against trusted application data.

Examples:

"USDC"
      ↓
0x...USDC_CONTRACT
"my treasury"
      ↓
user-configured treasury address
"ETH"
      ↓
native ETH on configured chain

The LLM should not be trusted to provide arbitrary contract addresses.

Addresses should come from:

configured asset registry
wallet context
verified recipient registry
explicit user input
9. Recipient Resolution

Support friendly aliases.

Example:

"send it to my treasury"

can resolve to:

{
  "alias": "Treasury",
  "address": "0xABC..."
}

The UI should display:

Recipient
Treasury
0xABC...123

The user must be able to verify the destination before approving.

Never allow
AI:
"treasury probably means 0x123..."

The system must either have a trusted mapping or request clarification.

10. Deadline Resolution

Natural-language deadlines must be converted into an absolute timestamp.

Examples:

"within one minute"
        ↓
currentTimestamp + 60 seconds
"within 10 minutes"
        ↓
currentTimestamp + 600 seconds

The resolved deadline must be shown to the user.

Example:

Deadline
Within 60 seconds
Expires at 14:32:17

Relative time must be resolved once during compilation.

Do not repeatedly reinterpret the same natural-language deadline later.

11. Ambiguity Handling

The compiler must distinguish between:

Clear request
"Swap 1,000 USDC for at least 0.48 ETH."

→ continue.

Missing information
"Swap 1,000 USDC for ETH."

Potentially missing:

minOutput
recipient
deadline

→ ask for clarification.

Conflicting information
"Spend no more than $1,000 and spend exactly $1,100."

→ reject.

Unsafe ambiguity
"Send the ETH to my usual wallet."

If no verified "usual wallet" exists:

→ clarification required.

12. Do Not Guess Financial Constraints

This is particularly important.

If the user says:

"Get me a good amount of ETH."

The AI must not invent:

minOutput = 0.48 ETH

Instead:

"What minimum amount of ETH should the agent guarantee?"

Likewise:

"Swap $1,000 USDC for ETH at a good price."

does not automatically become:

minOutput = currentMarketPrice * 0.99

unless the product explicitly defines such an optimization policy.

For MVP, require explicit measurable constraints.

13. Why Measurable Constraints Matter

CredibleExec ultimately needs to determine:

DID THE AGENT FULFILL ITS PROMISE?

Therefore the compiler should convert subjective language into objective conditions only when the conversion is explicitly supported by product rules.

Good:

"At least 0.48 ETH"

→ measurable.

Good:

"Spend no more than 1,000 USDC"

→ measurable.

Bad:

"Get me the best possible price."

→ ambiguous.

Bad:

"Make me money."

→ undefined.

The MVP should reject subjective financial objectives rather than pretending they are measurable.

14. Validation Pipeline

After the LLM produces structured output, deterministic code validates it.

LLM OUTPUT
    ↓
JSON Schema Validation
    ↓
Type Validation
    ↓
Asset Validation
    ↓
Amount Validation
    ↓
Recipient Validation
    ↓
Deadline Validation
    ↓
Cross-field Validation
    ↓
Canonicalization
15. JSON Schema Validation

The model must use structured output.

Conceptually:

{
  "type": "object",
  "required": [
    "type",
    "assetIn",
    "assetOut",
    "maxSpend",
    "minOutput",
    "recipient",
    "deadline"
  ]
}

Reject:

unknown fields
incorrect types
missing required fields
malformed addresses
malformed numbers
unsupported mandate types

Do not attempt to "repair" arbitrary malformed financial instructions automatically.

16. Asset Validation

Both assets must exist in the supported asset registry.

assetIn ∈ SupportedAssets
assetOut ∈ SupportedAssets

Reject:

assetIn = "FakeCoin"

even if the LLM confidently produced it.

For MVP:

USDC → ETH

should be the primary supported pair.

Future versions may support multiple assets.

17. Amount Validation

Validate:

maxSpend > 0
minOutput > 0

Validate decimal precision against the token's decimals.

Example:

USDC
6 decimals

The compiler must correctly convert:

$1,000

into:

1000000000

without floating-point arithmetic.

18. Recipient Validation

The recipient must:

Be explicitly provided by the user, or
Resolve through a trusted recipient registry.

Validate:

address format
chain compatibility
non-zero address

The compiler must not allow the LLM to silently replace the recipient.

19. Deadline Validation

The deadline must:

deadline > currentTimestamp

and should have a reasonable maximum window for the MVP.

Example:

MVP maximum:
24 hours

This prevents malformed requests from creating commitments that remain active indefinitely.

20. Cross-Field Validation

The compiler must validate relationships between fields.

Example:

assetIn != assetOut

For the MVP:

type = SWAP

must have:

assetIn
assetOut
maxSpend
minOutput
recipient
deadline

A mandate cannot proceed with only some of these fields.

21. Execution Venue

The mandate may contain:

"executionVenue": "1inch"

However, the user's financial objective must remain independent from the execution provider.

Conceptually:

MANDATE
    ↓
WHAT must happen

EXECUTION STRATEGY
    ↓
HOW to attempt it

This distinction is important for future support of:

1inch
Uniswap
other execution providers

The execution venue must never redefine the user's financial constraints.

22. AI Prompt Architecture

The agent should receive a strict system instruction similar to:

You are a financial intent compiler.

Your job is to translate the user's natural-language request
into a structured financial mandate.

You must:
- extract only information supported by the user's request
- never invent amounts, recipients, deadlines, or financial guarantees
- request clarification when required information is missing
- use only supported mandate types
- return structured output according to the provided schema

You must NOT:
- execute transactions
- decide whether an execution succeeded
- decide whether collateral should be released
- decide whether collateral should be slashed
- invent blockchain addresses
- create financial guarantees not explicitly represented by the mandate

The exact prompt can evolve during implementation, but these constraints are mandatory.

23. Tool Access

The compiler agent should have access only to tools necessary for interpretation and resolution.

Potential MVP tools:

getSupportedAssets()
getUserRecipients()
getWalletContext()
getCurrentTime()

It should not have direct access to:

settleSuccess()
settleFailure()
slashBond()

Those operations belong to deterministic application/contract logic.

24. No Chain-of-Thought Dependency

Do not build the product around storing or exposing hidden model reasoning.

The application may store:

interpretation summary
confidence/status
resolved entities
validation warnings

Example:

"Interpreted 'my treasury' as the user's configured Treasury wallet."

Do not require internal chain-of-thought to verify the mandate.

The structured mandate and deterministic validation results are the authoritative artifacts.

25. User Review Screen

Before commitment creation, show:

What you asked

Swap $1,000 USDC for ETH and send it to my treasury.

Your agent will commit to
Spend
≤ 1,000 USDC

Receive
≥ 0.48 ETH

Recipient
Treasury

Deadline
60 seconds

Execution
1inch

Then:

Agent Commitment
100 USDC

You don't pay this.
The agent locks it behind the commitment.

Buttons:

[Approve & Execute]
[Edit Request]

Do not expose raw JSON by default.

26. Confirmation Boundary

The following sequence is mandatory:

AI generated mandate
        ↓
Deterministic validation
        ↓
Human-readable review
        ↓
USER APPROVES
        ↓
Commitment created
        ↓
Agent collateral locked
        ↓
Execution authorized

The AI must never bypass this boundary.

27. Canonicalization

Before creating a commitment, normalize the mandate into a canonical representation.

Example:

{
  "version": "1",
  "type": "SWAP",
  "chainId": 1,
  "assetIn": "0x...",
  "assetOut": "0x...",
  "maxSpend": "1000000000",
  "minOutput": "480000000000000000",
  "recipient": "0x...",
  "deadline": 1789040000,
  "executionVenue": "1inch"
}

Canonicalization should ensure:

deterministic field ordering
normalized addresses
integer amounts
absolute deadline
explicit version
explicit chain
no unnecessary natural-language fields

The canonical representation becomes the source for the commitment hash.

28. Commitment Boundary

The compiler ends here:

Natural Language
       ↓
Structured Mandate
       ↓
Validated Mandate
       ↓
Canonical Mandate
       ↓
User Approval

After this point, the mandate becomes input to the Commitment/Bond subsystem.

The compiler must not:

lock collateral
execute swaps
settle commitments
slash bonds
29. Failure Categories

Use explicit error codes.

Example:

enum CompilerErrorCode {
  UNSUPPORTED_ACTION,
  MISSING_AMOUNT,
  MISSING_ASSET,
  MISSING_RECIPIENT,
  MISSING_DEADLINE,
  MISSING_MIN_OUTPUT,
  INVALID_AMOUNT,
  INVALID_RECIPIENT,
  UNSUPPORTED_ASSET,
  INVALID_DEADLINE,
  CONFLICTING_CONSTRAINTS,
  UNSUPPORTED_OBJECTIVE
}

Example response:

{
  "status": "NEEDS_CLARIFICATION",
  "missingFields": ["minOutput"],
  "questions": [
    "What minimum amount of ETH should the agent guarantee?"
  ]
}
30. MVP Supported Language

The MVP should support common natural-language variations.

Examples:

"Swap $1,000 USDC for at least 0.48 ETH."

"Convert 1000 USDC into a minimum of 0.48 ETH."

"Buy ETH using 1000 USDC, but don't accept less than 0.48 ETH."

"Swap 1,000 USDC → ETH. Minimum output 0.48 ETH."

All should produce the same semantic mandate.

31. MVP Unsupported Requests

Do not attempt to support:

"Find the best investment."

"Maximize my returns."

"Trade whenever the market looks good."

"Protect me from losses."

"Use whatever strategy makes the most money."

"Automatically rebalance my portfolio."

These can become future mandate types.

32. Bazantic Integration

Bazantic should be used as part of the agent workflow, not merely mentioned in the UI.

The intended Recipe flow is:

USER REQUEST
    ↓
BAZANTIC RECIPE
    ↓
Interpret intent
    ↓
Resolve context
    ↓
Generate mandate
    ↓
Validate mandate
    ↓
Prepare commitment
    ↓
Execute financial workflow
    ↓
Collect execution evidence
    ↓
Settlement

The Recipe should produce a repeatable workflow rather than simply calling an LLM once.

For the Bazantic sponsor submission, separately demonstrate:

Same prompt
Same model
Same settings
Same API access

WITHOUT Recipe
        vs
WITH Recipe

and show a meaningful, repeatable improvement.

33. Bazantic Must Not Decide Settlement

Even if the Recipe orchestrates the workflow:

BAZANTIC
    ↓
"Execution completed"

must not directly mean:

SUCCESS

Instead:

BAZANTIC
    ↓
Execution evidence
    ↓
Deterministic verifier
    ↓
SUCCESS / FAILURE

This preserves the central product architecture.

34. Testing Requirements

The compiler must have automated tests for at least:

Test 1 — Normal request

Input:

Swap $1,000 USDC for at least 0.48 ETH
and send it to my treasury within one minute.

Expected:

VALID
Test 2 — Missing minimum output
Swap $1,000 USDC for ETH.

Expected:

NEEDS_CLARIFICATION
Test 3 — Missing recipient
Swap $1,000 USDC for at least 0.48 ETH.

Expected:

NEEDS_CLARIFICATION
Test 4 — Invalid asset
Swap $1,000 FakeCoin for ETH.

Expected:

INVALID
UNSUPPORTED_ASSET
Test 5 — Conflicting constraints
Spend at most $1,000,
but spend exactly $1,200.

Expected:

INVALID
CONFLICTING_CONSTRAINTS
Test 6 — Subjective objective
Get me the best possible ETH price.

Expected:

NEEDS_CLARIFICATION

or:

INVALID
UNSUPPORTED_OBJECTIVE

depending on the final product policy.

Test 7 — Untrusted address

The LLM attempts to output an address not present in the trusted registry.

Expected:

REJECT
Test 8 — Relative deadline
Complete it within one minute.

Expected:

deadline = compileTimestamp + 60 seconds
Test 9 — Equivalent phrasing

Verify that:

"Swap $1000 USDC for minimum 0.48 ETH"

"Convert 1000 USDC to at least 0.48 ETH"

"Buy at least 0.48 ETH with up to 1000 USDC"

produce semantically equivalent mandates.

Test 10 — Deterministic canonicalization

The same mandate generated through different natural-language phrasing must produce the same canonical representation when the resulting conditions are equivalent.

35. Security Requirements

The implementation must:

validate every LLM output
never trust model-generated addresses
never trust model-generated contract calldata
never use floating-point arithmetic for financial amounts
require user confirmation
separate interpretation from execution
separate execution from settlement
never allow natural language to directly invoke settlement
enforce supported asset/chain registries
make canonical mandate immutable once committed
36. MVP vs Future
MVP

Implement:

Natural language
        ↓
SWAP intent
        ↓
Structured mandate
        ↓
Validation
        ↓
User review
        ↓
Canonical mandate
        ↓
Commitment creation

Support:

USDC
ETH
one chain
one recipient registry
one execution venue
absolute + simple relative deadlines
max spend
minimum output
recipient
deadline
Future

The architecture should allow:

Multiple mandate types
PAYMENT
TREASURY_TRANSFER
RECURRING_PURCHASE
CROSS_CHAIN_TRANSFER
YIELD_ACTION
Compound conditions
Spend ≤ X
AND
Receive ≥ Y
AND
Recipient = Z
AND
Deadline ≤ T
AND
Gas ≤ G
Optimization objectives
minimize execution cost
maximize output
minimize slippage

These must eventually be compiled into deterministic measurable constraints.

Recurring commitments
Every Friday:
buy $500 ETH
Conditional commitments
If ETH falls below X:
execute purchase.
Agent negotiation
User
 ↓
Agent A proposes commitment
 ↓
Agent B accepts
 ↓
Bonded execution
Business/treasury mandates
"Move $50,000 USDC to payroll
if the payroll condition is satisfied."
Multi-verifier architecture

Future versions can support:

Execution
   ↓
Verifier A
Verifier B
Verifier C
   ↓
Quorum
   ↓
Settlement

This can reduce dependence on a single verifier.

37. Explicit Non-Goals

Do not build during this phase:

generic chatbot
autonomous unrestricted trading
portfolio manager
investment advisor
prediction engine
LLM-based settlement
LLM-based bond slashing
automatic recipient guessing
arbitrary token support
multi-chain execution
complex optimization engine
38. Definition of Done

06_MANDATE_COMPILER_SPEC.md is complete when:

 Natural-language swap requests can be interpreted.
 Output follows a strict schema.
 Missing information produces clarification.
 Unsupported assets are rejected.
 Recipients resolve only through trusted data.
 Relative deadlines become absolute timestamps.
 Financial amounts use integer base units.
 Deterministic validation runs after LLM generation.
 Canonical mandate representation is generated.
 User review occurs before commitment creation.
 Compiler cannot directly settle or slash commitments.
 Tests cover valid, invalid, ambiguous, and adversarial requests.
 Bazantic can orchestrate the compiler workflow without becoming the settlement authority.
 Architecture leaves room for future mandate types and compound conditions.
Implementation-agent instruction

Build this component as a financial intent compiler, not as a chatbot.

The critical architectural rule is:

The AI can propose what the user means. Deterministic code decides whether that proposal is structurally valid. The user approves it. The blockchain/verifier later decides whether the resulting financial commitment was fulfilled.

Do not collapse these responsibilities into one AI workflow.

Next document: 07_BAZANTIC_RECIPE_SPEC.md — this will define exactly how the Bazantic Recipe should orchestrate the agent workflow and how to make its sponsor integration materially meaningful rather than superficial.