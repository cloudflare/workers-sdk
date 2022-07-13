---
"wrangler": patch
---

fix: ensure that a helpful error message is shown when on unsupported versions of node.js

Our entrypoint for wrangler (`bin/wrangler.js`) needs to run in older versions of node and log a message to the user that they need to upgrade their version of node. Sometimes we use syntax in this entrypoint that doesn't run in older versions of node. crashing the script and failing to log the message. This fix adds a test in CI to make sure we don't regress on that behaviour (as well as fixing the current newer syntax usage)

Fixes https://github.com/cloudflare/wrangler2/issues/1443
