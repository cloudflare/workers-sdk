---
"wrangler": minor
---

Improve `wrangler types` error messages for AI coding agents

Error messages thrown by `wrangler types` now provide richer, structured guidance when Wrangler detects it is being invoked by an AI coding agent (e.g. Claude Code, Cursor, Copilot). Human-facing messages remain unchanged.

This introduces a new `CLIError` base class that automatically selects between a concise human message and a verbose, structured-markdown AI message based on the detected execution environment. All errors in `wrangler types` have been migrated to use this system.
