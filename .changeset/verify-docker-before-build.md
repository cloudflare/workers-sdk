---
"wrangler": patch
---

Verify Docker is installed and running before `wrangler containers build`

Previously, running `wrangler containers build` without Docker installed or with the Docker daemon stopped would fail with an unhelpful spawn error. Now the command checks that Docker is reachable upfront and shows a clear, actionable error message with installation and troubleshooting steps.
