---
"wrangler": patch
---

feat: enhance `wrangler init`

This PR adds some enhancements/fixes to the `wrangler init` command.

- doesn't overwrite `wrangler.toml` if it already exists
- installs `wrangler` when creating `package.json`
- offers to install `wrangler` into `package.json` even if `package.json` already exists
- offers to install `@cloudflare/workers-types` even if `tsconfig.json` already exists
- pipes stdio back to the terminal so there's feedback when it's installing npm packages

This does have the side effect of making out tests slower. I added `--prefer-offline` to the `npm install` calls to make this a shade quicker, but I can't figure out a good way of mocking these. I'll think about it some more later. We should work on making the installs themselves quicker (re: https://github.com/cloudflare/wrangler2/issues/66)

This PR also fixes a bug with our tests - `runWrangler` would catch thrown errors, and if we didn't manually verify the error, tests would pass. Instead, it now throws correctly, and I modified all the tests to assert on thrown errors. It seems like a lot, but it was just mechanical rewriting.
