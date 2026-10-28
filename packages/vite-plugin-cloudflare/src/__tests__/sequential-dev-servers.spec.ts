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

	// Separate roots keep each server's configuration and module graph independent.
	function createWorker(options: {
		config: Record<string, unknown>;
		entry: string[];
	}) {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		roots.push(root);
		fs.mkdirSync(path.join(root, "src"));
		fs.writeFileSync(
			path.join(root, "wrangler.json"),
			JSON.stringify({
				name: "worker",
				main: "./src/index.ts",
				compatibility_date: "2024-12-30",
				...options.config,
			})
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
			config: {},
			entry: [
				"export default { fetch: () => new Response('ok') };",
				"export function helper() { return 1; }",
			],
		});
		expect(await fetchFromNewServer(firstRoot)).toBe("ok");

		const secondRoot = createWorker({
			config: {
				durable_objects: {
					bindings: [{ name: "COUNTER", class_name: "Counter" }],
				},
				migrations: [{ tag: "v1", new_sqlite_classes: ["Counter"] }],
			},
			entry: [
				"import { DurableObject } from 'cloudflare:workers';",
				"export class Counter extends DurableObject {}",
				"export default { fetch: (_request, env) => new Response(env.COUNTER ? 'ok' : 'no binding') };",
			],
		});
		expect(await fetchFromNewServer(secondRoot)).toBe("ok");
	});
});
