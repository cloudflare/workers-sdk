---
"wrangler": minor
---

Add a `wrangler check startup` command to generate a CPU profile of your Worker's startup phase.

This can be imported into Chrome DevTools or opened directly in VSCode to view a flamegraph of your Worker's startup phase. Additionally, when a Worker deployment fails with a startup time error Wrangler will automatically generate a CPU profile for easy investigation.

Advanced usage:

- `--args`: to customise the way `wrangler check startup` builds your Worker for analysis, provide the exact arguments you use when deploying your Worker with `wrangler deploy`. For instance, if you deploy your Worker with `wrangler deploy --no-bundle`, you should use `wrangler check startup --args="--no-bundle"` to profile the startup phase.
- `--worker-bundle`: if you don't use Wrangler to deploy your Worker, you can use this argument to provide a Worker bundle to analyse. This should be a file path to a serialised multipart upload, with the exact same format as the API expects: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/
