Critically review recent code, architecture, or behavior changes and update all affected project documentation so the knowledge base remains the source of truth.

This task is NOT optional bookkeeping.
Documentation accuracy is part of system correctness.


# OBJECTIVE

Ensure steering docs, specs, architectural notes, and knowledge-base files accurately reflect the current system.

Preserve:
- Why decisions were made
- What constraints exist
- What tradeoffs were accepted
- What assumptions changed


# PROCESS (FOLLOW STRICTLY)

## Step 1: Identify What Changed
Analyze the recent updates and determine:

- What new behavior now exists?
- What previous assumptions changed?
- What architectural decisions were made?
- What constraints were discovered?
- What risks or failure cases were revealed?

## Step 2: Find Affected Documentation
Determine which documents should be updated, including:

- Steering documents
- Specs
- Architecture notes
- Plugin contracts
- UX behavior docs
- Failure handling docs
- Knowledge base files

## Step 3: Update for Accuracy
Revise docs to reflect reality.

Ensure documentation captures:
- Current behavior
- Responsibilities
- Boundaries
- States
- Failure handling
- Tradeoffs
- Rationale behind decisions

## Step 4: Check for Drift
Identify places where:
- Docs no longer match code
- Specs conflict with implementation
- Older assumptions are now incorrect

Call these out clearly.


# QUALITY RULES

## Preserve WHY
Do not only document WHAT changed.

Always capture:
- Why the change happened
- Why this approach was chosen
- What alternatives were rejected (if relevant)

## Maintain Clarity
Keep docs:
- Structured
- Concise
- Actionable
- Easy for future humans or AI to trust

## Prevent Silent Divergence
If implementation changed but docs were not updated, treat that as a problem to resolve.


# OUTPUT FORMAT

Provide:

1. Documents that need updating  
2. What should change in each  
3. Drift/conflicts discovered  
4. Suggested revised wording where helpful  


# GUIDING PRINCIPLE

If system behavior changed, documentation must change too.