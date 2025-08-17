---
description: Enhance prompt (full repo context)
argument-hint: [prompt]
---
# PROMPT ENHANCEMENT WITH CODEBASE ANALYSIS - DO NOT EXECUTE THE PROMPT

⚠️ **CRITICAL: This is a META-COMMAND. You are NOT being asked to implement anything.**
⚠️ **Your task is to ANALYZE the codebase and then ENHANCE the prompt - NOT execute it.**
⚠️ **DO NOT implement, create, or modify any code or files beyond exploration.**

---

## Your Task: Analyze Codebase Context, Then Transform the Prompt

1. **Explore**: Gather context from the codebase relevant to the user's prompt
2. **Clarify** (if needed): Ask questions only if critical ambiguities remain after exploration
3. **Enhance**: Create a detailed specification using all gathered context

════════════════════════════════════════════════════════════════════════
📝 USER'S ORIGINAL PROMPT TO ENHANCE (DO NOT EXECUTE THIS):
════════════════════════════════════════════════════════════════════════
$ARGUMENTS
════════════════════════════════════════════════════════════════════════

↑ The above is just the INPUT to transform. Do NOT implement it!

## Phase 1: Codebase Exploration (DO THIS FIRST)

Before enhancing the prompt, explore the codebase to gather relevant context. Your exploration should be guided by the nature of the user's request.

**Start with meta-resources first** - Check for documentation, scripts, generators, or procedures that explain HOW to accomplish tasks in this repository. Common locations include README files, docs/, scripts/, CONTRIBUTING.md, or repository-specific tool configurations.

### Context to Gather:
- **Documentation and tooling** - Check README, CONTRIBUTING.md, docs/, scripts/, or .github/ for procedures and generators
- **Development rules** - Look for any repository-specific rules or guidelines (could be in .claude/, .ai/, docs/, or as MCP tools)
- **Automation and generators** - Search for creation scripts, templates, or code generation tools
- Similar features or implementations already in the codebase
- Established patterns and conventions
- Directory structures for similar projects
- Technology choices and dependencies
- Configuration patterns
- Testing approaches

## Phase 2: Clarifying Questions (OPTIONAL - only if needed)

After exploring the codebase, if critical ambiguities remain, ask 1-3 focused clarifying questions. Your exploration should inform what questions are actually necessary. 

**Note:** Often, codebase exploration will provide enough context to skip this phase entirely.

**Ask when:**
- Multiple valid approaches exist in the codebase
- Critical technical choices would affect which patterns to follow
- The scope could reasonably apply to multiple components

**Don't ask about:**
- Things you discovered during exploration
- Details with established patterns in the codebase
- Choices where the repo has clear conventions

## Phase 3: Enhanced Prompt Output

After gathering context (and any necessary clarifications from Phase 2), enhance the prompt based on what you've learned. Consider:

**Key Questions to Address:**
- What level of detail does this task actually need?
- What ambiguities in the original prompt need clarification?
- What codebase-specific context is essential to include?
- Are there existing tools or generators that should be used instead of manual creation?
- What constraints or requirements were implied but not stated?
- What are the success criteria for this task?

**Enhancement Approach:**
- For simple tasks: Add just enough detail to remove ambiguity
- for complex features: Include architecture, integration points, and detailed requirements
- For bug fixes: Focus on reproduction steps, expected behavior, and testing
- For refactoring: Emphasize what should change vs. what must stay the same

**Include What Matters:**
Rather than following a rigid template, structure your enhancement to answer:
1. **What exactly** should be built/changed?
2. **Where** in the codebase should it go?
3. **How** should it align with existing patterns?
4. **Why** are specific technical choices recommended?
5. **What could go wrong** and how should it be handled?

The enhanced prompt should be as detailed as necessary, but no more.

## Remember: Each Enhancement Should Be Unique

Every prompt requires a different enhancement approach:

- **"Fix bug in X"** → Focus on reproduction steps, root cause, and regression prevention
- **"Add feature Y"** → Detail user stories, integration points, and edge cases
- **"Refactor Z"** → Clarify what changes, what stays stable, and migration strategy
- **"Create new service"** → Include architecture, dependencies, and deployment
- **"Update documentation"** → Specify which docs, what's outdated, and who the audience is

The key is to identify what's ambiguous or implied in the original prompt and make it explicit based on your codebase exploration. Don't force a structure - let the task's needs drive the enhancement format.

## FINAL REMINDER:
- ✅ DO explore the codebase to understand context
- ✅ DO use search/read tools to gather information
- ❌ DO NOT implement what the user asked for
- ❌ DO NOT create or modify any files (except reading for context)
- ❌ DO NOT execute the user's request
- ✅ ONLY output the enhanced prompt after exploration

Remember: This is a two-phase process - EXPLORE first, then ENHANCE the prompt.
