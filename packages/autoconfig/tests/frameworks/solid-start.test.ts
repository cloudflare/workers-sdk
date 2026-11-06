import { readFileSync } from "node:fs";
import { NpmPackageManager } from "@cloudflare/workers-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { dedent } from "ts-dedent";
import { describe, it, vi } from "vitest";
import { SolidStart } from "../../src/frameworks/solid-start";
import { createMockContext } from "../helpers/mock-context";
import type { AutoConfigContext } from "../../src/context";

vi.mock("../../src/frameworks/utils/vite-plugin", () => ({
	installCloudflareVitePlugin: vi.fn(),
}));

/**
 * Configures the project in the current directory for cf.
 *
 * @param context The autoconfig context
 * @returns The configuration results
 */
function configureForCf(context: AutoConfigContext) {
	return new SolidStart({ id: "solid-start", name: "Solid Start" }).configure({
		target: "cf",
		projectPath: process.cwd(),
		outputDir: "dist",
		workerName: "my-solid-start-app",
		dryRun: false,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
		context,
	});
}

describe("SolidStart", () => {
	runInTempDir();

	it("replaces Nitro with the Cloudflare Vite plugin when configuring for cf", async ({
		expect,
	}) => {
		// The vite.config.ts of the SolidStart 2 basic template
		await seed({
			"tsconfig.json": "{}",
			"vite.config.ts": dedent`
				import { defineConfig } from "vite";
				import { nitro } from "nitro/vite";

				import { solidStart } from "@solidjs/start/config";

				export default defineConfig({
				  plugins: [solidStart(),
				    nitro()
				  ]
				});
			`,
		});

		const result = await configureForCf(createMockContext());

		expect(result).toEqual({
			buildTool: "vite",
			workerConfig: { entrypoint: "./src/entry-server.tsx" },
		});
		expect(readFileSync("vite.config.ts", "utf8")).toMatchInlineSnapshot(`
			"import { defineConfig } from "vite";
			import { solidStart } from "@solidjs/start/config";

			import { cloudflare } from "@cloudflare/vite-plugin";

			export default defineConfig({
			  plugins: [solidStart(),
			    cloudflare({
			      viteEnvironment: {
			        name: "ssr"
			      }
			    })
			  ],

			  environments: {
			    ssr: {
			      // Load SolidStart once in dev, so server functions work with the Cloudflare Vite plugin
			      optimizeDeps: {
			        exclude: ["@solidjs/start"]
			      }
			    }
			  }
			});"
		`);
	});

	it("asks for the exclude by hand when the Vite config already has environments", async ({
		expect,
	}) => {
		await seed({
			"src/entry-server.jsx": "export default {};",
			"vite.config.js": dedent`
				import { defineConfig } from "vite";
				import { nitro } from "nitro/vite";
				import { solidStart } from "@solidjs/start/config";

				export default defineConfig({
				  plugins: [solidStart(), nitro()],
				  environments: { ssr: { optimizeDeps: { exclude: ["foo"] } } },
				});
			`,
		});
		const context = createMockContext();

		const result = await configureForCf(context);

		expect(result.workerConfig).toEqual({
			entrypoint: "./src/entry-server.jsx",
		});
		expect(context.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('exclude: ["@solidjs/start"]')
		);
		const viteConfig = readFileSync("vite.config.js", "utf8");
		expect(viteConfig.match(/environments/g)).toHaveLength(1);
		expect(viteConfig).toContain('exclude: ["foo"]');
	});
});
