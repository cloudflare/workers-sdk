---
"wrangler": patch
---

Use the new PATCH APIs for versioned secret commands

Wrangler now updates versioned Worker secrets by patching the latest Worker version instead of downloading the latest version contents and uploading a full replacement version. This avoids reconstructing Worker configuration in Wrangler, which should reduce bugs when Workers use less common features. For example, this avoids regressions like the previous placement preservation bug fixed in [#13843](https://github.com/cloudflare/workers-sdk/pull/13843).
