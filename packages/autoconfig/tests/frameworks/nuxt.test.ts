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

		const result = await new Nuxt({ id: "nuxt", name: "Nuxt" }).configure({
			target: "cf",
			projectPath: process.cwd(),
			outputDir: "dist",
			workerName: "my-nuxt-app",
			dryRun: false,
			packageManager: NpmPackageManager,
			isWorkspaceRoot: false,
			context: createMockContext(),
		});

		expect(result).toEqual({
			buildTool: "vite",
			workerConfig: { entrypoint: "#server-entry" },
		});
		expect(installCloudflareVitePlugin).toHaveBeenCalledWith(
			expect.objectContaining({ version: "^2.0.0-beta.v.0" })
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
});
