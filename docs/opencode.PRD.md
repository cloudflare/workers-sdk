# PRD - Wrangler AI Assistant (opencode Integration)

**Owner:** Jacob
**Doc status:** Draft
**Last updated:** 2025-08-17

---

## Summary

Add a first‑party AI assistant to Cloudflare Wrangler by launching a preconfigured **opencode** experience via a new CLI entry point `wrangler prompt`. The assistant is opinionated for Cloudflare products, ships with a Cloudflare Docs MCP server, and **runs a built‑in local Wrangler MCP server by default** to let the assistant plan and (with user confirmation) execute Wrangler tasks safely. Keep it simple, fast, and privacy‑respecting.

---

## Problem & Opportunity

- **Problem:** New and existing Wrangler users spend time context‑switching between docs, examples, and trial‑and‑error in the terminal. This slows onboarding, debugging, and adoption of Cloudflare features.
- **Opportunity:** A contextual assistant that knows Wrangler and Cloudflare products can cut time‑to‑first‑deploy, improve success rates for common tasks, and reduce support load.

---

## Goals (What success looks like)

- **G1.** One‑command launch of an AI assistant tuned for Cloudflare (`wrangler prompt`).
- **G2.** Assistant is grounded in Cloudflare docs via MCP; answers are accurate and linkable.
- **G3.** Minimal first‑run friction (clear auth flow, sensible defaults, no manual config needed).
- **G4.** Safe execution (no destructive actions without explicit user consent; dry‑run guidance).
- **G5.** Works cross‑platform (macOS, Linux, Windows) and from any Wrangler project.
- **G6.** Local Wrangler MCP server is first‑class and enabled by default (plan → dry‑run → confirm → execute).

### Non‑Goals

- Full IDE replacement; this is a **companion** launched from Wrangler.
- Model research/benchmarking or a model‑picker UI.
- Pricing/billing changes or user‑visible quotas.
- Detailed delivery timeline in this PRD.

---

## Target Users & Key Jobs

- **Indie/solo developers**: "Guide me from zero → deploy quickly."
- **Pro/power users**: "Automate repetitive Wrangler tasks; remind me of exact flags."
- **Enterprise practitioners**: "Answer policy/compliance questions with citations to docs."

**Top Jobs‑to‑Be‑Done**

1. Bootstrap a new Worker, D1, KV, Queues, or AI service with correct config.
2. Diagnose failed deploys and runtime errors with actionable steps.
3. Find and apply the right Wrangler command/flag without leaving the terminal.
4. Execute safe Wrangler operations via a local tool interface.

---

## User Stories (must‑haves)

- **US1.** As a new user, I can run `wrangler prompt` and immediately get an assistant that understands Wrangler and Cloudflare docs.
- **US2.** As a user, I can authenticate once (`wrangler prompt auth`) and the assistant remembers it securely.
- **US3.** As a user, I get answers with **citations** into Cloudflare docs and copy‑pastable commands.
- **US4.** As a user, I can ask "why did `wrangler deploy` fail?" and get step‑by‑step fixes.
- **US5.** As a user, I can opt‑out of any command execution; assistant will show dry‑run diffs or commands to run manually.
- **US6.** As a user, I can launch from any project directory and the assistant picks up local context (e.g., `wrangler.toml`, bindings) read‑only by default.
- **US7.** As a user, I can request actions (e.g., "bind KV", "deploy") and get a **plan → dry‑run → confirm** flow with clear diffs before any execution.

**Nice‑to‑haves**

- **US7.** Remember recent projects and preferences (telemetry‑light, local‑only by default).
- **US8.** Provide templated flows (e.g., "Add D1 to this Worker").

---

## Experience Overview

### Primary Flow (MVP)

