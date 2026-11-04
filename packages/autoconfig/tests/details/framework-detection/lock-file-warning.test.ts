import { resolve } from "node:path";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { getDetailsForAutoConfig } from "../../../src/details";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";
const noLockFileWarning =
	"No lock file has been detected in the current working directory. This might indicate that the project is part of a workspace.";

describe("detectFramework() / lock file warning", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	it("warns when no lock file is detected", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
		});

		await detectFramework(process.cwd(), context);

		expect(std.warn).toContain(noLockFileWarning);
	});

	it("does not warn for static projects without a lock file", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
		});

		await detectFramework(process.cwd(), context);

		expect(std.warn).not.toContain(noLockFileWarning);
	});

	it("does not warn when a lock file exists", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		await detectFramework(process.cwd(), context);

		expect(std.warn).not.toContain(noLockFileWarning);
	});

	it("does not warn for an explicitly configured project inside a workspace", async ({
		expect,
	}) => {
		// Reproduces the layout from the report: a Bun workspace whose root
		// holds the lock file, and a member Worker that is explicitly
		// configured via `cloudflare.config.ts` and `vite.config.ts`.
		await seed({
			"package.json": JSON.stringify({
				name: "cf-bun-workspace-repro",
				private: true,
				workspaces: ["packages/*"],
			}),
			"bun.lock": "{}",
			"packages/worker/package.json": JSON.stringify({
				name: "example-worker",
				private: true,
				type: "module",
				devDependencies: {
					"@cloudflare/vite-plugin": "2.0.0-beta.v.5",
					vite: "8.3.5",
				},
			}),
			"packages/worker/cloudflare.config.ts": "export default {};",
			"packages/worker/vite.config.ts": "export default {};",
			"packages/worker/src/index.ts":
				"export default { fetch: () => new Response('ok') };",
		});

		const details = await getDetailsForAutoConfig({
			projectPath: resolve("packages/worker"),
			context,
		});

		// The project is explicitly configured, so the auto-configuration
		// limitation the warning describes does not apply to it.
		expect(details.configured).toBe(true);
		expect(std.warn).not.toContain(noLockFileWarning);
	});
});
