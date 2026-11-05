---
"@cloudflare/config": minor
"@cloudflare/codemods": minor
---

Add `triggers.event(...)` for Cloudflare event triggers such as Artifacts pushes

`cloudflare.config.ts` can now start a Worker's Workflows when Artifacts events occur, so Workers that run CI on push can be deployed without keeping a Wrangler config for this one feature:

```ts
triggers.event({
	event: "cf.artifacts.repo.pushed",
	filter: { namespace: "ci", repoName: "my-repo" },
	targets: [{ type: "workflow", workflowName: "ci-workflow" }],
});
```

Event triggers convert to Wrangler's `triggers.events`, and the Wrangler-to-`cloudflare.config.ts` codemod now migrates them instead of reporting a follow-up. `@cloudflare/config` is experimental, so this is a minor release.
