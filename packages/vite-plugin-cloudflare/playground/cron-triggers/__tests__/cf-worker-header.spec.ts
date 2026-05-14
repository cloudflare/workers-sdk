import http from "node:http";
import { afterAll, beforeAll, test } from "vitest";
import { fetchJson } from "../../__test-utils__";

// Regression test for https://github.com/cloudflare/workers-sdk/issues/13791.
//
// Under `vite dev`, outbound subrequests should carry a `CF-Worker` header
// matching the configured `dev.host` (see this fixture's `wrangler.jsonc`).
// Before the fix, the plugin dropped the zone before handing the Worker to
// Miniflare and Miniflare fell back to `<worker-name>.example.com`.

let echoServer: http.Server;
let echoUrl: string;

beforeAll(async () => {
	echoServer = http.createServer((req, res) => {
		res.setHeader("Content-Type", "application/json");
		res.end(
			JSON.stringify({
				cfWorker: req.headers["cf-worker"] ?? null,
			})
		);
	});
	// Bind to port 0 so the OS assigns a free port — avoids collisions with
	// other playground fixtures that use fixed ports (e.g. `stream-binding`).
	await new Promise<void>((resolve) =>
		echoServer.listen(0, "127.0.0.1", resolve)
	);
	const address = echoServer.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected echoServer.address() to be an AddressInfo");
	}
	echoUrl = `http://127.0.0.1:${address.port}/`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) =>
		echoServer.close((err) => (err ? reject(err) : resolve()))
	);
});

test("outbound subrequests use the configured `dev.host` as the `CF-Worker` header", async ({
	expect,
}) => {
	const response = await fetchJson(
		`/cf-worker-header?echoUrl=${encodeURIComponent(echoUrl)}`
	);
	expect(response).toEqual({ cfWorker: "cf-worker-header-test.example.com" });
});
