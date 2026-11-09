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
- **D1 migrations:** `getWorker().applyD1Migrations(binding, { dir })` applies the `.sql` files in `dir`, which defaults to `./migrations` in the build's project folder.

Not supported yet: Containers.

This is not yet stable enough for external use — APIs may change without notice.
