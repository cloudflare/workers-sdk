---
"@cloudflare/devprod-status-bot": patch
---

Migrate bot message generation off the deprecated `@cf/meta/llama-2-7b-chat-int8` Workers AI model

Workers AI is deprecating Llama 2 7B chat (alongside several other older models) on May 30th 2026. The status bot now uses `@cf/google/gemma-4-26b-a4b-it` (Gemma 4) for generating its short, friendly chat messages.
