import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { onTestFinished, test, vi } from "vitest";

const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"optimize-deps-excluded-require"
);

// Reference: https://github.com/cloudflare/workers-sdk/issues/16769
test("a prebundled CJS dependency can `require()` a dependency excluded from `optimizeDeps`", async ({
	expect,
}) => {
	fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
	);
	onTestFinished(() => removeDirSync(root));

	// A CommonJS package that `require()`s an ESM package, as a prebundled
	// dependency may do for a package a user excludes from `optimizeDeps`.
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({ name: "fixture", private: true, type: "module" })
	);
	fs.mkdirSync(path.join(root, "node_modules", "cjs-consumer"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(root, "node_modules", "cjs-consumer", "package.json"),
		JSON.stringify({
			name: "cjs-consumer",
			version: "1.0.0",
			main: "index.cjs",
		})
	);
	fs.writeFileSync(
		path.join(root, "node_modules", "cjs-consumer", "index.cjs"),
		"module.exports = require('esm-peer').value;"
	);
	fs.mkdirSync(path.join(root, "node_modules", "esm-peer"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(root, "node_modules", "esm-peer", "package.json"),
		JSON.stringify({
			name: "esm-peer",
			version: "1.0.0",
			type: "module",
			main: "index.js",
		})
	);
	fs.writeFileSync(
		path.join(root, "node_modules", "esm-peer", "index.js"),
		"export const value = 'SSR OK';"
	);
	fs.writeFileSync(
		path.join(root, "index.ts"),
		`import value from "cjs-consumer";

export default {
	fetch() {
		return new Response(value);
	},
};
`
	);

	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [
			cloudflare({
				config: (loadedConfig) => ({
					...loadedConfig,
					worker: {
						...loadedConfig.worker,
						name: "optimize-deps-excluded-require",
						entrypoint: "./index.ts",
						compatibilityDate: "2024-12-30",
					},
				}),
				inspectorPort: false,
				persistState: false,
				types: { generate: false },
			}),
		],
		environments: {
			ssr: {
				optimizeDeps: {
					include: ["cjs-consumer"],
					exclude: ["esm-peer"],
				},
			},
		},
	});
	onTestFinished(() => server.close());
	await server.listen(0);
	const url = server.resolvedUrls?.local[0];
	assert(url, "Expected the server URL to be defined");

	await vi.waitFor(
		async () => {
			const response = await fetch(url);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("SSR OK");
		},
		{ timeout: 10_000 }
	);
});
