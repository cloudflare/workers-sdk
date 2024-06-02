---
"wrangler": patch
---

fix: correctly escape newlines in `constructType` function for multiline strings

This fix ensures that multiline strings are correctly handled by the `constructType` function. Newlines are now properly escaped to prevent invalid JavaScript code generation when using the `wrangler types` command. This improves robustness and prevents errors related to multiline string handling in environment variables and other configuration settings.