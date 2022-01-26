---
"wrangler": patch
---

feat: error if a site definition doesn't have a `bucket` field

This PR adds an assertion error for making sure a `[site]` definition always has a `bucket` field.As a cleanup, I made some small fixes to the `Config` type definition, and modified the tests in `publish.test.ts` to use the config format when creating a `wrangler.toml` file.
