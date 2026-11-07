import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";

const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"optimize-deps-excluded-require"
);

/**
 * Builds a fixture where a CommonJS dependency prebundled by the Worker
 * environment's dependency optimizer `require()`s another package that the
 * user excluded from optimization with `optimizeDeps.exclude`:
 *
 *   node_modules/cjs-consumer/index.cjs:
 *     module.exports = require("esm-peer").value
 *   node_modules/esm-peer/index.js (an ES module):
 *     export const value = "SSR OK"
 *   src/index.ts:
 *     import value from "cjs-consumer";
 *     export default { fetch: () => new Response(value) };
 */
function createFixture(): string {
	fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
	const root = fs.realpathSync(fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-")));

	fs.writeFileSync(
		path.join(root, "cloudflare.config.ts"),
		[
			"import { defineConfig } from '@cloudflare/config';",
			"export default defineConfig({",
			"  worker: {",
			"    name: 'worker',",
			"    entrypoint: './src/index.ts',",
			"    compatibilityDate: '2024-12-30',",
			"  },",
			"});",
		].join("\n")
	);

	fs.mkdirSync(path.join(root, "src"));
	fs.writeFileSync(
		path.join(root, "src/index.ts"),
		[
			"import value from 'cjs-consumer';",
			"export default {",
			"  fetch: () => new Response(value),",
			"};",
		].join("\n")
	);

	fs.mkdirSync(path.join(root, "node_modules/cjs-consumer"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(root, "node_modules/cjs-consumer/package.json"),
		JSON.stringify({
			name: "cjs-consumer",
			version: "1.0.0",
			main: "index.cjs",
		})
	);
	fs.writeFileSync(
		path.join(root, "node_modules/cjs-consumer/index.cjs"),
		'module.exports = require("esm-peer").value;\n'
	);

	fs.mkdirSync(path.join(root, "node_modules/esm-peer"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(root, "node_modules/esm-peer/package.json"),
		JSON.stringify({
			name: "esm-peer",
			version: "1.0.0",
			type: "module",
			main: "index.js",
		})
	);
	fs.writeFileSync(
		path.join(root, "node_modules/esm-peer/index.js"),
		'export const value = "SSR OK";\n'
	);

	return root;
}

describe("dependency optimizer and excluded packages", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	// Reference: https://github.com/cloudflare/workers-sdk/issues/16769
	test("a prebundled CommonJS dependency can `require()` an excluded package", async ({
		expect,
	}) => {
		const root = createFixture();
		roots.push(root);

		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
			environments: {
				ssr: {
					optimizeDeps: {
						include: ["cjs-consumer"],
						exclude: ["esm-peer"],
					},
				},
			},
		});

		try {
			await server.listen(0);
			const url = server.resolvedUrls?.local[0];
			assert(url, "Expected the server URL to be defined");

			const response = await fetch(url);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("SSR OK");
		} finally {
			await server.close();
		}
	});
});
