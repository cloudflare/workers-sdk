import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

// workerd forbids async I/O (timers, `fetch()`, random values, ...) while a
// Worker's modules are evaluated, as `vite preview`, `wrangler dev` and
// production all do. `vite dev` should report the same error rather than
// letting the Worker run.
// Reference: https://github.com/cloudflare/workers-sdk/issues/9489
describe("async I/O in the global scope during `vite dev`", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	function createWorker(files: Record<string, string>) {
		fs.mkdirSync(fixturesPath, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(fixturesPath, "global-scope-io-"))
		);
		roots.push(root);
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'global-scope-io',",
				"    entrypoint: './index.ts',",
				"    compatibilityDate: '2024-12-30',",
				"  },",
				"});",
			].join("\n")
		);
		for (const [name, contents] of Object.entries(files)) {
			fs.writeFileSync(path.join(root, name), contents);
		}

		return root;
	}

	/**
	 * Starts a dev server and fetches `/`. Rejects with the error if either the
	 * server fails to start or the Worker fails the request.
	 */
	async function fetchFromDevServer(root: string): Promise<string> {
		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		try {
			await server.listen(0);
			const url = server.resolvedUrls?.local[0];
			assert(url, "Expected the server URL to be defined");

			const response = await fetch(url);
			const body = await response.text();

			if (!response.ok) {
				throw new Error(body);
			}

			return body;
		} finally {
			await server.close();
		}
	}

	test("a timer set in the entry module's global scope throws", async ({
		expect,
	}) => {
		const root = createWorker({
			"index.ts": [
				"setTimeout(() => {",
				"  console.log('timer fired');",
				"}, 1000);",
				"",
				"export default {",
				"  async fetch(request, env, ctx) {",
				"    return new Response('Hello World');",
				"  },",
				"};",
			].join("\n"),
		});

		await expect(fetchFromDevServer(root)).rejects.toThrow(
			"Disallowed operation called within global scope"
		);
	});

	test("a timer set in the global scope of a dynamically imported module throws", async ({
		expect,
	}) => {
		const root = createWorker({
			"index.ts": [
				"export default {",
				"  async fetch() {",
				"    const { value } = await import('./lazy');",
				"    return new Response(value);",
				"  },",
				"};",
			].join("\n"),
			"lazy.ts": [
				"setInterval(() => {}, 60_000);",
				"export const value = 'lazy module loaded';",
			].join("\n"),
		});

		await expect(fetchFromDevServer(root)).rejects.toThrow(
			"Disallowed operation called within global scope"
		);
	});
});
