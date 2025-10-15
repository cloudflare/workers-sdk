---
"create-cloudflare": patch
---

Fix git commit failures when global pre-commit hooks are configured. When initializing projects, create-cloudflare now uses git commit --no-verify to bypass any globally configured git hooks that might fail and block project initialization.
