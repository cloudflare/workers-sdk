---
"wrangler": patch
---

Avoid silently overwriting an existing Worker during non-interactive deploys that cannot prove they own the name

A non-interactive deploy (an agent, CI, or the agent-delegated `wrangler pages deploy`) has no way to prompt before overwriting a Worker, so it now stops if the target name is already taken and this run cannot show it owns that Worker. This applies when there is no Wrangler configuration file naming the Worker and either the name was generated automatically or the deploy is the Pages-to-Workers delegation (where the name carried across is a Pages project name, not proof of Worker ownership). The check reuses the service metadata the deploy already fetches, so it adds no extra API calls.

Deploys are unaffected when a configuration file names the Worker (so repeat deployments continue to update it), and interactive deploys keep their existing confirmation flow. To update an existing Worker in one of the guarded cases, add a Wrangler configuration file naming it, or deploy under a different name.
