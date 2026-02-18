import { randomBytes } from "node:crypto";
import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

// Mock URL for the remote worker - all outbound fetches will be intercepted
const MOCK_REMOTE_URL = "http://mock-remote.test";

function removeUUID(str: string) {
	return str.replace(
		/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g,
		"00000000-0000-0000-0000-000000000000"
	);
}

// Mock implementation for the remote worker
function createMockFetchImplementation() {
	return async (input: Request | string | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const url = new URL(request.url);

		// Only intercept requests to our mock remote URL
		if (url.origin !== MOCK_REMOTE_URL) {
			return new Response("OK", { status: 200 });
		}

		if (url.pathname === "/exchange") {
			return Response.json({
				token: "TEST_TOKEN",
				prewarm: "TEST_PREWARM",
			});
		}
		if (url.pathname === "/redirect") {
			// Use manual redirect to avoid trailing slash being added
			return new Response(null, {
				status: 302,
				headers: { Location: "https://example.com" },
			});
		}
		if (url.pathname === "/method") {
			// HEAD requests should return empty body
			const body = request.method === "HEAD" ? null : request.method;
			return new Response(body, {
				headers: { "Test-Http-Method": request.method },
			});
		}
		if (url.pathname === "/status") {
			return new Response("407");
		}
		if (url.pathname === "/header") {
			return new Response(request.headers.get("X-Custom-Header"));
		}
		if (url.pathname === "/cookies") {
			const headers = new Headers();
			headers.append("Set-Cookie", "foo=1");
			headers.append("Set-Cookie", "bar=2");
			return new Response(undefined, { headers });
		}
		if (url.pathname === "/prewarm") {
			return new Response("OK");
		}

		return Response.json(
			{
				url: request.url,
				headers: [...request.headers.entries()],
			},
			{ headers: { "Content-Encoding": "identity" } }
		);
	};
}

