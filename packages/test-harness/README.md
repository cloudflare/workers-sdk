# `@cloudflare/test-harness`

Runs a project's Build Output in tests, with the API of Wrangler's `createTestHarness`.

```ts
import { createTestHarness } from "@cloudflare/test-harness";
import { bindings } from "cf/config";

const harness = createTestHarness({
	workers: [
		// The project directory containing the build's `.cloudflare/output`
		{ buildOutput: "./", env: { API_TOKEN: bindings.text("test") } },
	],
});

await harness.listen();
const response = await harness.fetch("/");

await harness.close();
```

Test your production build: the harness runs the Build Output as it is, and never builds. Use `env` for test values: it replaces the Worker's bindings of the same name, written as in `cloudflare.config.ts`, and `false` removes one.

- **Several Workers:** add one entry per Worker. The first is the primary Worker. Builds may come from different tools. Use `name` to pick a build's non-default Worker by its name.
- **Secrets** are read from `.dev.vars` or `.env` files in the build's project folder, for the mode the build ran in, as in `vite preview`. A binding in `env` overrides them.
- **Remote bindings** connect to the real resources on your account.
- **D1 migrations:** `getWorker().applyD1Migrations(binding, { dir, pattern, table })` takes the options of `cf d1 migrations apply`. `dir` defaults to `./migrations` in the build's project folder.
- **Test-only Workers**, such as a mock that `env` binds with `bindings.worker()`, can be inline: `{ config }` takes config in the shape of a Build Output `worker.config.json`, whose `manifest` includes each module's code.
- **Types:** `server.getWorker<typeof import("./cloudflare.config")>()` infers a Worker's `Env` and module from its config.
- **Containers** run from the images in the Build Output, as in `vite preview`. Docker must be running.

See [`fixtures/test-harness-example`](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/test-harness-example) for a complete example with Vitest and Playwright.

This is not yet stable enough for external use — APIs may change without notice.