1. User runs `wrangler prompt` in a terminal.
2. If **opencode** not set up → guided install/launch instructions.
3. On first run, prompt to authenticate via `wrangler prompt auth` (pass‑through to opencode auth).
4. opencode launches with a **Cloudflare profile**:

   - Preloaded **system prompt**: teach the assistant Wrangler/Cloudflare voice, defaults, safety rules.
   - **Cloudflare Docs MCP server** configured and enabled.
   - Project context discovery (read‑only): `wrangler.toml`, package.json, env hints.

- Local **Wrangler MCP server** is started and attached; tools are scoped and gated (dry‑run first; confirmation required for destructive actions).

5. The session home screen explains capabilities and privacy at a glance.

---

## Functional Requirements

**CLI**

- **FR1.** `wrangler prompt` launches opencode with a Cloudflare configuration profile.
- **FR2.** `wrangler prompt auth` passes through to opencode's auth flow.
- **FR3.** `wrangler prompt --help` documents behavior, privacy, and examples.

**opencode Configuration**

- **FR4.** Ship a Cloudflare **system prompt** (versioned) focused on Wrangler tasks, safety, and tone.
- **FR5.** Preconfigure **Cloudflare Docs MCP server** (source of truth docs; citation friendly).
- **FR6.** Auto‑detect project context; never transmit files unless user consents.
- **FR7.** Link out to exact doc pages in responses; prefer least‑privilege scopes for any APIs.

**Platform/Distribution**

- **FR8.** Support macOS, Linux, Windows.
- **FR9.** Handle cases where opencode is absent: show one‑step setup guidance or fallback instructions.
- **FR10.** Graceful failure: if assistant cannot launch, Wrangler still works normally.

**Telemetry & Privacy**

- **FR11.** Minimal, anonymous usage metrics for `wrangler prompt` (launch result, platform, version); **no content** logging by default.
- **FR12.** Clear privacy statement in `--help` and first‑run banner; opt‑out flag/env.

**Docs & Support**

- **FR13.** Dedicated docs page with quickstart, privacy, and troubleshooting.
- **FR14.** In‑product messages link to docs and community resources.

**Wrangler Local MCP (first‑class)**

- **FRL1.** A local MCP server embedded in Wrangler starts automatically with `wrangler prompt` and exposes a **Wrangler Tool** surface (introspects allowed commands).
- **FRL2.** Support a **plan → dry‑run → confirm → execute** loop with human‑readable diffs when applicable.
- **FRL3.** Tools are permissioned and logged per session; destructive actions require explicit confirmation. Provide `--no-exec` to disable execution for a session.
- **FRL4.** Allow pluggable helpers (e.g., project file reader scoped to the current workspace, tail logs, Workers KV/D1 helpers) behind explicit approval.

---

## Non‑Functional Requirements

- **NFR1.** Launch time target: fast perceived start (≤2s when opencode already installed).
- **NFR2.** Reliability: Wrangler remains fully functional even if opencode fails.
- **NFR3.** Security: least‑privilege; do not store secrets in plaintext; respect platform keychains where relevant.
- **NFR4.** Privacy: do not upload project files or secrets without explicit consent.
- **NFR5.** Accessibility: CLI output readable with default terminal settings.
- **NFR6.** Local‑first; offline‑friendly messaging when docs/MCP unreachable.
- **NFR7.** Local MCP binds to localhost only and uses an ephemeral per‑session token; no externally exposed ports.

---

## Success Metrics (directional)

- **Activation:** % of unique Wrangler users who run `wrangler prompt` at least once.
- **Engagement:** Median session length or Qs answered before exit.
- **Effectiveness:** Task completion rate for common flows (e.g., "first deploy", "bind KV").
- **Execution adoption:** % of sessions that proceed from plan → confirm (vs. suggest‑only).
- **Support impact:** Reduction in top doc/support search queries related to Wrangler errors.
- **Quality:** User‑reported helpfulness (thumbs up rate) and citation click‑through.

---

## Risks & Mitigations

