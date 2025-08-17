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
   - How existing single commands work (like deploy, dev, etc.)

2. Review the project instructions at `@CLAUDE.md` for coding standards

**What to implement:**

1. Create `packages/wrangler/src/prompt/index.ts` with:

   - `promptCommand` - The main command with an `--auth` flag (handler can be a stub for now)
   - The `--auth` flag should trigger authentication flow instead of normal launch

2. Register this command in `packages/wrangler/src/index.ts`:
   - Import the new definition
   - Add it to the registry.define() call

**Key requirements from the spec:**

- Status should be "experimental"
- Owner should be "Workers: Authoring and Testing"
- Description should indicate it launches an AI assistant
- Include an `--auth` flag (boolean) for authentication flow
- The command should have `printConfigWarnings: false` behavior
- Follow the exact same patterns as existing commands

**Validation:**
After implementation, running `pnpm build --filter wrangler` should succeed and `wrangler prompt --help` should show the new command.

Don't implement the actual functionality yet - just set up the command structure with placeholder handlers that log "Not yet implemented".

---

## Milestone 2: Opencode Detection & Installation

### Prompt

I need you to implement Milestone 2 from the spec at `@docs/opencode.SPEC.md`. This milestone adds opencode detection and auto-installation functionality.

**Before you start:**

1. Use `@agent-codebase-explainer` to understand:

   - How wrangler handles external tool detection (look for patterns with `execaCommand` or `execaCommandSync`)
   - How wrangler displays progress and logs (analyze `packages/wrangler/src/logger.ts`)
   - How wrangler handles errors (look at `packages/wrangler/src/errors.ts`)

2. Review Milestone 1 implementation to understand the command structure

**What to implement:**

1. Create `packages/wrangler/src/prompt/opencode-manager.ts` with:

   - `detectOpencode()` function - Check if opencode is in PATH
   - `installOpencode()` function - Install via npm if missing

2. Update the handler in `packages/wrangler/src/prompt/index.ts`:
   - Add logic to detect opencode
   - If missing, call installOpencode
   - Log appropriate messages during the process
   - For now, just log success after detection/installation

**Key requirements from the spec:**

- Detection: Use `opencode --version` to check if installed
- Installation: Use `npm install -g opencode-ai`
- Stream npm output with prefix for visibility
- Use wrangler's logger for all output
- Throw UserError with helpful message if installation fails
- Use the string "opencode" directly when executing commands (rely on PATH)

**Validation:**

1. Build with `pnpm build --filter wrangler`
2. Test detection: Run `node packages/wrangler/wrangler-dist/cli.js prompt` with opencode installed
3. Test installation: Temporarily remove opencode with `npm uninstall -g opencode-ai` and run command again
4. Verify npm output is streamed with proper formatting

**Dependencies:**

- Requires Milestone 1 (command infrastructure)
- Uses `execa` for command execution (already in wrangler dependencies)

---

## Guidelines for Writing Additional Milestone Prompts

When writing prompts for remaining milestones, follow this structure:

1. **Reference the spec** - Don't re-specify requirements, point to the spec
2. **Provide context** - Tell them what to analyze with codebase-explainer
3. **Be specific about deliverables** - List exact files and components
4. **Include validation steps** - How to verify the implementation works
5. **Reference dependencies** - What from previous milestones is needed

Each prompt should be self-contained but build on previous work.
