---
"wrangler": minor
---

Improve `wrangler types` error messages for AI coding agents

Error messages thrown by `wrangler types` now provide richer, structured guidance when Wrangler detects it is being invoked by an AI coding agent (e.g. Claude Code, Cursor, Copilot, etc). Human-facing messages remain unchanged.

When Wrangler detects it is running inside an AI coding agent, error messages now include additional context: what went wrong, how to fix it, and what to ask the human developer. You can control this behavior with the `WRANGLER_OUTPUTS_FOR_AGENTS` environment variable — set it to `"true"` to force AI-optimized output, or `"false"` to always use the concise human format.
