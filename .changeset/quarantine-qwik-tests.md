---
"create-cloudflare": patch
---

Temporarily quarantine Qwik framework E2E tests

- Disable Qwik framework E2E tests (`qwik:pages` and `qwik:workers`) while an upstream ESLint dependency conflict is resolved.
- No user-facing behavior changes in create-cloudflare; this patch is to keep CI green until the upstream fix lands.
