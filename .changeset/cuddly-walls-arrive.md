---
"wrangler": patch
---

Fix skills-install prompt reappearing when not answered and getting stuck with concurrent wrangler instances

Previously, if the skills-install prompt was never answered — whether due to Ctrl+C, a crash, `kill`, or any other interruption — no metadata file was written, causing the prompt to reappear on every subsequent `wrangler` invocation. The metadata file is now written with `accepted: "unanswered"` before agent detection and before the prompt is shown, so any scenario where the user does not answer leaves the file on disk and prevents the prompt from reappearing. When the user answers, the file is overwritten with the real response.

Additionally, running two `wrangler` instances concurrently could cause both to show the prompt simultaneously, corrupting the terminal. A PID-based coordination protocol now detects concurrent instances: the second instance writes its own PID and skips the prompt, while the first instance detects the PID change and silently aborts.
