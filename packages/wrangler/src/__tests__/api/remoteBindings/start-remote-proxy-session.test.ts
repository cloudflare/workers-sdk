import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { startRemoteProxySession } from "../../../api/remoteBindings/start-remote-proxy-session";
import { getAccessHeaders } from "../../../user/access";

// `startRemoteProxySession` spins up a real proxy-server worker via
// `startWorker`. Stub it out so the test focuses on the Access-header wiring:
// resolving `getAccessHeaders()` for the proxy host and carrying the result on
// the connection string + session.
let proxyUrl = new URL("https://proxy-a.example.workers.dev/");
// Captures the most recently created fake worker so tests can assert on its
// `dispose` (e.g. the cleanup-on-throw path).
let lastFakeWorker: ReturnType<typeof makeFakeWorker> | undefined;
function makeFakeWorker() {
	const worker = {
		ready: Promise.resolve(),
		url: Promise.resolve(proxyUrl),
		dispose: vi.fn(async () => {}),
		patchConfig: vi.fn(async () => {}),
		raw: {
			addListener: vi.fn(),
			proxy: {
				localServerReady: { promise: Promise.resolve() },
				runtimeMessageMutex: { drained: vi.fn(async () => {}) },
			},
		},
	};
	lastFakeWorker = worker;
	return worker;
}

vi.mock("../../../api/startDevWorker", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../api/startDevWorker")>();
	return {
		...actual,
		startWorker: vi.fn(async () => makeFakeWorker()),
	};
});

vi.mock("../../../user/access", () => ({
	getAccessHeaders: vi.fn(),
}));

describe("startRemoteProxySession - Access auth", () => {
	beforeEach(() => {
		proxyUrl = new URL("https://proxy-a.example.workers.dev/");
		lastFakeWorker = undefined;
		vi.mocked(getAccessHeaders).mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("resolves Access headers for the proxy host and carries them on the connection string", async ({
		expect,
	}) => {
		const headers = {
			"CF-Access-Client-Id": "client-id.access",
			"CF-Access-Client-Secret": "client-secret",
		};
		vi.mocked(getAccessHeaders).mockResolvedValue(headers);

		const session = await startRemoteProxySession({});

		// Looked up against the proxy server's host (not some other domain).
		expect(getAccessHeaders).toHaveBeenCalledWith(
			"proxy-a.example.workers.dev"
		);
		// Exposed on the session for observability/testing...
		expect(session.remoteProxyHeaders).toEqual(headers);
		// ...and carried on the connection string so Miniflare forwards them.
		expect(session.remoteProxyConnectionString.remoteProxyHeaders).toEqual(
			headers
		);
	});

	it("supports cloudflared cookie auth (Cookie header)", async ({ expect }) => {
		const headers = { Cookie: "CF_Authorization=token-value" };
		vi.mocked(getAccessHeaders).mockResolvedValue(headers);

		const session = await startRemoteProxySession({});

		expect(session.remoteProxyHeaders).toEqual(headers);
		expect(session.remoteProxyConnectionString.remoteProxyHeaders).toEqual(
			headers
		);
	});

	it("attaches nothing when the host is not behind Access", async ({
		expect,
	}) => {
		vi.mocked(getAccessHeaders).mockResolvedValue({});

		const session = await startRemoteProxySession({});

		expect(session.remoteProxyHeaders).toBeUndefined();
		expect(
			session.remoteProxyConnectionString.remoteProxyHeaders
		).toBeUndefined();
	});

	it("resolves headers per proxy host (multiworker: each session carries its own token)", async ({
		expect,
	}) => {
		// First worker / host.
		proxyUrl = new URL("https://worker-a.example.workers.dev/");
		vi.mocked(getAccessHeaders).mockResolvedValue({
			"CF-Access-Client-Id": "token-a.access",
			"CF-Access-Client-Secret": "secret-a",
		});
		const sessionA = await startRemoteProxySession({});

		// Second worker / host, different token.
		proxyUrl = new URL("https://worker-b.example.workers.dev/");
		vi.mocked(getAccessHeaders).mockResolvedValue({
			"CF-Access-Client-Id": "token-b.access",
			"CF-Access-Client-Secret": "secret-b",
		});
		const sessionB = await startRemoteProxySession({});

		expect(getAccessHeaders).toHaveBeenNthCalledWith(
			1,
			"worker-a.example.workers.dev"
		);
		expect(getAccessHeaders).toHaveBeenNthCalledWith(
			2,
			"worker-b.example.workers.dev"
		);
		// Each connection string carries its own host's token — sending worker-a's
		// token to worker-b's proxy would be the multiworker failure mode.
		expect(
			sessionA.remoteProxyConnectionString.remoteProxyHeaders?.[
				"CF-Access-Client-Id"
			]
		).toBe("token-a.access");
		expect(
			sessionB.remoteProxyConnectionString.remoteProxyHeaders?.[
				"CF-Access-Client-Id"
			]
		).toBe("token-b.access");
	});

	it("disposes the proxy worker if getAccessHeaders throws (no leak)", async ({
		expect,
	}) => {
		// e.g. a non-interactive UserError when the host is behind Access with no
		// service token, or a cloudflared failure.
		const accessError = new Error("Access auth failed");
		vi.mocked(getAccessHeaders).mockRejectedValue(accessError);

		await expect(startRemoteProxySession({})).rejects.toThrow(
			"Access auth failed"
		);

		// The already-started worker must be cleaned up before the error
		// propagates, since the caller never receives a session to dispose.
		expect(lastFakeWorker?.dispose).toHaveBeenCalledTimes(1);
	});
});
