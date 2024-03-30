---
"@cloudflare/vitest-pool-workers": patch
---

fix: automatically re-run `SELF` tests without `import <main>`

By injecting a side-effect only import into tests when there is a `main` field specified
we can get Vitest to "know" when the SELF Worker has been modified and re-run tests automatically.
