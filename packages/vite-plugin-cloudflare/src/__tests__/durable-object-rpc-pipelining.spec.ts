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
	"durable-object-rpc-pipelining"
);

/**
 * A Durable Object that exposes a plain object through a getter, so RPC calls
 * can be pipelined through the stub more than one property deep
 * (`stub.api.greet()`, `stub.api.nested.deep()`).
 */
const DO_WORKER_ENTRY = [
	"import { DurableObject } from 'cloudflare:workers';",
	"export class Store extends DurableObject {",
	"  #api = {",
	"    greet: (name) => `hello ${name}`,",
	"    nested: { deep: () => 'deep' },",
	"  };",
	"  get api() { return this.#api; }",
	"  greetDirect(name) { return `hello ${name}`; }",
	"}",
	"export default {",
	"  async fetch(request, env) {",
	"    const url = new URL(request.url);",
	"    const stub = env.STORE.getByName('test');",
	"    try {",
	"      if (url.pathname === '/direct') return new Response(await stub.greetDirect('world'));",
	"      if (url.pathname === '/chain') return new Response(await stub.api.greet('world'));",
	"      if (url.pathname === '/deep') return new Response(await stub.api.nested.deep());",
	"      return new Response('try /direct, /chain, /deep');",
	"    } catch (error) {",
	"      return new Response(`${error.name}: ${error.message}`, { status: 500 });",
	"    }",
	"  },",
	"} satisfies ExportedHandler<{ STORE: DurableObjectNamespace<Store> }>;",
].join("\n");

describe("Durable Object RPC pipelining in the dev server", () => {
	const roots: string[] = [];
	let server: ViteDevServer | undefined;

	afterEach(async () => {
		await server?.close();
		server = undefined;
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	async function startDevServer(): Promise<string> {
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
				"      Store: { type: 'durable-object', storage: 'sqlite' },",
				"    },",
				"    env: {",
				"      STORE: bindings.durableObject({ worker: 'worker', exportName: 'Store' }),",
				"    },",
				"  },",
				"});",
			].join("\n")
		);
		fs.writeFileSync(path.join(root, "src", "index.ts"), DO_WORKER_ENTRY);

		server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		await server.listen(0);
		const url = server.resolvedUrls?.local[0];
		assert(url, "Expected the server URL to be defined");

		return url;
	}

	// https://github.com/cloudflare/workers-sdk/issues/16212
	test("pipelined RPC through a Durable Object stub works more than one property deep", async ({
		expect,
	}) => {
		const url = await startDevServer();

		const direct = await fetch(new URL("/direct", url));
		expect(direct.status).toBe(200);
		expect(await direct.text()).toBe("hello world");

		const chain = await fetch(new URL("/chain", url));
		expect(chain.status).toBe(200);
		expect(await chain.text()).toBe("hello world");

		const deep = await fetch(new URL("/deep", url));
		expect(deep.status).toBe(200);
		expect(await deep.text()).toBe("deep");
	});
});
