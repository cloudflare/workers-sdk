# `@cloudflare/test-harness`

Runs a project's Build Output in tests, with the API of Wrangler's `createTestHarness`.

```ts
import { createTestHarness } from "@cloudflare/test-harness";

const harness = createTestHarness({
	workers: [
		// The project directory containing the build's `.cloudflare/output`
		{ buildOutput: "./", secrets: { API_TOKEN: "test" } },
	],
});

await harness.listen();
const response = await harness.fetch("/");

await harness.close();
```

Test your production build: the harness runs the Build Output as it is, and never builds. Use `vars`, `secrets` and `bindingOverrides` for test values.

- **Several Workers:** add one entry per Worker. The first is the primary Worker. Builds may come from different tools. Use `name` to pick a build's non-default Worker by its name.
- **Secrets** are read from `.dev.vars` or `.env` files in the build's project folder, for the mode the build ran in, as in `vite preview`. `secrets` overrides them.
- **Remote bindings** connect to the real resources on your account.
- **D1 migrations:** `getWorker().applyD1Migrations(binding, { dir, pattern, table })` takes the options of `cf d1 migrations apply`. `dir` defaults to `./migrations` in the build's project folder.
- **Test-only Workers**, such as mocks for `bindingOverrides`, can be inline: `{ config }` takes config in the shape of a Build Output `worker.config.json`, whose `manifest` includes each module's code.
- **Types:** `server.getWorker<typeof import("./cloudflare.config")>()` infers a Worker's `Env` and module from its config.

See [`fixtures/test-harness-example`](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/test-harness-example) for a complete example with Vitest and Playwright.

Not supported yet: Containers.

This is not yet stable enough for external use — APIs may change without notice.
