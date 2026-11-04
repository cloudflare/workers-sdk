import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import * as details from "../../../src/details";
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
		// A Worker explicitly configured with a `cloudflare.config.ts` and a Vite
		// config, inside a workspace whose lock file (`bun.lock`) sits at the
		// workspace root, so no lock file is present in the project directory.
		await seed({
			"package.json": JSON.stringify({
				name: "example-worker",
				private: true,
				type: "module",
				devDependencies: {
					"@cloudflare/vite-plugin": "2.0.0-beta.v.5",
					cf: "1.0.0-beta.26",
					vite: "8.3.5",
				},
			}),
			"cloudflare.config.ts": `import { defineConfig } from "cf/config";
export default defineConfig({
	worker: {
		name: "example-worker",
		compatibilityDate: "2025-07-01",
		entrypoint: "src/index.ts",
	},
});`,
			"vite.config.ts": `import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [cloudflare()] });`,
			"src/index.ts": `export default { fetch: () => new Response("ok") };`,
		});

		const projectDetails = await details.getDetailsForAutoConfig({ context });

		expect(projectDetails.configured).toBe(true);
		expect(std.warn).not.toContain(noLockFileWarning);
	});
});
