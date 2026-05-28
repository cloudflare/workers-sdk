import { LogLevel, Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { TestLog, useDispose, useServer } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

const CF_ACCESS_BLOCK_HTML = `<!DOCTYPE html>
<html>
<head><title>Error ・ Cloudflare Access</title></head>
<body>
<h1>Sign in to access this application</h1>
<p>This application is protected by Cloudflare Access.</p>
</body>
</html>`;

// Header line of the formatted warning. Distinct enough to filter on without
// matching the user-worker's stack-trace lines that follow it.
const ACCESS_WARNING_FRAGMENT =
	"Cloudflare Access blocked a remote bindings request";

// Script that returns the upstream response body verbatim so the test can
// assert what the user worker (and ultimately the browser / error message)
// will see for an Access-blocked binding call.
const SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const res = await env.SERVICE.fetch("http://example.com/");
			return new Response(await res.text(), {
				status: res.status,
				headers: { "Content-Type": res.headers.get("Content-Type") ?? "" },
			});
		},
	};
`;

describe("remote-bindings proxy client: Cloudflare Access warning", () => {
	test("logs a single warning when the remote proxy returns a Cloudflare Access block", async ({
		expect,
	}) => {
		// Local server that simulates the remote-bindings proxy server being
		// blocked by Cloudflare Access for every request.
		const { http: proxyUrl } = await useServer((req, res) => {
			res.statusCode = 403;
			res.setHeader("Content-Type", "text/html");
			res.end(CF_ACCESS_BLOCK_HTML);
		});

		const log = new TestLog();
		const mf = new Miniflare({
			modules: true,
			compatibilityDate: "2025-01-01",
			log,
			script: SCRIPT,
			serviceBindings: {
				SERVICE: {
					name: "some-remote-service",
					remoteProxyConnectionString:
						proxyUrl as unknown as RemoteProxyConnectionString,
				},
			},
		});
		useDispose(mf);

		// Fire several requests through the binding. Each one should be blocked
		// by the fake Access server, but the warning should only fire once.
		for (let i = 0; i < 3; i++) {
			const response = await mf.dispatchFetch("http://localhost/");
			// Consume the body so the response is fully drained.
			await response.text();
		}

		// Allow any pending fire-and-forget loopback POSTs to land before we
		// inspect the log. The Miniflare host handles dedup, so we wait briefly.
		await new Promise((resolve) => setTimeout(resolve, 200));

		const warnings = log.logsAtLevel(LogLevel.WARN);
		const accessWarnings = warnings.filter((message) =>
			message.includes(ACCESS_WARNING_FRAGMENT)
		);

		expect(accessWarnings).toHaveLength(1);
		const [warning] = accessWarnings;
		expect(warning).toContain('Remote binding "SERVICE"');
		expect(warning).toContain(proxyUrl.toString());
		expect(warning).toContain("CLOUDFLARE_ACCESS_CLIENT_ID");
		expect(warning).toContain("CLOUDFLARE_ACCESS_CLIENT_SECRET");
		expect(warning).toContain("cloudflared access login");
	});

	test("substitutes the Access HTML body with readable guidance", async ({
		expect,
	}) => {
		// Local server that returns the Access block HTML.
		const { http: proxyUrl } = await useServer((req, res) => {
			res.statusCode = 403;
			res.setHeader("Content-Type", "text/html");
			res.end(CF_ACCESS_BLOCK_HTML);
		});

		const mf = new Miniflare({
			modules: true,
			compatibilityDate: "2025-01-01",
			log: new TestLog(),
			script: SCRIPT,
			serviceBindings: {
				SERVICE: {
					name: "some-remote-service",
					remoteProxyConnectionString:
						proxyUrl as unknown as RemoteProxyConnectionString,
				},
			},
		});
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		const body = await response.text();

		// The original Access HTML must NOT be in the body the user sees.
		expect(body).not.toContain("<!DOCTYPE html>");
		expect(body).not.toContain("<title>");

		// And our substituted, browser-friendly guidance must be there.
		expect(response.status).toBe(403);
		expect(response.headers.get("Content-Type")).toContain("text/plain");
		expect(body).toContain("Cloudflare Access blocked this remote bindings");
		expect(body).toContain('binding "SERVICE"');
		expect(body).toContain(proxyUrl.toString());
		expect(body).toContain("CLOUDFLARE_ACCESS_CLIENT_ID");
		expect(body).toContain("CLOUDFLARE_ACCESS_CLIENT_SECRET");
		expect(body).toContain("cloudflared access login");
		expect(body).toContain(
			"https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/"
		);
	});

	test("does not log a warning for non-Access 403 responses", async ({
		expect,
	}) => {
		// Local server returns 403 with a body that does NOT mention
		// Cloudflare Access (e.g. an unrelated upstream auth response).
		const { http: proxyUrl } = await useServer((req, res) => {
			res.statusCode = 403;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "forbidden" }));
		});

		const log = new TestLog();
		const mf = new Miniflare({
			modules: true,
			compatibilityDate: "2025-01-01",
			log,
			script: SCRIPT,
			serviceBindings: {
				SERVICE: {
					name: "some-remote-service",
					remoteProxyConnectionString:
						proxyUrl as unknown as RemoteProxyConnectionString,
				},
			},
		});
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		// Non-Access 403 bodies should pass through unmodified.
		const body = await response.text();
		expect(body).toBe(JSON.stringify({ error: "forbidden" }));

		await new Promise((resolve) => setTimeout(resolve, 200));

		const accessWarnings = log
			.logsAtLevel(LogLevel.WARN)
			.filter((message) => message.includes(ACCESS_WARNING_FRAGMENT));
		expect(accessWarnings).toHaveLength(0);
	});

	test("does not log a warning when the response is not a 403", async ({
		expect,
	}) => {
		// Local server returns a 200 (happy path) — no warning should fire.
		const { http: proxyUrl } = await useServer((req, res) => {
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/plain");
			res.end("ok");
		});

		const log = new TestLog();
		const mf = new Miniflare({
			modules: true,
			compatibilityDate: "2025-01-01",
			log,
			script: SCRIPT,
			serviceBindings: {
				SERVICE: {
					name: "some-remote-service",
					remoteProxyConnectionString:
						proxyUrl as unknown as RemoteProxyConnectionString,
				},
			},
		});
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		await response.text();

		await new Promise((resolve) => setTimeout(resolve, 200));

		const accessWarnings = log
			.logsAtLevel(LogLevel.WARN)
			.filter((message) => message.includes(ACCESS_WARNING_FRAGMENT));
		expect(accessWarnings).toHaveLength(0);
	});
});
