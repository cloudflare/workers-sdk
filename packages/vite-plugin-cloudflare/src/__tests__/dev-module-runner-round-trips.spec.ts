import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer } from "vite";
import { afterEach, describe, test } from "vitest";
import type { ViteDevServer } from "vite";

const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"dev-module-runner-round-trips"
);

describe("dev-mode module runner round trips", () => {
	let server: ViteDevServer | undefined;
	const roots: string[] = [];

	afterEach(async () => {
		await server?.close();
		server = undefined;
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	function createWorkerFixture() {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		roots.push(root);
		fs.mkdirSync(path.join(root, "src"));

		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { bindings, defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'worker',",
				"    entrypoint: './src/index.ts',",
				"    compatibilityDate: '2024-12-30',",
				"    exports: {",
				"      Counter: { type: 'durable-object', storage: 'sqlite' },",
				"    },",
				"    env: {",
				"      COUNTER: bindings.durableObject({ worker: 'worker', exportName: 'Counter' }),",
				"    },",
				"  },",
				"});",
			].join("\n")
		);

		fs.writeFileSync(
			path.join(root, "src/index.ts"),
			[
				"import { DurableObject } from 'cloudflare:workers';",
				"",
				"export class Counter extends DurableObject {",
				"	async getValue() {",
				"		return 42;",
				"	}",
				"}",
				"",
				"export default {",
				"	async fetch(_request, env) {",
				"		const id = env.COUNTER.idFromName('singleton');",
				"		const value = await env.COUNTER.get(id).getValue();",
				"		return new Response(String(value));",
				"	},",
				"};",
			].join("\n")
		);

		return root;
	}

	/**
	 * Counts every `fetchModule` round trip the module runner in workerd makes
	 * to the Vite dev server, by wrapping `fetchModule()` on every environment.
	 */
	function countFetchModuleCalls(viteDevServer: ViteDevServer) {
		let count = 0;

		for (const environment of Object.values(viteDevServer.environments)) {
			const originalFetchModule = environment.fetchModule.bind(environment);
			environment.fetchModule = async (id, importer, options) => {
				count++;
				return originalFetchModule(id, importer, options);
			};
		}

		return () => count;
	}

	// Reference: https://github.com/cloudflare/workers-sdk/issues/16533
	test("a warm Worker re-request makes no fetchModule round trips to the Vite dev server", async ({
		expect,
	}) => {
		const root = createWorkerFixture();

		server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});

		await server.listen(0);

		const url = server.resolvedUrls?.local[0];
		assert(url, "Expected the server URL to be defined");

		const getFetchModuleCount = countFetchModuleCalls(server);

		// Warm the module graph: the entry, the Durable Object class and all
		// their dependencies are fetched and evaluated.
		const firstResponse = await fetch(url);
		expect(await firstResponse.text()).toBe("42");

		// Re-request without editing any file. Everything is already evaluated,
		// so the module runner should have nothing to fetch from the dev server.
		const countBefore = getFetchModuleCount();
		const secondResponse = await fetch(url);
		expect(await secondResponse.text()).toBe("42");
		expect(getFetchModuleCount()).toBe(countBefore);
	});
});
