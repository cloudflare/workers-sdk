---
"@cloudflare/eslint-config-worker": major
---

Updated `import/order` and `unused-imports/no-unused-vars` to raise errors.

This change updates all rules currently raising warnings to instead raise errors. Our lint philosophy should not allow problems to be merged without being explicitly ignored.
