---
"create-cloudflare": patch
---

Use the default React variant when `--accept-defaults` is passed

Previously, `npm create cloudflare -- --framework=react --accept-defaults` still stopped at the "Select a variant" prompt, so it couldn't run unattended. C3 now picks the default TypeScript variant without prompting, as it already does for the Next.js adapter prompt. Pass `--variant` to choose a different one.
