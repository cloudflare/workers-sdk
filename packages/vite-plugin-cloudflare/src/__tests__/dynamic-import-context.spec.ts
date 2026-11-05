import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, test } from "vitest";

const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"dynamic-import-context"
);

/**
 * A Worker that caches a dynamic `import()` at module scope, the common
 * lazy-init pattern (e.g. TanStack Start's `entriesPromise` in
 * `createStartHandler`). The `/kick` route starts the import and responds
 * before it settles; `/` awaits the same cached promise.
 */
const WORKER_ENTRY = `
let entries;
const getEntries = () => (entries ??= import("./gen"));

export default {
	async fetch(request, _env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === "/kick") {
			void getEntries();
			return new Response("kicked\\n");
		}
		if (pathname === "/kick-waituntil") {
			ctx.waitUntil(getEntries());
			return new Response("kicked\\n");
		}
		const { total } = await getEntries();
		return new Response(\`total=\${total}\\n\`);
	},
};
`;

describe("dynamic imports and request contexts in vite dev", () => {
	const roots: string[] = [];
	const servers: ViteDevServer[] = [];

	afterEach(() => {
		for (const server of servers.splice(0)) {
			server
				.close()
				.catch((error) => console.error("Failed to close server", error));
		}
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	// Each server gets its own root, otherwise under Vitest a second server
	// loads the first server's cached `cloudflare.config.ts`.
	async function startServer(entry: string = WORKER_ENTRY): Promise<string> {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		roots.push(root);
		fs.mkdirSync(path.join(root, "src", "gen"), { recursive: true });
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'worker',",
				"    entrypoint: './src/index.ts',",
				"    compatibilityDate: '2025-09-02',",
				"  },",
				"});",
			].join("\n")
		);
		fs.writeFileSync(path.join(root, "src", "index.ts"), entry);
		fs.writeFileSync(
			path.join(root, "src", "gen", "index.ts"),
			"export const total = 1;\n"
		);

		const server = await createServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({ inspectorPort: false, persistState: false })],
		});
		servers.push(server);
		await server.listen(0);
		const url = server.resolvedUrls?.local[0];
		assert(url, "Expected the server URL to be defined");
		return url.replace(/\/$/, "");
	}

	// Reference: https://github.com/cloudflare/workers-sdk/issues/16214
	test("an import started by a request that already responded settles for later requests", async ({
		expect,
	}) => {
		const url = await startServer();

		const kick = await fetch(`${url}/kick`);
		expect(await kick.text()).toBe("kicked\n");

		const response = await fetch(`${url}/`, {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await response.text()).toBe("total=1\n");
	});

	// Control for the case above: keeping the import alive with `waitUntil`
	// lets later requests see it settle.
	test("an import kept alive by waitUntil settles for later requests", async ({
		expect,
	}) => {
		const url = await startServer();

		const kick = await fetch(`${url}/kick-waituntil`);
		expect(await kick.text()).toBe("kicked\n");

		const response = await fetch(`${url}/`, {
			signal: AbortSignal.timeout(10_000),
		});
		expect(await response.text()).toBe("total=1\n");
	});
});
