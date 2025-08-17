# PRD - Wrangler AI Assistant (opencode Integration)

**Owner:** Jacob
**Doc status:** Draft
**Last updated:** 2025-08-17

## Summary

Add a first‑party AI assistant to Cloudflare Wrangler by launching a preconfigured **opencode** experience via a new CLI entry point `wrangler prompt`. The assistant uses existing opencode installation or auto-installs via npm, is opinionated for Cloudflare products, ships with a Cloudflare Docs MCP server, and **runs a built‑in local Wrangler MCP server by default** to let the assistant plan and execute Wrangler tasks. Keep it simple, fast, and privacy‑respecting.

## Problem & Opportunity

- **Problem:** New and existing Wrangler users spend time context‑switching between docs, examples, and trial‑and‑error in the terminal. This slows onboarding, debugging, and adoption of Cloudflare features.
- **Opportunity:** A contextual assistant that knows Wrangler and Cloudflare products can cut time‑to‑first‑deploy, improve success rates for common tasks, and reduce support load.

## Goals (What success looks like)

- **G1.** One‑command launch of an AI assistant tuned for Cloudflare (`wrangler prompt`).
- **G2.** Assistant is grounded in Cloudflare docs via MCP; answers are accurate and linkable.
- **G3.** Minimal first‑run friction (clear auth flow, sensible defaults, no manual config needed).
- **G4.** Use opencode defaults for execution (no restrictive permissions on tool calls - see https://opencode.ai/docs/permissions/).
- **G5.** Works cross‑platform (macOS, Linux, Windows) and from any Wrangler project.
- **G6.** Local Wrangler MCP server is first‑class and enabled by default.

### Non‑Goals

- Full IDE replacement; this is a **companion** launched from Wrangler.
- Model research/benchmarking or a model‑picker UI.
- Pricing/billing changes or user‑visible quotas.
- Detailed delivery timeline in this PRD.

## Target Users & Key Jobs

- **Indie/solo developers**: "Guide me from zero → deploy quickly."
- **Pro/power users**: "Automate repetitive Wrangler tasks; remind me of exact flags."
- **Enterprise practitioners**: "Answer policy/compliance questions with citations to docs."

**Top Jobs‑to‑Be‑Done**

1. Bootstrap a new Worker, D1, KV, Queues, or AI service with correct config.
2. Diagnose failed deploys and runtime errors with actionable steps.
3. Find and apply the right Wrangler command/flag without leaving the terminal.
4. Execute safe Wrangler operations via a local tool interface.

## User Stories (must‑haves)

- **US1.** As a new user, I can run `wrangler prompt` and immediately get an assistant that understands Wrangler and Cloudflare docs.
- **US2.** As a user, I can authenticate once (`wrangler prompt auth`) using 3rd-party providers (Claude Code Max, Anthropic API key, etc.) and the assistant remembers it securely.
- **US3.** As a user, I get answers with **citations** into Cloudflare docs and copy‑pastable commands.
- **US4.** As a user, I can ask "why did `wrangler deploy` fail?" and get step‑by‑step fixes.
- **US5.** As a user, I can see what commands the assistant suggests to run.
- **US6.** As a user, I can launch from any project directory and the assistant picks up local context (e.g., `wrangler.toml`, bindings) read‑only by default.
- **US7.** As a user, I can request actions (e.g., "bind KV", "deploy") and the assistant will execute them using opencode's permission model.

**Nice‑to‑haves**

- **US8.** Remember recent projects and preferences (local‑only by default).
- **US9.** Integration with Cloudflare account authentication (post-MVP).

## Experience Overview

### Primary Flow (MVP)

1. User runs `wrangler prompt` in a terminal.
2. If **opencode** not installed → auto-install latest version from npm using the same package manager as wrangler (or npm if unknown).
3. On first run, prompt to authenticate via `wrangler prompt auth` using 3rd-party providers (Claude Code Max, Anthropic API key, etc.).
4. opencode launches with a **Cloudflare profile**:

   - Preloaded **system prompt**: teach the assistant Wrangler/Cloudflare voice, defaults, and guide it to look for wrangler.jsonc and other project files.
   - **Cloudflare Docs MCP server** (https://docs.mcp.cloudflare.com/mcp) configured and enabled.
   - No automatic project context injection (MVP); system prompt guides discovery.

- Local **Wrangler MCP server** is started and attached; tools are scoped and gated (dry‑run first; confirmation required for destructive actions).

5. The session home screen explains capabilities and privacy at a glance.

## Functional Requirements

**CLI**

- **FR1.** `wrangler prompt` launches opencode with a Cloudflare configuration profile.
- **FR2.** `wrangler prompt auth` passes through to opencode's auth flow for 3rd-party provider authentication (no Cloudflare account auth in MVP).
- **FR3.** `wrangler prompt --help` documents behavior, privacy, and examples.

**opencode Configuration**

- **FR4.** Ship a Cloudflare **system prompt** (versioned) focused on Wrangler tasks, safety, and tone.
- **FR5.** Preconfigure **Cloudflare Docs MCP server** at https://docs.mcp.cloudflare.com/mcp (source of truth docs; citation friendly).
- **FR6.** System prompt guides opencode to discover project context (wrangler.jsonc, etc.); no automatic injection in MVP.
- **FR7.** Link out to exact doc pages in responses; prefer least‑privilege scopes for any APIs.

**Platform/Distribution**

- **FR8.** Support macOS, Linux, Windows.
- **FR9.** Handle cases where opencode is absent: auto-install from npm using detected package manager.
- **FR10.** Graceful failure: if assistant cannot launch, Wrangler still works normally.

**Telemetry & Privacy**

- **FR11.** No additional telemetry beyond existing wrangler collection.
- **FR12.** Clear privacy statement in `--help` and first‑run banner.

**Docs & Support**

- **FR13.** Dedicated docs page with quickstart, privacy, and troubleshooting.
- **FR14.** In‑product messages link to docs and community resources.

**Wrangler Local MCP (first‑class)**

- **FRL1.** A local MCP server embedded in Wrangler starts automatically with `wrangler prompt` and exposes a **Wrangler Tool** surface (introspects allowed commands).
- **FRL2.** Tools execute according to opencode's permission model.
- **FRL3.** opencode starts without restrictive permissions (see https://opencode.ai/docs/permissions/ for details).
- **FRL4.** Allow pluggable helpers (e.g., project file reader scoped to the current workspace, tail logs, Workers KV/D1 helpers) behind explicit approval.

## Non‑Functional Requirements

- **NFR1.** Launch time target: fast perceived start (≤2s when opencode already installed).
- **NFR2.** Reliability: Wrangler remains fully functional even if opencode fails.
- **NFR3.** Security: least‑privilege; do not store secrets in plaintext; respect platform keychains where relevant.
- **NFR4.** Privacy: do not upload project files or secrets without explicit consent.
- **NFR5.** Accessibility: CLI output readable with default terminal settings.
- **NFR6.** Local‑first; offline‑friendly messaging when docs/MCP unreachable.
- **NFR7.** Local MCP binds to localhost only; no externally exposed ports.

## Success Metrics (directional)

- **Activation:** % of unique Wrangler users who run `wrangler prompt` at least once.
- **Engagement:** Median session length or Qs answered before exit.
- **Effectiveness:** Task completion rate for common flows (e.g., "first deploy", "bind KV").
- **Execution adoption:** % of sessions that proceed from plan → confirm (vs. suggest‑only).
- **Support impact:** Reduction in top doc/support search queries related to Wrangler errors.
- **Quality:** User‑reported helpfulness (thumbs up rate) and citation click‑through.

## Risks & Mitigations

- **R1. Incorrect or unsafe suggestions** → Guardrails in system prompt; opencode's permission model handles execution safety.
- **R2. Auth/setup friction** → Dedicated `wrangler prompt auth` for 3rd-party providers; auto-install if needed.
- **R3. Docs drift** → Versioned system prompt and MCP config; scheduled updates.
- **R4. Platform variance (Windows/macOS/Linux)** → Explicit testing matrix; platform‑specific install guidance.
- **R5. Privacy concerns** → Transparent messaging; opt‑out flag; local‑only by default.
- **R6. MCP server security** → Bind to localhost; opencode handles permissions per its documentation.

## Key Decisions

1. **opencode Distribution:** Use existing opencode installation if present; otherwise auto-install latest version from npm package `opencode-ai` using the same package manager as wrangler (or npm if unknown). opencode auto-updates independently.

2. **Authentication:** Pass-through to opencode's interactive UI for 3rd-party provider auth (Claude Code Max, Anthropic API key, etc.). No Cloudflare account authentication in MVP.

3. **Cloudflare Docs MCP:** Endpoint is https://docs.mcp.cloudflare.com/mcp

4. **Project Context:** No automatic injection in MVP; system prompt guides opencode to discover wrangler.jsonc and other project files.

5. **Configuration:** No user-editable config overrides in MVP.

6. **Telemetry:** No additional telemetry beyond existing wrangler collection.

7. **Interaction Model:** Purely conversational; no templates or wizards in MVP.

8. **Naming:** Keep `wrangler prompt` (avoids conflict with existing `wrangler ai` command).

9. **Execution Permissions:** opencode starts without restrictive permissions (see https://opencode.ai/docs/permissions/).

## Acceptance Criteria (MVP)

- ***

## Appendix

### Example CLI Help (draft)

```
wrangler prompt
    Launch a Cloudflare‑tuned AI assistant (via opencode) with a **local Wrangler MCP server**.

    Examples:
      wrangler prompt                  # start assistant + local MCP in current project
      wrangler prompt auth             # authenticate with 3rd-party provider

    Notes:
      • Answers cite Cloudflare docs when possible.
      • opencode handles permissions per its documentation.
      • Project files are read locally; nothing is uploaded without consent.
      • Uses existing wrangler telemetry settings.
```

### System Prompt (outline - to be authored)

- Prioritize accuracy, citations, and least‑privilege recommendations.
- Prefer Wrangler commands with brief reasoning; link to docs.
- Look for wrangler.jsonc and other project configuration files.
- Follow opencode's permission model.
- Be concise; use step‑by‑step bullets.
