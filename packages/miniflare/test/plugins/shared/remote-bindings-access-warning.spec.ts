import path from "node:path";
import { build } from "esbuild";
import { LogLevel, Miniflare } from "miniflare";
import { beforeAll, describe, test } from "vitest";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
	useServer,
} from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

const CF_ACCESS_BLOCK_HTML = `<!DOCTYPE html>
<html>
<head><title>Error ・ Cloudflare Access</title></head>
<body>
<h1>Sign in to access this application</h1>
<p>This application is protected by Cloudflare Access.</p>
</body>
</html>`;

// Where the edge redirects a request that carries no valid Access credentials.
const ACCESS_LOGIN_URL =
	"https://example-team.cloudflareaccess.com/cdn-cgi/access/login/my-worker.example.workers.dev?kid=0123&meta=eyJ0eXAiOiJKV1QifQ.e30.c2ln";

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

// Script that calls the binding without following redirects (as a Worker
// proxying its incoming request with `env.SERVICE.fetch(request)` does) and
// reports what it got back.
const MANUAL_REDIRECT_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const { pathname } = new URL(request.url);
			const res = await env.SERVICE.fetch("http://example.com" + pathname, {
				redirect: "manual",
			});
			return Response.json({
				status: res.status,
				location: res.headers.get("Location"),
				forwardedMarker: res.headers.get("MF-Forwarded-Response"),
				body: await res.text(),
			});
		},
	};
