import path from "node:path";
import { dedent } from "ts-dedent";
import { defineConfig } from "vitest/config";
import { bundleWorker } from "../../tools/build/bundle-worker.mjs";
import { getVitestShard } from "../../tools/test/vitest-shard.cjs";
import type { PluginOption } from "vite";

const TEMPLATES_DIR = path.join(import.meta.dirname, "templates");

const OUTDIR = path.resolve(import.meta.dirname, "./.tmp/vitest-workers");
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
			const scriptPath = path.join(
				OUTDIR,
				path.relative(TEMPLATES_DIR, id).replace(/\.[cm]?[jt]s$/, ".js")
			);
			const { watchFiles } = await bundleWorker(
				{ input: id },
				{ file: scriptPath, sourcemap: true, sourcemapExcludeSources: true }
			);
			const absoluteScriptPath = JSON.stringify(scriptPath);

			for (const file of watchFiles) {
				this.addWatchFile(file);
			}

			return dedent /*javascript*/ `
				export default ${absoluteScriptPath};
			`;
		},
	} satisfies PluginOption;
}

export default defineConfig({
	plugins: [embedWorkersPlugin()],
	test: {
		testTimeout: 50_000,
		pool: "forks",
		shard: getVitestShard(),
		retry: 0,
		include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
		// eslint-disable-next-line turbo/no-undeclared-env-vars -- TEST_REPORT_PATH is optionally set by CI
		outputFile: process.env.TEST_REPORT_PATH ?? ".e2e-test-report/index.html",
		setupFiles: path.resolve(
			import.meta.dirname,
			"src/__tests__/vitest.setup.ts"
		),
		globalSetup: path.resolve(
			import.meta.dirname,
			"src/__tests__/vitest.global.ts"
		),
		reporters: ["default", "html"],
		globals: true,
		unstubEnvs: true,
	},
});