beforeEach(() => {
	vi.spyOn(globalThis, "fetch").mockImplementation(
		createMockFetchImplementation()
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Preview Worker", () => {
	let tokenId: string | null = null;

	it("should obtain token from exchange_url", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://preview.devprod.cloudflare.dev/exchange?exchange_url=${encodeURIComponent(
				`${MOCK_REMOTE_URL}/exchange`
			)}`,
			{
				method: "POST",
			}
		);
		const text = await resp.json();
		expect(text).toMatchInlineSnapshot(
			`
			{
			  "prewarm": "TEST_PREWARM",
			  "token": "TEST_TOKEN",
			}
		`
		);
	});
	it("should reject invalid exchange_url", async ({ expect }) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await SELF.fetch(
			`https://preview.devprod.cloudflare.dev/exchange?exchange_url=not_an_exchange_url`,
			{ method: "POST" }
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"Error","message":"Invalid URL"}"`
		);
	});
	it("should allow tokens > 4096 bytes", async ({ expect }) => {
		// 4096 is the size limit for cookies
		const token = randomBytes(4096).toString("hex");
		expect(token.length).toBe(8192);

		let resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=${encodeURIComponent(
				token
			)}&prewarm=${encodeURIComponent(
				`${MOCK_REMOTE_URL}/prewarm`
			)}&remote=${encodeURIComponent(
				MOCK_REMOTE_URL
			)}&suffix=${encodeURIComponent("/hello?world")}`,
			{
				method: "GET",
				redirect: "manual",
			}
		);
		expect(await resp.text()).toMatchInlineSnapshot('""');
		expect(resp.headers.get("location")).toMatchInlineSnapshot(
			'"/hello?world"'
		);
		expect(
			removeUUID(resp.headers.get("set-cookie") ?? "")
		).toMatchInlineSnapshot(
			'"token=00000000-0000-0000-0000-000000000000; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None"'
		);
		tokenId = (resp.headers.get("set-cookie") ?? "")
			.split(";")[0]
			.split("=")[1];
		resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}`,
				},
			}
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ignoring this test type error for sake of turborepo PR
		const json = (await resp.json()) as any;

		expect(json).toMatchObject({
			url: `${MOCK_REMOTE_URL}/`,
			headers: expect.arrayContaining([["cf-workers-preview-token", token]]),
		});
	});
	it("should be redirected with cookie", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=${encodeURIComponent(
				`${MOCK_REMOTE_URL}/prewarm`
			)}&remote=${encodeURIComponent(
				MOCK_REMOTE_URL
			)}&suffix=${encodeURIComponent("/hello?world")}`,
			{
				method: "GET",
				redirect: "manual",
			}
		);
		expect(resp.headers.get("location")).toMatchInlineSnapshot(
			'"/hello?world"'
		);
		expect(
			removeUUID(resp.headers.get("set-cookie") ?? "")
		).toMatchInlineSnapshot(
			'"token=00000000-0000-0000-0000-000000000000; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None"'
		);
		tokenId = (resp.headers.get("set-cookie") ?? "")
			.split(";")[0]
			.split("=")[1];
	});
	it("should reject invalid prewarm url", async ({ expect }) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=not_a_prewarm_url&remote=${encodeURIComponent(
				MOCK_REMOTE_URL
			)}&suffix=${encodeURIComponent("/hello?world")}`
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"Error","message":"Invalid URL"}"`
		);
	});
	it("should reject invalid remote url", async ({ expect }) => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/.update-preview-token?token=TEST_TOKEN&prewarm=${encodeURIComponent(
				`${MOCK_REMOTE_URL}/prewarm`
			)}&remote=not_a_remote_url&suffix=${encodeURIComponent("/hello?world")}`
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"Error","message":"Invalid URL"}"`
		);
	});

	it("should convert cookie to header", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
			}
		);

		const json = (await resp.json()) as { headers: string[][]; url: string };
		expect(json).toMatchObject({
			url: `${MOCK_REMOTE_URL}/`,
			headers: expect.arrayContaining([
				["cf-workers-preview-token", "TEST_TOKEN"],
			]),
		});
	});
	it("should not follow redirects", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/redirect`,
			{
				method: "GET",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(resp.status).toMatchInlineSnapshot("302");
		expect(resp.headers.get("Location")).toMatchInlineSnapshot(
			'"https://example.com"'
		);
		expect(await resp.text()).toMatchInlineSnapshot('""');
	});
	it("should return method", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/method`,
			{
				method: "PUT",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"PUT"');
	});
	it("should return header", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/header`,
			{
				method: "PUT",
				headers: {
					"X-Custom-Header": "custom",
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"custom"');
	});
	it("should return status", async ({ expect }) => {
		const resp = await SELF.fetch(
			`https://random-data.preview.devprod.cloudflare.dev/status`,
			{
				method: "PUT",
				headers: {
					cookie: `token=${tokenId}; Domain=random-data.preview.devprod.cloudflare.dev; HttpOnly; Secure; Partitioned; SameSite=None`,
				},
				redirect: "manual",
			}
		);

		expect(await resp.text()).toMatchInlineSnapshot('"407"');
	});
});

