# Implementation Prompts for Wrangler + Opencode Integration

This document contains prompts for implementing each milestone of the wrangler + opencode integration. Each prompt is designed to be given to Claude to implement a specific milestone.

## General Instructions for All Milestones

Before starting any milestone:

1. Read the full specification at `@docs/opencode.SPEC.md`
2. Read the PRD at `@docs/opencode.PRD.md` for context
3. Use `@agent-codebase-explainer` to understand existing patterns before implementing (use multiple agents if needed). Note that opencode source code is available at `tmp/opencode` if needed.

Notes:

- Build with: `pnpm build --filter wrangler`
- Run with: `node packages/wrangler/wrangler-dist/cli.js`

## Milestone 1: Command Infrastructure

### Prompt

I need you to implement Milestone 1 from the spec at `@docs/opencode.SPEC.md`. This milestone sets up the basic command infrastructure for `wrangler prompt`.

**Before you start:**

1. Use `@agent-codebase-explainer` to understand how wrangler commands are structured by analyzing:

   - How commands are registered in `packages/wrangler/src/index.ts`
   - The command creation patterns in `packages/wrangler/src/core/`
   - How existing commands with subcommands work (like d1, r2, pages)

2. Review the project instructions at `@CLAUDE.md` for coding standards

**What to implement:**

1. Create `packages/wrangler/src/prompt/index.ts` with:

   - `promptNamespace` - The namespace for the prompt commands
   - `promptCommand` - The main command (handler can be a stub for now)
   - `promptAuthCommand` - The auth subcommand (handler can be a stub)

2. Register these commands in `packages/wrangler/src/index.ts`:
   - Import the new definitions
   - Add them to the registry.define() call
   - Register the namespace

**Key requirements from the spec:**

- Status should be "beta"
- Owner should be "Workers: Authoring and Testing"
- Description should indicate it launches an AI assistant
- The main command should have `printConfigWarnings: false` behavior
- Follow the exact same patterns as existing commands

**Validation:**
After implementation, running `pnpm build --filter wrangler` should succeed and `wrangler prompt --help` should show the new command.

Don't implement the actual functionality yet - just set up the command structure with placeholder handlers that log "Not yet implemented".

---

## Guidelines for Writing Additional Milestone Prompts

When writing prompts for remaining milestones, follow this structure:

1. **Reference the spec** - Don't re-specify requirements, point to the spec
2. **Provide context** - Tell them what to analyze with codebase-explainer
3. **Be specific about deliverables** - List exact files and components
4. **Include validation steps** - How to verify the implementation works
5. **Reference dependencies** - What from previous milestones is needed

Each prompt should be self-contained but build on previous work.
