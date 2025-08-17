---
description: Enhance prompt (with enhanced explanations)
argument-hint: [prompt]
---
# EDUCATIONAL PROMPT ENHANCEMENT - DO NOT EXECUTE

⚠️ **CRITICAL: This is a META-COMMAND. You are NOT being asked to implement anything.**
⚠️ **Your task is to ask clarifying questions, then enhance the prompt after receiving answers.**
⚠️ **DO NOT execute, implement, or create any code or files.**

---

## Your Task: Help Users Create Better Prompts Through Clarifying Questions

This command is designed to help users learn how to write better prompts. You'll identify what information is missing or unclear, ask clarifying questions, and wait for their answers before creating the enhanced prompt.

════════════════════════════════════════════════════════════════════════
📝 USER'S ORIGINAL PROMPT TO CLARIFY (DO NOT EXECUTE THIS):
════════════════════════════════════════════════════════════════════════
$ARGUMENTS
════════════════════════════════════════════════════════════════════════

↑ The above is just the INPUT to clarify. Do NOT implement it!

## Your Response Structure:

### 1. Acknowledge the Task
Briefly summarize what you understand the user wants to accomplish (1-2 sentences).

### 2. Clarifying Questions (if needed)
If the prompt lacks important details, ask 1-3 focused questions:
"I need clarification on a few points:"

**Only ask about:**
- **Critical ambiguities** - Things that would completely change the approach (e.g., "Should this wait for user input?" vs "Should this show examples?")
- **Missing core details** - Essential information that's not implied
- **Non-obvious choices** - Where multiple valid approaches exist

**Don't ask about:**
- Implementation details that can use sensible defaults
- Advanced features for a basic version
- Things clearly implied by context or project structure

**Keep questions:**
- Simple and direct (avoid sub-options within questions)
- Focused on what would materially change the enhancement
- Limited to the most important clarifications

### 3. Teaching Moment
Briefly explain: "Including these details in your prompt helps because..."
(Keep this to 1-2 sentences)

### 4. Wait for Answers
End with: "Once you answer these questions, I'll create a comprehensive enhanced prompt that incorporates all the details."

## After Receiving Answers:

When the user provides answers, create an enhanced prompt that:
- Incorporates all the clarified details
- Makes implicit requirements explicit
- Follows the same adaptive format as `/prompt` (no rigid template)
- Highlights where their answers made the prompt clearer

Include a brief teaching note like: "Thanks for those clarifications! Here's the enhanced prompt that includes [specific detail from their answer], which helps because [reason]."

## What Makes a Good Clarifying Question:

Good questions:
- Address genuine ambiguities rather than fishing for details
- Focus on decisions that significantly affect implementation
- Respect the user's stated scope (prototype vs. production)
- Teach by revealing what was unclear

Poor questions:
- Ask about every possible feature or edge case
- Assume complexity when simplicity was implied
- Request details that have obvious defaults
- Overwhelm with choices when the user wants to start simple

## Teaching Principles:

- **Less is more** - 1-2 well-chosen questions teach better than 4 detailed ones
- **Recognize assumptions** - If you find yourself thinking "they probably mean X", that's a sign to ask for clarification
- **Match the scope** - For prototypes or experiments, keep questions simple. For production systems, dig deeper
- **Recognize good prompts** - If a prompt is already clear, acknowledge that and ask fewer questions
- **Be educational** - Help users understand what makes a good prompt without overwhelming them
- **Be specific** - Vague questions lead to vague answers
- **Be relevant** - Only ask questions that would materially affect the implementation
- **Be encouraging** - Frame this as collaborative improvement, not criticism

## When a Prompt is Already Good:

If the user's prompt is already quite clear, acknowledge this and either:
- Ask just 1-2 refinement questions if there are minor ambiguities
- Or proceed directly to create an enhanced prompt, noting: "Your prompt is already well-structured! Here's an enhanced version that makes the implicit details explicit:"

## FINAL REMINDER:
- ✅ DO ask thoughtful clarifying questions
- ✅ DO explain why details matter for good prompts
- ✅ DO wait for the user's answers before creating the enhanced prompt
- ❌ DO NOT implement anything
- ❌ DO NOT create an enhanced prompt until questions are answered

Remember: The goal is to teach users how to write better prompts through an interactive process, resulting in a more accurate enhanced prompt based on their specific needs.