describe("Raw HTTP preview", () => {
	it("should allow arbitrary headers in cross-origin requests", async ({
		expect,
	}) => {
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev`,
			{
				method: "OPTIONS",
				headers: {
					"Access-Control-Request-Headers": "foo",
					origin: "https://cloudflare.dev",
				},
			}
		);

		expect(resp.headers.get("Access-Control-Allow-Headers")).toBe("foo");
	});

	it("should allow arbitrary methods in cross-origin requests", async ({
		expect,
	}) => {
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev`,
			{
				method: "OPTIONS",
				headers: {
					"Access-Control-Request-Method": "PUT",
					origin: "https://cloudflare.dev",
				},
			}
		);

		expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("*");
	});

	it("should preserve multiple cookies", async ({ expect }) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/cookies`,
			{
				method: "GET",
				headers: {
					"Access-Control-Request-Method": "GET",
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": MOCK_REMOTE_URL,
				},
			}
		);

		expect(resp.headers.get("cf-ew-raw-set-cookie")).toMatchInlineSnapshot(
			`"foo=1, bar=2"`
		);
	});

	it("should pass headers to the user-worker", async ({ expect }) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/`,
			{
				method: "GET",
				headers: {
					"Access-Control-Request-Method": "GET",
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": MOCK_REMOTE_URL,
					"Some-Custom-Header": "custom",
					Accept: "application/json",
				},
			}
		);

		const body = (await resp.json()) as Record<string, unknown>;

		const headers = (body.headers as [string, string][]).filter(
			(h) => h[0] === "some-custom-header" || h[0] === "accept"
		);

		// This contains some-custom-header & accept, as expected
		expect(headers).toMatchInlineSnapshot(`
			[
			  [
			    "accept",
			    "application/json",
			  ],
			  [
			    "some-custom-header",
			    "custom",
			  ],
			]
		`);
	});

	it("should use the method specified on the X-CF-Http-Method header", async ({
		expect,
	}) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/method`,
			{
				method: "POST",
				headers: {
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": MOCK_REMOTE_URL,
					"X-CF-Http-Method": "PUT",
				},
			}
		);

		expect(await resp.text()).toEqual("PUT");
	});

	it.for(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
		"should support %s method specified on the X-CF-Http-Method header",
		async (method, { expect }) => {
			const token = randomBytes(4096).toString("hex");
			const resp = await SELF.fetch(
				`https://0000.rawhttp.devprod.cloudflare.dev/method`,
				{
					method: "POST",
					headers: {
						origin: "https://cloudflare.dev",
						"X-CF-Token": token,
						"X-CF-Remote": MOCK_REMOTE_URL,
						"X-CF-Http-Method": method,
					},
				}
			);

			// HEAD request does not return any body. So we will confirm by asserting the response header
			expect(await resp.text()).toEqual(method === "HEAD" ? "" : method);
			// Header from the client response will be prefixed with "cf-ew-raw-"
			expect(resp.headers.get("cf-ew-raw-Test-Http-Method")).toEqual(method);
		}
	);

	it("should fallback to the request method if the X-CF-Http-Method header is missing", async ({
		expect,
	}) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/method`,
			{
				method: "PUT",
				headers: {
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": MOCK_REMOTE_URL,
				},
			}
		);

		expect(await resp.text()).toEqual("PUT");
	});

	it("should strip cf-ew-raw- prefix from headers which have it before hitting the user-worker", async ({
		expect,
	}) => {
		const token = randomBytes(4096).toString("hex");
		const resp = await SELF.fetch(
			`https://0000.rawhttp.devprod.cloudflare.dev/`,
			{
				method: "GET",
				headers: {
					"Access-Control-Request-Method": "GET",
					origin: "https://cloudflare.dev",
					"X-CF-Token": token,
					"X-CF-Remote": MOCK_REMOTE_URL,
					"cf-ew-raw-Some-Custom-Header": "custom",
					"cf-ew-raw-Accept": "application/json",
				},
			}
		);

		const body = (await resp.json()) as Record<string, unknown>;

		const headers = (body.headers as [string, string][]).filter(
			(h) =>
				h[0] === "some-custom-header" ||
				h[0] === "accept" ||
				h[0].startsWith("cf-ew-raw-")
		);

		// This contains some-custom-header & accept, as expected, and does not contain cf-ew-raw-some-custom-header or cf-ew-raw-accept
		expect(headers).toMatchInlineSnapshot(`
			[
			  [
			    "accept",
			    "application/json",
			  ],
			  [
			    "some-custom-header",
			    "custom",
			  ],
			]
		`);
	});
});
