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
	"sequential-dev-servers"
);

describe("sequential dev servers", () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	// Each server gets its own root, otherwise under Vitest the second server loads the first server's cached `cloudflare.config.ts`.
	function createWorker(options: { config: string[]; entry: string[] }) {
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
				...options.config,
				"  },",
				"});",
			].join("\n")
		);
		fs.writeFileSync(path.join(root, "src/index.ts"), options.entry.join("\n"));

		return root;
	}

	async function fetchFromNewServer(root: string): Promise<string> {
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

			return await (await fetch(url)).text();
		} finally {
			await server.close();
		}
	}

	// Reference: https://github.com/cloudflare/workers-sdk/issues/16324
	test("a server created after another one has closed uses its own Worker exports", async ({
		expect,
	}) => {
		const firstRoot = createWorker({
			config: [],
			entry: [
				"export default { fetch: () => new Response('ok') };",
				"export function helper() { return 1; }",
			],
		});
		expect(await fetchFromNewServer(firstRoot)).toBe("ok");

		const secondRoot = createWorker({
			config: [
				"    exports: { Counter: { type: 'durable-object', storage: 'sqlite' } },",
				"    env: { COUNTER: bindings.durableObject({ worker: 'worker', exportName: 'Counter' }) },",
			],
			entry: [
				"import { DurableObject } from 'cloudflare:workers';",
				"export class Counter extends DurableObject {}",
				"export default { fetch: (_request, env) => new Response(env.COUNTER ? 'ok' : 'no binding') };",
			],
		});
		expect(await fetchFromNewServer(secondRoot)).toBe("ok");
	});
});
