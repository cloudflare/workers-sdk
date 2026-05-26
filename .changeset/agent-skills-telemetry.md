---
"wrangler": minor
---

Add telemetry for detecting whether AI coding agents have Cloudflare skills installed

Wrangler now includes a `currentAgentSkillsInstalled` property in telemetry events that reports whether the current AI coding agent has Cloudflare skills present on disk. The value distinguishes between skills installed automatically by Wrangler (`"automatic"`), skills installed manually by the user (`"manual"`), no skills present (`false`), or no supported agent detected (`null`). Skill names are fetched from the GitHub Contents API with a 24-hour disk cache to avoid rate limits.
