Okay, the next phase is non-negotiable. We are going to be customer obsessed, and run a review three times. You WILL use subagents for each round of the review. After each round, you will present me with any open questions you need to fix the feedback. Then you'll fix the feedback, and do the next review round. Each review will give context of the entire project, so that the sub-agents understand what already exists, and will follow the below pattern. If you do not already have a project to review, STOP and ask what spec is getting reviewed, along with if there are any future specs that should be ignored.

1. Use the prompt at .kiro/prompts/planning-review.md to see if there are any issues with the multi-platform-streaming requirements or design
2. Use the prompt at .kiro/prompts/review-risk.md to see if there are any issues with the multi-platform-streaming requirements or design, or integration with the existing livestream-control-system 
3. Use the prompt at .kiro/prompts/update-docs.md" to see if there are any misalignments between the livestream-control-system and the multi-platform-streaming that aren't intentional, or if there are any conflicts between the multi-platform-streaming requirements and design
4. Raise any questions to me that I need to answer (it's okay if there are none)
5. Fix the issues
6. Proceed to the next round

For each round, you will use a sub-agent to call each prompt. You will give it appropriate context before putting in the aforementioned file, so that it can appropriately run the checks.

We will do three total rounds to start, and may do more depending on where things land. This isn't excessive, it's customer obsessed and gets us a well-built product.

If there are no questions, let's get started.