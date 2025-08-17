---
description: Execute task with clarifying questions if needed
argument-hint: [task to perform]
---
# EXECUTE TASK WITH CLARIFYING QUESTIONS

This command tells Claude to perform the requested task, but to ask clarifying questions first when the request is ambiguous or missing important details.

════════════════════════════════════════════════════════════════════════
📋 TASK TO PERFORM:
════════════════════════════════════════════════════════════════════════
$ARGUMENTS
════════════════════════════════════════════════════════════════════════

## Your Approach:

1. **Assess the request** - Is it clear enough to implement correctly?

2. **If clarification needed** - Ask 1-3 focused questions about what's genuinely unclear:
   - Focus on the biggest ambiguity first
   - Keep questions simple and direct
   - Avoid listing multiple sub-options within questions

3. **After receiving answers** - Proceed with the implementation incorporating the clarified details

4. **If already clear** - Skip questions and implement directly

## When to Ask Questions:

**Ask when:**
- Multiple valid interpretations exist
- You find yourself making non-obvious assumptions
- The request could apply to multiple locations/files
- Key technical decisions aren't specified

**Don't ask when:**
- The request is straightforward
- Context makes the intent clear
- Reasonable defaults exist
- The task is simple and unambiguous

## Key Principles:

- **Less is more** - 1-2 well-chosen questions are better than 4 detailed ones
- **Simple questions** - Keep them direct and easy to answer
- **Assume sensible defaults** - Don't ask about obvious implementation details
- **Focus on the core ambiguity** - What's the ONE thing that would most change your implementation?

## Remember:

This is the same as when users say "ask clarifying questions if needed" - be thoughtful about when questions add value versus when they just add friction. The goal is to implement the task correctly, using clarifying questions as a tool when genuinely helpful.