import { lookup } from "node:dns/promises";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchText } from "./helpers/fetch-text";
import { seed as baseSeed, makeRoot } from "./helpers/setup";
import { WranglerLongLivedCommand } from "./helpers/wrangler";

// Check if *.localhost subdomains resolve on this system.
// Some environments (Windows, older macOS, Alpine) don't support this.
let localhostSubdomainsSupported = true;
try {
	const result = await lookup("test.domain.localhost");
	localhostSubdomainsSupported =
		result.address === "127.0.0.1" || result.address === "::1";
} catch {
	localhostSubdomainsSupported = false;
}

// Worker A source: Greet + Farewell entrypoints + default
const workerASrc = dedent/* javascript */ `
	import { WorkerEntrypoint } from "cloudflare:workers";

	export class Greet extends WorkerEntrypoint {
		async fetch() {
			return new Response("Hello from worker-a");
		}
	}

	export class Farewell extends WorkerEntrypoint {
		async fetch() {
			return new Response("Goodbye from worker-a");
		}
	}

	export default {
		fetch() {
			return new Response("worker-a default");
		},
	};
`;

// Worker B source: Echo entrypoint + default
const workerBSrc = dedent/* javascript */ `
	import { WorkerEntrypoint } from "cloudflare:workers";

	export class Echo extends WorkerEntrypoint {
		async fetch(request) {
			return new Response("echo:" + new URL(request.url).pathname);
		}
	}

	export default {
		fetch() {
			return new Response("worker-b default");
		},
	};
`;

describe.skipIf(!localhostSubdomainsSupported)(
	"localhost entrypoint routing",
	() => {
		let urls: Record<string, string>;
		let wrangler: WranglerLongLivedCommand;

		beforeAll(async () => {
			const a = makeRoot();
			await baseSeed(a, {
				"wrangler.toml": dedent`
					name = "worker-a"
					main = "src/index.ts"
					compatibility_date = "2025-01-01"

					[dev]
					expose_entrypoints = true
				`,
				"src/index.ts": workerASrc,
				"package.json": dedent`
					{
						"name": "worker-a",
						"version": "0.0.0",
						"private": true
					}
				`,
			});

			const b = makeRoot();
			await baseSeed(b, {
				"wrangler.toml": dedent`
					name = "worker-b"
					main = "src/index.ts"
					compatibility_date = "2025-01-01"

					[dev]
					expose_entrypoints = true
				`,
				"src/index.ts": workerBSrc,
				"package.json": dedent`
					{
						"name": "worker-b",
						"version": "0.0.0",
						"private": true
					}
				`,
			});

			wrangler = new WranglerLongLivedCommand(
				`wrangler dev -c wrangler.toml -c ${b}/wrangler.toml`,
				{ cwd: a }
			);
			const { url } = await wrangler.waitForReady();
			const { port } = new URL(url);
			urls = {
				default: url,
				"greet.worker-a": `http://greet.worker-a.localhost:${port}`,
				"farewell.worker-a": `http://farewell.worker-a.localhost:${port}`,
				"echo.worker-b": `http://echo.worker-b.localhost:${port}`,
				"worker-a": `http://worker-a.localhost:${port}`,
				"worker-b": `http://worker-b.localhost:${port}`,
				greet: `http://greet.localhost:${port}`,
				"greet.unknown": `http://greet.unknown.localhost:${port}`,
				"nonexistent.worker-a": `http://nonexistent.worker-a.localhost:${port}`,
			};
		});

		afterAll(async () => {
			await wrangler?.stop();
		});

		it("routes to worker-a entrypoint via {entrypoint}.{worker}.localhost", async () => {
			await expect(fetchText(urls["greet.worker-a"])).resolves.toBe(
				"Hello from worker-a"
			);
		});

		it("routes to another entrypoint on the same worker", async () => {
			await expect(fetchText(urls["farewell.worker-a"])).resolves.toBe(
				"Goodbye from worker-a"
			);
		});

		it("routes to worker-b entrypoint", async () => {
			await expect(fetchText(urls["echo.worker-b"])).resolves.toBe("echo:/");
		});

		it("routes to worker-a default via {worker}.localhost", async () => {
			await expect(fetchText(urls["worker-a"])).resolves.toBe(
				"worker-a default"
			);
		});

		it("routes to worker-b default via {worker}.localhost", async () => {
			await expect(fetchText(urls["worker-b"])).resolves.toBe(
				"worker-b default"
			);
		});

		it("falls through to primary worker default on plain localhost", async () => {
			await expect(fetchText(urls.default)).resolves.toBe("worker-a default");
		});

		it("returns 404 for unknown worker via single-level subdomain", async () => {
			const res = await fetch(urls.greet);
			expect(res.status).toBe(404);
		});

		it("returns 404 for an unknown worker name", async () => {
			const res = await fetch(urls["greet.unknown"]);
			expect(res.status).toBe(404);
		});

		it("returns 404 for an unknown entrypoint on a known worker", async () => {
			const res = await fetch(urls["nonexistent.worker-a"]);
			expect(res.status).toBe(404);
		});
	}
);
