---
"@cloudflare/vitest-pool-workers": minor
---

Support `wrangler.toml` configuration and TypeScript entrypoints for auxiliary Workers

Auxiliary workers can now load their configuration from a Wrangler configuration
file (`wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`) instead of requiring
manual Miniflare `WorkerOptions`. TypeScript entrypoints are automatically built
using `wrangler build`, removing the need for a manual `globalSetup` script.

Before:

```ts
// global-setup.ts
import childProcess from "node:child_process";
export default function () {
	childProcess.execSync("wrangler build", { cwd: __dirname });
}

// vitest.config.ts
workers: [
	{
		name: "my-worker",
		modules: true,
		scriptPath: "./dist/index.js",
		compatibilityDate: "2024-01-01",
		compatibilityFlags: ["nodejs_compat"],
	},
];
```

After:

```ts
// vitest.config.ts — no globalSetup needed
workers: [
	{
		wrangler: { configPath: "./wrangler.json" },
	},
];
```