- **R1. Incorrect or unsafe suggestions** → Guardrails in system prompt; require confirmation for any action; prefer dry‑run diffs.
- **R2. Auth/setup friction** → Dedicated `wrangler prompt auth`; clear first‑run wizard.
- **R3. Docs drift** → Versioned system prompt and MCP config; scheduled updates.
- **R4. Platform variance (Windows/macOS/Linux)** → Explicit testing matrix; platform‑specific install guidance.
- **R5. Privacy concerns** → Transparent messaging; opt‑out flag; local‑only by default.
- **R6. MCP server security** → Bind to localhost, per‑session auth, explicit permission prompts; clear `--no-exec` escape hatch.

---

## Open Questions (for Jacob)

1. Which **opencode** distribution/version do we target and how is it installed/launched?
   **Answer:** we will use existing opencode installation if it exists. If it doesn't, we will auto-install the latest version of [https://www.npmjs.com/package/opencode-ai](https://www.npmjs.com/package/opencode-ai) using the same package manager that wrangler is using (or npm if unknown). opencode auto-updates so we don't need to manually update via package manager (though we may want to check for updates periodically via `opencode upgrade` )
2. Exact **auth** flow: does pass‑through open a browser, use a device code, or delegate to existing CLI creds?
   **Answer:** opencode has an interactive UI that allows authenticating with various 3rd-party providers. For now, there will not be a way to auth using a Cloudflare account. A 3rd-party provider will be required (e.g. Claude Code Max subscription, Anthropic API key, etc.)
3. What's the authoritative **Cloudflare Docs MCP** endpoint and its update cadence?
   **Answer:** [https://docs.mcp.cloudflare.com/mcp](https://docs.mcp.cloudflare.com/mcp) is the mcp url - the update cadence is irrelevant to this PRD.
4. Do we inject **project context** by default, or prompt before reading any files each session?
   **Answer:** we will not inject project context for this MVP, but we will include system prompt instructing opencode to look for wrangler.jsonc, etc. to understand the project better.
5. Where should user‑editable **config overrides** live (e.g., `~/.config/wrangler/assistant.{json,toml}`)?
   **Answer:** for this MVP, no overrides are allowed
6. What **telemetry** fields are acceptable (and defaults for opt‑in/out)?
   **Answer:** we are not adding any additional telemetry beyond what wrangler automatically collects already.
7. Should we offer curated **templates/playbooks** (e.g., "Add D1" wizard), or keep v1 purely conversational?
   **Answer:** keep it purely conversational for now.
8. Naming: keep `wrangler prompt` or prefer `wrangler ai` for discoverability?
   **Answer:** keep `wrangler prompt` because `wrangler ai` already exists and is used for unrelated features.
9. Default execution mode: start with execution enabled (confirm required) or start in suggest‑only mode with `--exec` to enable?
   **Answer:** for this MVP, we will start opencode without any restrictive permissions - see docs for details: [https://opencode.ai/docs/permissions/](https://opencode.ai/docs/permissions/)

---

## Acceptance Criteria (MVP)

- ***

## Appendix

### Example CLI Help (draft)

```
wrangler prompt
    Launch a Cloudflare‑tuned AI assistant (via opencode) with a **local Wrangler MCP server**.

    Examples:
      wrangler prompt                  # start assistant + local MCP in current project
      wrangler prompt --no-exec        # disable command execution (suggest-only)
      wrangler prompt auth             # authenticate the assistant

    Notes:
      • Answers cite Cloudflare docs when possible.
      • Local MCP uses plan → dry‑run → confirm → execute; destructive actions require confirmation.
      • Project files are read locally; nothing is uploaded without consent.
      • Use --no-telemetry to disable anonymous usage metrics.
```

### System Prompt (outline - to be authored)

- Prioritize accuracy, citations, and least‑privilege recommendations.
- Always propose a **dry‑run** path before execution.
- Prefer Wrangler commands with brief reasoning; link to docs.
- Ask before reading files or running tools.
- Be concise; use step‑by‑step bullets.
