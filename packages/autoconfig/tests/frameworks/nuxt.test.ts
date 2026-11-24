import { readFileSync } from "node:fs";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { dedent } from "ts-dedent";
import { describe, it, vi } from "vitest";
import { Nuxt } from "../../src/frameworks/nuxt";
import { installCloudflareVitePlugin } from "../../src/frameworks/utils/vite-plugin";
import { createMockContext } from "../helpers/mock-context";

vi.mock("../../src/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: vi.fn(),
}));

/**
 * Configures the project in the current directory for cf.
 *
 * @returns The configuration results
 */
function configureForCf() {
	return new Nuxt({ id: "nuxt", name: "Nuxt" }).configure({
		target: "cf",
		projectPath: process.cwd(),
		outputDir: "dist",
		workerName: "my-nuxt-app",
		dryRun: false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
		context: createMockContext(),
	});
}

describe("Nuxt", () => {
	runInTempDir();

	it("sets up the Vite server builder with the Cloudflare Vite plugin when configuring for cf", async ({
		expect,
	}) => {
		// The nuxt.config.ts and tsconfig.json of the Nuxt 4 minimal template
		await seed({
			"tsconfig.json": dedent`
				{
				  // https://nuxt.com/docs/guide/concepts/typescript
				  "files": [],
				  "references": [
				    {
				      "path": "./.nuxt/tsconfig.app.json"
				    },
				    {
				      "path": "./.nuxt/tsconfig.server.json"
				    },
				    {
				      "path": "./.nuxt/tsconfig.shared.json"
				    },
				    {
				      "path": "./.nuxt/tsconfig.node.json"
				    }
				  ]
				}
			`,
			"nuxt.config.ts": dedent`
				// https://nuxt.com/docs/api/configuration/nuxt-config
				export default defineNuxtConfig({
				  compatibilityDate: '2025-07-15',
				  devtools: { enabled: true }
				})
			`,
		});

		const result = await configureForCf();

		expect(result).toEqual({
			buildTool: "vite",
			workerConfig: { entrypoint: "#server-entry" },
		});
		expect(installCloudflareVitePlugin).toHaveBeenCalledWith(
			expect.objectContaining({ version: "^2.0.0-rc.0" })
		);
		expect(readFileSync("tsconfig.json", "utf8")).toMatchInlineSnapshot(`
			"{
			  // https://nuxt.com/docs/guide/concepts/typescript
			  "files": [],
			  "references": [
			    {
			      "path": "./.nuxt/tsconfig.app.json"
			    },
			    {
			      "path": "./.nuxt/tsconfig.shared.json"
			    },
			    {
			      "path": "./.nuxt/tsconfig.node.json"
			    }
			  ]
			}"
		`);
		expect(readFileSync("nuxt.config.ts", "utf8")).toMatchInlineSnapshot(`
			"import { cloudflare } from "@cloudflare/vite-plugin";
			// https://nuxt.com/docs/api/configuration/nuxt-config
			export default defineNuxtConfig({
			  compatibilityDate: '2025-07-15',
			  devtools: { enabled: true },

			  vite: {
			    plugins: [cloudflare()]
			  },

			  server: {
			    builder: "vite"
			  }
			})"
		`);
	});

	it("serves the app from static assets when nuxt.config.ts sets ssr: false", async ({
		expect,
	}) => {
		await seed({
			"nuxt.config.ts": dedent`
				export default defineNuxtConfig({
				  ssr: false,
				})
			`,
		});

		const result = await configureForCf();

		expect(result).toEqual({
			buildTool: "vite",
			workerConfig: {
				assets: { notFoundHandling: "single-page-application" },
			},
		});
	});

	it("edits a JavaScript Nuxt config when configuring for cf", async ({
		expect,
	}) => {
		await seed({
			"nuxt.config.mjs": dedent`
				export default defineNuxtConfig({
				  ssr: false,
				})
			`,
		});

		const result = await configureForCf();

		expect(result).toEqual({
			buildTool: "vite",
			workerConfig: {
				assets: { notFoundHandling: "single-page-application" },
			},
		});
		expect(readFileSync("nuxt.config.mjs", "utf8")).toMatchInlineSnapshot(`
			"import { cloudflare } from "@cloudflare/vite-plugin";
			export default defineNuxtConfig({
			  ssr: false,

			  vite: {
			    plugins: [cloudflare()]
			  },

			  server: {
			    builder: "vite"
			  }
			})"
		`);
	});

	it("explains how to set up a Nuxt config that isn't an object literal before installing anything", async ({
		expect,
	}) => {
		await seed({
			"nuxt.config.ts": dedent`
				import { sharedConfig } from "./shared-config";
				export default defineNuxtConfig(sharedConfig)
			`,
		});

		await expect(configureForCf()).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Autoconfig can't edit nuxt.config.ts, because it doesn't pass an object literal to \`defineNuxtConfig()\`. To set up Nuxt for cf by hand:
			- add \`cloudflare()\` from \`@cloudflare/vite-plugin\` to \`vite.plugins\`
			- set \`server.builder\` to \`"vite"\`
			- remove the \`./.nuxt/tsconfig.server.json\` reference from tsconfig.json
			- create a cloudflare.config.ts whose Worker sets \`name\`, \`compatibilityDate\` and \`entrypoint: "#server-entry"\`, or \`assets.notFoundHandling: "single-page-application"\` instead of \`entrypoint\` if the app sets \`ssr: false\`]
		`
		);
		expect(installCloudflareVitePlugin).not.toHaveBeenCalled();
	});

	it("doesn't add the Cloudflare Vite plugin twice", async ({ expect }) => {
		await seed({
			"nuxt.config.ts": dedent`
				import { cloudflare } from "@cloudflare/vite-plugin";
				export default defineNuxtConfig({
				  vite: { plugins: [cloudflare()] },
				})
			`,
		});

		await configureForCf();

		expect(readFileSync("nuxt.config.ts", "utf8")).toMatchInlineSnapshot(`
			"import { cloudflare } from "@cloudflare/vite-plugin";
			export default defineNuxtConfig({
			  vite: { plugins: [cloudflare()] },

			  server: {
			    builder: "vite"
			  }
			})"
		`);
	});

	it("stops before installing anything when the project has server routes, middleware or plugins", async ({
		expect,
	}) => {
		await seed({
			"nuxt.config.ts": dedent`
				export default defineNuxtConfig({})
			`,
			"server/api/hello.ts": "export default defineEventHandler(() => 'hello')",
			"server/middleware/auth.ts":
				"export default defineEventHandler(() => {})",
			"server/plugins/auth.ts": "export default defineNitroPlugin(() => {})",
		});

		await expect(configureForCf()).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: This project has \`server/api\`, \`server/middleware\`, and \`server/plugins\`, but Nuxt's Vite server builder, which cf uses, doesn't support \`server/\` routes, middleware or plugins. Keep using Wrangler for this project until it does.]`
		);
		expect(installCloudflareVitePlugin).not.toHaveBeenCalled();
	});
});
