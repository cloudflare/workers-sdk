---
"create-cloudflare": patch
---

Fix scaffolding of Qwik projects when `@cloudflare/workers-types` v5 is installed

`@cloudflare/workers-types` v5 removed the date-versioned entrypoints (e.g. `@cloudflare/workers-types/2024-01-01`) in favour of a single bare package import. C3 previously only added a date-versioned entrypoint to `tsconfig.json` and skipped updating the config entirely when none could be found, leaving templates that install workers-types (such as Qwik) without any Cloudflare types.

C3 now falls back to adding the bare `@cloudflare/workers-types` entry when no date-versioned entrypoint is available, so the correct types are always configured regardless of the installed version.