`;

type ManualRedirectResult = {
	status: number;
	location: string | null;
	forwardedMarker: string | null;
	body: string;
};

// Real edge-side remote-bindings proxy server, bundled for the tests that run
// it in a second "edge" Miniflare instance.
const PROXY_SERVER_WORKER_PATH = path.resolve(
	__dirname,
	"../../../../remote-bindings/templates/remoteBindings/ProxyServerWorker.ts"
);

/**
 * Start a Miniflare instance running `script`, with a remote `SERVICE` service
 * binding served by the remote-bindings proxy server at `proxyUrl`.
 */
function useRemoteServiceMiniflare(
	proxyUrl: URL,
	{ log, script = SCRIPT }: { log: TestLog; script?: string }
): Miniflare {
	const mf = new Miniflare({
		log,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-01-01",
					manifest: singleModuleManifest(script),
					env: {
						SERVICE: {
							type: "worker",
							worker: "some-remote-service",
							dev: { remote: true },
						},
					},
				},
				dev: {
					remoteProxyConnectionString:
						proxyUrl as unknown as RemoteProxyConnectionString,
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}

function getAccessWarnings(log: TestLog): string[] {
	return log
		.logsAtLevel(LogLevel.WARN)
		.filter((message) => message.includes(ACCESS_WARNING_FRAGMENT));
}

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
			log,
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(SCRIPT),
						env: {
							SERVICE: {
								type: "worker",
								worker: "some-remote-service",
								dev: { remote: true },
							},
						},
					},
					dev: {
						remoteProxyConnectionString:
							proxyUrl as unknown as RemoteProxyConnectionString,
					},
				},
			],
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
			log: new TestLog(),
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(SCRIPT),
						env: {
							SERVICE: {
								type: "worker",
								worker: "some-remote-service",
								dev: { remote: true },
							},
						},
					},
					dev: {
						remoteProxyConnectionString:
							proxyUrl as unknown as RemoteProxyConnectionString,
					},
				},
			],
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
			log,
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(SCRIPT),
						env: {
							SERVICE: {
								type: "worker",
								worker: "some-remote-service",
								dev: { remote: true },
							},
						},
					},
					dev: {
						remoteProxyConnectionString:
							proxyUrl as unknown as RemoteProxyConnectionString,
					},
				},
			],
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

	test("reports a Cloudflare Access login redirect instead of following it", async ({
		expect,
	}) => {
		// Local server that simulates the remote-bindings proxy server being
		// redirected to the Access login page, which is what the edge does when
		// the request carries no (or an expired) `CF_Authorization` cookie.
		let requestCount = 0;
		const { http: proxyUrl } = await useServer((req, res) => {
			requestCount++;
			res.statusCode = 302;
			res.setHeader("Location", ACCESS_LOGIN_URL);
			res.end();
		});

		const log = new TestLog();
		const mf = useRemoteServiceMiniflare(proxyUrl, { log });

		for (let i = 0; i < 3; i++) {
			const response = await mf.dispatchFetch("http://localhost/");
			const body = await response.text();

			expect(response.status).toBe(401);
			expect(response.headers.get("Content-Type")).toContain("text/plain");
			expect(body).toContain(
				"Cloudflare Access redirected this remote bindings request"
			);
			expect(body).toContain('binding "SERVICE"');
			expect(body).toContain("CLOUDFLARE_ACCESS_CLIENT_ID");
			// The login URL carries an Access `meta` JWT with user/device details.
			expect(body).not.toContain(ACCESS_LOGIN_URL);
		}

		// Following the redirect would send every hop back through the service
		// binding to the proxy server, looping until "Too many redirects".
		expect(requestCount).toBe(3);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const accessWarnings = getAccessWarnings(log);
		expect(accessWarnings).toHaveLength(1);
		const [warning] = accessWarnings;
		expect(warning).toContain('Remote binding "SERVICE"');
		expect(warning).toContain("redirected to the Cloudflare Access login page");
		expect(warning).not.toContain(ACCESS_LOGIN_URL);
	});

	test("reports an Access login redirect to callers that don't follow redirects", async ({
		expect,
	}) => {
		// Unmarked, so it came from Access in front of the proxy server. Passing
		// it on would send a browser to log in to the proxy server's host, which
		// would never give the dev server a `CF_Authorization` cookie.
		const { http: proxyUrl } = await useServer((req, res) => {
			res.statusCode = 302;
			res.setHeader("Location", ACCESS_LOGIN_URL);
			res.end();
		});

		const mf = useRemoteServiceMiniflare(proxyUrl, {
			log: new TestLog(),
			script: MANUAL_REDIRECT_SCRIPT,
		});

		const response = await mf.dispatchFetch("http://localhost/");
		const result = (await response.json()) as ManualRedirectResult;
		expect(result.status).toBe(401);
		expect(result.location).toBeNull();
		expect(result.body).toContain(
			"Cloudflare Access redirected this remote bindings request"
		);
	});

	test("passes through Access-looking responses returned by the remote binding itself", async ({
		expect,
	}) => {
		// The remote proxy server marks every response it forwards from the
		// binding. A marked Access login redirect or block page came from the
		// bound service (e.g. a Worker proxying an Access-protected origin), not
		// from Access in front of the proxy server, so it must reach the caller
		// unchanged.
		const { http: proxyUrl } = await useServer((req, res) => {
			res.setHeader("MF-Forwarded-Response", "true");
			if (req.headers["mf-url"] === "http://example.com/redirect") {
				res.statusCode = 302;
				res.setHeader("Location", ACCESS_LOGIN_URL);
				res.end();
				return;
			}
			res.statusCode = 403;
			res.setHeader("Content-Type", "text/html");
			res.end(CF_ACCESS_BLOCK_HTML);
		});

		const log = new TestLog();
		const mf = useRemoteServiceMiniflare(proxyUrl, {
			log,
			script: MANUAL_REDIRECT_SCRIPT,
		});

		const redirect = (await (
			await mf.dispatchFetch("http://localhost/redirect")
		).json()) as ManualRedirectResult;
		expect(redirect).toMatchObject({
			status: 302,
			location: ACCESS_LOGIN_URL,
			forwardedMarker: null,
		});

		const blocked = (await (
			await mf.dispatchFetch("http://localhost/blocked")
		).json()) as ManualRedirectResult;
		expect(blocked).toMatchObject({
			status: 403,
			body: CF_ACCESS_BLOCK_HTML,
			forwardedMarker: null,
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(getAccessWarnings(log)).toHaveLength(0);
	});

	test("does not intercept redirects that are not to the Access login page", async ({
		expect,
	}) => {
		const { http: proxyUrl } = await useServer((req, res) => {
			if (req.headers["mf-url"] === "http://example.com/") {
				res.statusCode = 302;
				res.setHeader("Location", "http://example.com/moved");
				res.end();
				return;
			}
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/plain");
			res.end("moved");
		});

		const log = new TestLog();
		const mf = useRemoteServiceMiniflare(proxyUrl, { log });

		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("moved");

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(getAccessWarnings(log)).toHaveLength(0);
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
			log,
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(SCRIPT),
						env: {
							SERVICE: {
								type: "worker",
								worker: "some-remote-service",
								dev: { remote: true },
							},
						},
					},
					dev: {
						remoteProxyConnectionString:
							proxyUrl as unknown as RemoteProxyConnectionString,
					},
				},
			],
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

describe("remote-bindings proxy server: forwarded responses", () => {
	let proxyServerBundle: string;
	beforeAll(async () => {
		const result = await build({
			entryPoints: [PROXY_SERVER_WORKER_PATH],
			bundle: true,
			format: "esm",
			target: "esnext",
			platform: "browser",
			// Workers runtime built-ins are provided by workerd, not bundled.
			external: ["cloudflare:*"],
			write: false,
		});
		proxyServerBundle = result.outputFiles[0].text;
	});

	/**
	 * Start an "edge" Miniflare instance running the real proxy server in front
	 * of a `remote-service` Worker running `serviceScript`, and return its URL.
	 */
	async function useEdgeMiniflare(serviceScript: string): Promise<URL> {
		const edge = new Miniflare({
			workers: [
				{
					config: {
						name: "proxy-server",
						compatibilityDate: "2025-01-01",
						manifest: {
							mainModule: "ProxyServerWorker.js",
							modules: {
								"ProxyServerWorker.js": {
									type: "esm",
									contents: proxyServerBundle,
								},
							},
						},
						env: { SERVICE: { type: "worker", worker: "remote-service" } },
					},
				},
				{
					config: {
						name: "remote-service",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(serviceScript),
					},
				},
			],
		});
		useDispose(edge);
		return edge.ready;
	}

	test("an Access login redirect returned by the remote service reaches the caller unchanged", async ({
		expect,
	}) => {
		const edgeUrl = await useEdgeMiniflare(/* javascript */ `
			export default {
				fetch() {
					return new Response(null, {
						status: 302,
						headers: { Location: ${JSON.stringify(ACCESS_LOGIN_URL)} },
					});
				},
			};
		`);

		const log = new TestLog();
		const mf = useRemoteServiceMiniflare(edgeUrl, {
			log,
			script: MANUAL_REDIRECT_SCRIPT,
		});

		const result = (await (
			await mf.dispatchFetch("http://localhost/")
		).json()) as ManualRedirectResult;
		expect(result).toMatchObject({
			status: 302,
			location: ACCESS_LOGIN_URL,
			forwardedMarker: null,
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(getAccessWarnings(log)).toHaveLength(0);
	});

	test("a manually encoded response from the remote service reaches the caller intact", async ({
		expect,
	}) => {
		// The proxy server re-wraps forwarded responses to tag them. The body it
		// receives has already been decoded by the runtime, so the re-wrapped
		// response must keep automatic encoding: `encodeBody: "manual"` would
		// send the decoded bytes under the original `Content-Encoding: gzip`.
		const text = "manually gzip-encoded response body ".repeat(20);
		const edgeUrl = await useEdgeMiniflare(/* javascript */ `
			export default {
				fetch() {
					const body = new Blob([${JSON.stringify(text)}])
						.stream()
						.pipeThrough(new CompressionStream("gzip"));
					return new Response(body, {
						headers: { "Content-Encoding": "gzip", "Content-Type": "text/plain" },
						encodeBody: "manual",
					});
				},
			};
		`);

		const mf = useRemoteServiceMiniflare(edgeUrl, { log: new TestLog() });

		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(text);
	});
});
