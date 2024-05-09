---
"edge-preview-authenticated-proxy": patch
"playground-preview-worker": patch
"@cloudflare/prerelease-registry": patch
"@cloudflare/vitest-pool-workers": patch
"workers-playground": patch
"create-cloudflare": patch
"@cloudflare/kv-asset-handler": patch
"turbo-r2-archive": patch
"format-errors": patch
"@cloudflare/pages-shared": patch
"workers.new": patch
"@cloudflare/quick-edit": patch
"miniflare": patch
"wrangler": patch
---

chore: match dependency versions across the repo

tl;dr: makes it so we never use different versions of a package anywhere in the repo. No functional changes.

- Installs @manypkg/cli (https://github.com/Thinkmill/manypkg)
- Run `manypkg check` which returns a list of all the mismatched dependencies
- Manually fix each dependency failure
- Run `manypkg fix` to fix any extra failures (like unordered dependencies in `package.json`s)
- Run `pnpm check`, `pnpm test`, `pnpm prettify` and fix any failures from them
- Added `check:repo` npm task that runs `manypkg check`, and added it to `npm run check` so it runs in CI
