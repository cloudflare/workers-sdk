---
"wrangler": patch
---

fix: kv:bulk should JSON encode its contents

The body passed to `kv:bulk delete` and `kv:bulk put` must be JSON encoded.
This change fixes that and adds some tests to prove it.

Fixes #547
