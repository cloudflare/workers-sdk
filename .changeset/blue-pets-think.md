---
"wrangler": patch
---

fix: let "assets" in wrangler.toml be a string

The experimental "assets" field can be either a string or an object. However the type definition marks it only as an object. This is a problem because we use this to generate the json schema, which gets picked up by vscode's even better toml extension, and shows it to be an error when used with a string (even though it works fine). The fix is to simply change the type definition to add a string variant.
