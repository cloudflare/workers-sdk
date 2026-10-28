import http from "node:http";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
	disposeWithRetry,
	singleModuleManifest,
	TestLog,
} from "../../test-shared";
import type { AddressInfo } from "node:net";

// Forwards `{ action, options }` to the binding, and reports a rejected call as
// a 599 so tests can tell it apart from a returned error response
const WORKER_SCRIPT = `
export default {
	async fetch(request, env) {
		const { args } = await request.json();
		try {
			return await env.BROWSER.quickAction(...args);
		} catch (e) {
			return Response.json({ name: e.name, message: e.message }, { status: 599 });
		}
	}
};
`;

const PAGE = `<!DOCTYPE html>
<html><head><title>Quick actions</title></head>
<body>
	<h1>Hello</h1>
	<p class="item" data-id="1">First</p>
	<p class="item">Second</p>
	<a href="/about">About</a>
	<a href="https://example.com/page">External</a>
	<a href="mailto:hi@example.com">Mail</a>
	<a href="#top">Top</a>
</body></html>`;

let mf: Miniflare;
let log: TestLog;
let origin: string;
let server: http.Server;

async function call(args: unknown[]) {
	const fetcher = await mf.getWorker("quick-actions");
	return fetcher.fetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ args }),
	});
}

function quickAction(action: string, options: unknown) {
	return call([action, options]);
}

describe(
	"browser quick actions",
	{ concurrent: false, timeout: 30_000 },
	() => {
		beforeAll(async () => {
			server = http.createServer((req, res) => {
				if (req.url === "/redirect") {
					res.writeHead(302, { location: "/" });
					res.end();
				} else if (req.url === "/") {
					res.writeHead(200, {
						"content-type": "text/html",
						"x-custom": "yes",
					});
					res.end(PAGE);
				} else {
					res.writeHead(404);
					res.end();
				}
			});
			await new Promise<void>((resolve) => server.listen(0, resolve));
			origin = `http://localhost:${(server.address() as AddressInfo).port}`;

			log = new TestLog();
			mf = new Miniflare({
				log,
				workers: [
					{
						config: {
							name: "quick-actions",
							compatibilityDate: "2026-03-24",
							manifest: singleModuleManifest(WORKER_SCRIPT),
							env: { BROWSER: { type: "browser" } },
						},
					},
				],
			});
		});

		afterAll(async () => {
			await disposeWithRetry(mf);
			await new Promise((resolve) => server.close(resolve));
		});

		test("unknown actions reject the call", async ({ expect }) => {
			const unknown = await quickAction("crawl", { url: origin });
			expect(unknown.status).toBe(599);
			expect(await unknown.json()).toEqual({
				name: "Error",
				message: "Invalid quick action: crawl",
			});
		});
	}
);
