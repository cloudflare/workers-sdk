import assert from "assert";
import path from "path";
import * as esbuild from "esbuild";
import { dedent } from "ts-dedent";
import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";

const TEMPLATES_DIR = path.join(__dirname, "templates");

const OUTDIR = path.resolve(__dirname, "./.tmp/vitest-workers");
function embedWorkersPlugin() {
	return {
		name: "embed-workers",

		async resolveId(id) {
			if (id.startsWith("worker:")) {
				const name = id.substring("worker:".length);

				return `\0worker:${path.join(TEMPLATES_DIR, name)}.ts`;
			}
		},
		async load(id) {
			if (!id.startsWith(`\0worker:`)) {
				return null;
			}
			id = id.substring(`\0worker:`.length);
			const result = await esbuild.build({
				platform: "node", // Marks `node:*` imports as external
				format: "esm",
				target: "esnext",
				bundle: true,
				sourcemap: true,
				sourcesContent: false,
				metafile: true,
				entryPoints: [id],
				outdir: OUTDIR,
				external: ["cloudflare:email", "cloudflare:workers"],
			});
			const watchFiles = Object.keys(result?.metafile?.inputs ?? {});
			const scriptPath = Object.keys(result?.metafile?.outputs ?? {}).find(
				(filepath) => filepath.endsWith(".js")
			);
			assert(scriptPath);
			const absoluteScriptPath = JSON.stringify(
				path.resolve(__dirname, scriptPath)
			);

			for (const file of watchFiles) {
				this.addWatchFile(file);
			}

			return dedent/*javascript*/ `
				export default ${absoluteScriptPath};
			`;
		},
	} satisfies PluginOption;
}

export default defineConfig({
	plugins: [embedWorkersPlugin()],
	test: {
		testTimeout: 15_000,
		pool: "forks",
		retry: 0,
		include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		outputFile: process.env.TEST_REPORT_PATH ?? ".e2e-test-report/index.html",
		setupFiles: path.resolve(__dirname, "src/__tests__/vitest.setup.ts"),
		globalSetup: path.resolve(__dirname, "src/__tests__/vitest.global.ts"),
		reporters: ["default", "html"],
		globals: true,
		snapshotFormat: {
			escapeString: true,
			printBasicPrototype: true,
		},
		unstubEnvs: true,
	},
});
