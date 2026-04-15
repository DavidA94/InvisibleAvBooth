Critically evaluate the provided plan, design, or steering document for completeness and real-world usability.

This is NOT a surface-level review.

Your goal is to identify missing pieces, hidden assumptions, and lifecycle gaps that would cause problems during implementation or live use.

# OBJECTIVE

Ensure the plan is complete, realistic, and usable in production—especially by non-technical users in a live environment.

Focus on:

- Full lifecycle coverage
- Real user interaction
- Failure handling
- Missing prerequisites

# REVIEW PROCESS (FOLLOW STRICTLY)

## 1. Interaction & Access

Evaluate:

- What does the interaction actually look like?
- Is it UI, API, or background behavior?
- How does the user reach this feature?
- Is navigation or triggering clearly defined?

Call out anything vague or missing.

## 2. Setup & Prerequisites

Evaluate:

- What must exist before this works?
  - Users
  - Devices
  - Credentials
  - Config
- How are those created or configured?
- Is first-time setup defined?

Flag any “magic assumptions” (e.g., users already exist).

## 3. Lifecycle Coverage

Check if the plan covers:

- First-time setup
- Normal operation
- Repeated use
- Edge cases
- Failure scenarios
- Recovery

Identify gaps in any phase.

## 4. State & Data Handling

Evaluate:

- Where does data live?
- Is it persisted or temporary?
- How is it created, updated, and cleared?

Call out unclear or missing data flow.

## 5. Ownership & Responsibility

Evaluate:

- Who is responsible for each action?
  - User
  - Admin
  - System
- Are responsibilities clearly defined?

Flag ambiguity or overlap.

## 6. Failure & Recovery

Evaluate:

- What can go wrong?
- Will the user notice?
- Can they fix it quickly?

Identify:

- Silent failures
- Hard-to-recover states
- Missing error handling

## 7. User Feedback & Visibility

Evaluate:

- How does the user know something worked?
- Are important states visible?
- Is feedback immediate and clear?

Flag anything that could confuse a non-technical user.

## 8. Real-World Stress Test

Simulate:

"A volunteer who hasn’t used this system in weeks is under time pressure."

Evaluate:

- What breaks?
- What is unclear?
- What requires memory instead of guidance?

## 9. Decision Rationale (WHY Validation)

Evaluate whether important decisions include clear reasoning.

Check:

- Are key decisions explained, or just stated?
- Is it clear WHY this approach was chosen?
- Were alternatives considered or implied?
- Are constraints documented (UX, hardware, real-time, simplicity)?
- Would a future developer understand the intent behind this?

Flag:

- Decisions with no explanation
- “Default” choices that were never justified
- Areas where multiple approaches exist but no rationale is given

Call out where missing WHYs could lead to:

- Incorrect refactors
- Misuse of the system
- Loss of important constraints

Suggest where rationale comments or documentation should be added.

# OUTPUT FORMAT

Provide:

## 1. Critical Gaps

- Missing pieces that would break the system or block implementation

## 2. Hidden Assumptions

- Things the plan assumes but does not define

## 3. Usability Risks

- Areas where a real user would struggle

## 4. Failure Risks

- Scenarios not properly handled

## 5. Suggested Improvements

- Concrete fixes or additions

# REVIEW STYLE

- Be direct and critical
- Do not soften issues
- Prioritize real-world correctness over politeness

# GUIDING PRINCIPLE

If a developer cannot implement this without guessing, or a volunteer cannot use it without confusion, the plan is incomplete.
