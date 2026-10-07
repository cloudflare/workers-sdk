---
"wrangler": minor
---

Stop `wrangler deploy`, `wrangler versions upload` and `wrangler preview` when the project contains Cloudflare Build Output

A project built for the Cloudflare CLI (`cf`) contains a `.cloudflare/output` directory. Deploying it with Wrangler reads a different configuration, so it could target the wrong Worker or fail without explaining why. These commands now stop before doing any work and point to `cf deploy`.

This is a change to the experimental Build Output Specification (currently `v0`), which Wrangler emits under `wrangler build --experimental-new-config --experimental-cf-build-output`. It is a minor rather than a patch because stable commands gain a new failure mode: a project that previously deployed through Wrangler now stops.

Detection inspects the project the command selected, derived from the resolved user configuration, so `--config` pointing outside the working directory is followed correctly and unrelated Build Output beside a project cannot block it. It requires the Specification's versioned root config rather than a directory name, so it cannot be tripped by the `.cloudflare/types` directory Wrangler generates itself. `--dry-run` is exempt on `deploy` and `versions upload`, because it uploads nothing.
