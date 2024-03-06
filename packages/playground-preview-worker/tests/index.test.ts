import { fetch } from "undici";
import { beforeAll, describe, expect, it } from "vitest";

const REMOTE = "https://playground-testing.devprod.cloudflare.dev";
const PREVIEW_REMOTE =
	"https://random-data.playground-testing.devprod.cloudflare.dev";

const TEST_WORKER_BOUNDARY = "----WebKitFormBoundaryqJEYLXuUiiZQHgvf";
const TEST_WORKER_CONTENT_TYPE = `multipart/form-data; boundary=${TEST_WORKER_BOUNDARY}`;
const TEST_WORKER = `--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="index.js"; filename="index.js"
Content-Type: application/javascript+module

export default {
	fetch(request) {
		const url = new URL(request.url)
		if(url.pathname === "/exchange") {
			return Response.json({
				token: "TEST_TOKEN",
				prewarm: "TEST_PREWARM"
			})
		}
		if(url.pathname === "/redirect") {
			return Response.redirect("https://example.com", 302)
		}
		if(url.pathname === "/method") {
			return new Response(request.method)
		}
		if(url.pathname === "/status") {
			return new Response(407)
		}
		if(url.pathname === "/header") {
			return new Response(request.headers.get("X-Custom-Header"))
		}
		if(url.pathname === "/cookies") {
			const headers = new Headers();

			headers.append("Set-Cookie", "foo=1");
			headers.append("Set-Cookie", "bar=2");

			return new Response(undefined, {
				headers,
			});
		}
		return Response.json({
			url: request.url,
			headers: [...request.headers.entries()]
		})
	}
}

--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="metadata"; filename="blob"
Content-Type: application/json

{"compatibility_date":"2023-05-04","main_module":"index.js"}
--${TEST_WORKER_BOUNDARY}--`;

async function fetchUserToken() {
	return fetch(REMOTE).then(
		(r) => r.headers.getSetCookie()[0].split(";")[0].split("=")[1]
	);
}
describe("Preview Worker", () => {
	let defaultUserToken: string;
	beforeAll(async () => {
		defaultUserToken = await fetchUserToken();

		await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: TEST_WORKER,
		}).then((response) => response.json());
	});

	it("should be redirected with cookie", async () => {
		const resp = await fetch(
			`${PREVIEW_REMOTE}/.update-preview-token?token=${defaultUserToken}&suffix=${encodeURIComponent(
				"/hello?world"
			)}`,
			{
				method: "GET",
				redirect: "manual",
				// These are forbidden headers, but undici currently allows setting them
				headers: {
					"Sec-Fetch-Dest": "iframe",
					Referer: "https://workers.cloudflare.com/",
				},
			}
		);
		expect(resp.headers.get("location")).toMatchInlineSnapshot(
			'"/hello?world"'
		);
		expect(resp.headers.get("set-cookie") ?? "").toMatchInlineSnapshot(
			`"token=${defaultUserToken}; Domain=random-data.playground-testing.devprod.cloudflare.dev; Path=/; HttpOnly; Secure; SameSite=None; Partitioned"`
		);
	});
	it("shouldn't be redirected with no token", async () => {
		const resp = await fetch(
			`${PREVIEW_REMOTE}/.update-preview-token?suffix=${encodeURIComponent(
				"/hello?world"
			)}`,
			{
				method: "GET",
				redirect: "manual",
				// These are forbidden headers, but undici currently allows setting them
				headers: {
					"Sec-Fetch-Dest": "iframe",
					Referer: "https://workers.cloudflare.com/",
				},
			}
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"TokenUpdateFailed","message":"Provide valid token","data":{}}"`
		);
	});
	it("shouldn't be redirected with invalid token", async () => {
		const resp = await fetch(
			`${PREVIEW_REMOTE}/.update-preview-token?token=TEST_TOKEN&suffix=${encodeURIComponent(
				"/hello?world"
			)}`,
			{
				method: "GET",
				redirect: "manual",
				// These are forbidden headers, but undici currently allows setting them
				headers: {
					"Sec-Fetch-Dest": "iframe",
					Referer: "https://workers.cloudflare.com/",
				},
			}
		);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"TokenUpdateFailed","message":"Provide valid token","data":{}}"`
		);
	});

	it("should convert cookie to header", async () => {
		const resp = await fetch(PREVIEW_REMOTE, {
			method: "GET",
			headers: {
				cookie: `token=${defaultUserToken}`,
			},
		});

		const json = (await resp.json()) as { headers: string[][]; url: string };

		expect(json.url.slice(-13, -1)).toMatchInlineSnapshot('".workers.dev"');
	});
	it("should not follow redirects", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/redirect`, {
			method: "GET",
			headers: {
				cookie: `token=${defaultUserToken}`,
			},
			redirect: "manual",
		});

		expect(resp.status).toMatchInlineSnapshot("302");
		expect(resp.headers.get("Location")).toMatchInlineSnapshot(
			'"https://example.com/"'
		);
		expect(await resp.text()).toMatchInlineSnapshot('""');
	});
	it("should return method", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/method`, {
			method: "PUT",
			headers: {
				cookie: `token=${defaultUserToken}`,
			},
			redirect: "manual",
		});

		expect(await resp.text()).toMatchInlineSnapshot('"PUT"');
	});
	it("should return header", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/header`, {
			method: "PUT",
			headers: {
				"X-Custom-Header": "custom",
				cookie: `token=${defaultUserToken}`,
			},
			redirect: "manual",
		});

		expect(await resp.text()).toMatchInlineSnapshot('"custom"');
	});
	it("should return status", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/status`, {
			method: "PUT",
			headers: {
				cookie: `token=${defaultUserToken}`,
			},
			redirect: "manual",
		});

		expect(await resp.text()).toMatchInlineSnapshot('"407"');
	});
	it("should reject no token", async () => {
		const resp = await fetch(PREVIEW_REMOTE);
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"PreviewRequestFailed","message":"Valid token not found","data":{}}"`
		);
	});
	it("should reject invalid cookie header", async () => {
		const resp = await fetch(PREVIEW_REMOTE, {
			headers: {
				cookie: "token",
			},
		});
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"PreviewRequestFailed","message":"Valid token not found","data":{}}"`
		);
	});
	it("should reject invalid token", async () => {
		const resp = await fetch(PREVIEW_REMOTE, {
			headers: {
				cookie: `token=TEST_TOKEN`,
			},
		});
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"PreviewRequestFailed","message":"Valid token not found","data":{"tokenId":"TEST_TOKEN"}}"`
		);
	});

	it("should return raw HTTP response", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/header`, {
			headers: {
				"X-CF-Token": defaultUserToken,
				"CF-Raw-HTTP": "true",
				"X-Custom-Header": "custom",
			},
			redirect: "manual",
		});
		expect(resp.headers.get("cf-ew-raw-content-length")).toMatchInlineSnapshot(
			'"6"'
		);
		expect(await resp.text()).toMatchInlineSnapshot('"custom"');
	});
	it("should reject no token for raw HTTP response", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/header`, {
			headers: {
				"CF-Raw-HTTP": "true",
				"X-Custom-Header": "custom",
			},
			redirect: "manual",
		});
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"RawHttpFailed","message":"Provide valid token","data":{}}"`
		);
	});
	it("should reject invalid token for raw HTTP response", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/header`, {
			headers: {
				"X-CF-Token": "TEST_TOKEN",
				"CF-Raw-HTTP": "true",
				"X-Custom-Header": "custom",
			},
			redirect: "manual",
		});
		expect(resp.status).toBe(400);
		expect(await resp.text()).toMatchInlineSnapshot(
			`"{"error":"RawHttpFailed","message":"Provide valid token","data":{}}"`
		);
	});

	describe("Referer", () => {
		it("should allow localhost", async () => {
			const resp = await fetch(
				`${PREVIEW_REMOTE}/.update-preview-token?token=${defaultUserToken}&suffix=${encodeURIComponent(
					"/hello?world"
				)}`,
				{
					method: "GET",
					redirect: "manual",
					// These are forbidden headers, but undici currently allows setting them
					headers: {
						"Sec-Fetch-Dest": "iframe",
						Referer: "http://localhost:5173/some/path",
					},
				}
			);
			expect(resp.headers.get("location")).toMatchInlineSnapshot(
				'"/hello?world"'
			);
			expect(resp.headers.get("set-cookie") ?? "").toMatchInlineSnapshot(
				`"token=${defaultUserToken}; Domain=random-data.playground-testing.devprod.cloudflare.dev; Path=/; HttpOnly; Secure; SameSite=None; Partitioned"`
			);
		});
		it("should allow workers.cloudflare.com", async () => {
			const resp = await fetch(
				`${PREVIEW_REMOTE}/.update-preview-token?token=${defaultUserToken}&suffix=${encodeURIComponent(
					"/hello?world"
				)}`,
				{
					method: "GET",
					redirect: "manual",
					// These are forbidden headers, but undici currently allows setting them
					headers: {
						"Sec-Fetch-Dest": "iframe",
						Referer: "https://workers.cloudflare.com/some/path",
					},
				}
			);
			expect(resp.headers.get("location")).toMatchInlineSnapshot(
				'"/hello?world"'
			);
			expect(resp.headers.get("set-cookie") ?? "").toMatchInlineSnapshot(
				`"token=${defaultUserToken}; Domain=random-data.playground-testing.devprod.cloudflare.dev; Path=/; HttpOnly; Secure; SameSite=None; Partitioned"`
			);
		});
		it("should allow workers-playground.pages.dev", async () => {
			const resp = await fetch(
				`${PREVIEW_REMOTE}/.update-preview-token?token=${defaultUserToken}&suffix=${encodeURIComponent(
					"/hello?world"
				)}`,
				{
					method: "GET",
					redirect: "manual",
					// These are forbidden headers, but undici currently allows setting them
					headers: {
						"Sec-Fetch-Dest": "iframe",
						Referer:
							"https://preview-id.workers-playground.pages.dev/some/path",
					},
				}
			);
			expect(resp.headers.get("location")).toMatchInlineSnapshot(
				'"/hello?world"'
			);
			expect(resp.headers.get("set-cookie") ?? "").toMatchInlineSnapshot(
				`"token=${defaultUserToken}; Domain=random-data.playground-testing.devprod.cloudflare.dev; Path=/; HttpOnly; Secure; SameSite=None; Partitioned"`
			);
		});
		it("should reject unknown referer", async () => {
			const resp = await fetch(
				`${PREVIEW_REMOTE}/.update-preview-token?token=${defaultUserToken}&suffix=${encodeURIComponent(
					"/hello?world"
				)}`,
				{
					method: "GET",
					redirect: "manual",
					// These are forbidden headers, but undici currently allows setting them
					headers: {
						"Sec-Fetch-Dest": "iframe",
						Referer: "https://example.com/some/path",
					},
				}
			);
			expect(await resp.json()).toMatchInlineSnapshot(`
				{
				  "data": {},
				  "error": "PreviewRequestForbidden",
				  "message": "Preview request forbidden",
				}
			`);
		});
		it("should reject unknown referer with pages.dev in path", async () => {
			const resp = await fetch(
				`${PREVIEW_REMOTE}/.update-preview-token?token=${defaultUserToken}&suffix=${encodeURIComponent(
					"/hello?world"
				)}`,
				{
					method: "GET",
					redirect: "manual",
					// These are forbidden headers, but undici currently allows setting them
					headers: {
						"Sec-Fetch-Dest": "iframe",
						Referer: "https://example.com/workers-playground.pages.dev",
					},
				}
			);
			expect(await resp.json()).toMatchInlineSnapshot(`
				{
				  "data": {},
				  "error": "PreviewRequestForbidden",
				  "message": "Preview request forbidden",
				}
			`);
		});
	});
});

describe("Upload Worker", () => {
	let defaultUserToken: string;
	beforeAll(async () => {
		defaultUserToken = await fetchUserToken();
	});
	it("should upload valid worker", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: TEST_WORKER,
		});
		expect(w.status).toMatchInlineSnapshot("200");
	});
	it("should provide error message on invalid worker", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: TEST_WORKER.replace("fetch(request)", "fetch(request"),
		}).then((response) => response.json());
		expect(w).toMatchInlineSnapshot(`
			{
			  "data": {
			    "error": "Uncaught SyntaxError: Unexpected token '{'
			  at index.js:2:15
			",
			  },
			  "error": "PreviewError",
			  "message": "Uncaught SyntaxError: Unexpected token '{'
			  at index.js:2:15
			",
			}
		`);
	});
	it("should reject no token", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: TEST_WORKER,
		});
		expect(w.status).toBe(401);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"UploadFailed","message":"Valid token not provided","data":{}}"`
		);
	});
	it("should reject invalid token", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=TEST_TOKEN`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: TEST_WORKER,
		});
		expect(w.status).toBe(401);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"UploadFailed","message":"Valid token not provided","data":{}}"`
		);
	});
	it("should reject invalid form data", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": "text/plain",
			},
			body: "not a form",
		});
		expect(w.status).toBe(400);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"BadUpload","message":"Expected valid form data","data":{"error":"TypeError: Unrecognized Content-Type header value. FormData can only parse the following MIME types: multipart/form-data, application/x-www-form-urlencoded"}}"`
		);
	});
	it("should reject missing metadata", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: `--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="index.js"; filename="index.js"
Content-Type: application/javascript+module

export default {
	fetch(request) { return new Response("body"); }
}

--${TEST_WORKER_BOUNDARY}--`,
		});
		expect(w.status).toBe(400);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"BadUpload","message":"Expected metadata file to be defined","data":{}}"`
		);
	});
	it("should reject invalid metadata json", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: `--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="metadata"; filename="blob"
Content-Type: application/json

{"compatibility_date":"2023-05-04",
--${TEST_WORKER_BOUNDARY}--`,
		});
		expect(w.status).toBe(400);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"BadUpload","message":"Expected metadata file to be valid","data":{}}"`
		);
	});
	it("should reject invalid metadata", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: `--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="metadata"; filename="blob"
Content-Type: application/json

{"compatibility_date":42,"main_module":"index.js"}
--${TEST_WORKER_BOUNDARY}--`,
		});
		expect(w.status).toBe(400);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"BadUpload","message":"Expected metadata file to be valid","data":{}}"`
		);
	});
	it("should reject service worker", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: `--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="index.js"; filename="index.js"
Content-Type: application/javascript

addEventListener("fetch", (event) => event.respondWith(new Response("body")));
--${TEST_WORKER_BOUNDARY}
Content-Disposition: form-data; name="metadata"; filename="blob"
Content-Type: application/json

{"compatibility_date":"2023-05-04","body_part":"index.js"}
--${TEST_WORKER_BOUNDARY}--`,
		});
		expect(w.status).toBe(400);
		expect(await w.text()).toMatchInlineSnapshot(
			`"{"error":"ServiceWorkerNotSupported","message":"Service Workers are not supported in the Workers Playground","data":{}}"`
		);
	});
});

describe("Raw HTTP preview", () => {
	let defaultUserToken: string;
	beforeAll(async () => {
		defaultUserToken = await fetchUserToken();

		await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type": TEST_WORKER_CONTENT_TYPE,
			},
			body: TEST_WORKER,
		}).then((response) => response.json());
	});
	it("should allow arbitrary headers in cross-origin requests", async () => {
		const resp = await fetch(PREVIEW_REMOTE, {
			method: "OPTIONS",
			headers: {
				"Access-Control-Request-Headers": "foo",
				origin: "https://cloudflare.dev",
				"cf-raw-http": "true",
			},
		});

		expect(resp.headers.get("Access-Control-Allow-Headers")).toBe("foo");
	});
	it("should allow arbitrary methods in cross-origin requests", async () => {
		const resp = await fetch(PREVIEW_REMOTE, {
			method: "OPTIONS",
			headers: {
				"Access-Control-Request-Method": "PUT",
				origin: "https://cloudflare.dev",
				"cf-raw-http": "true",
			},
		});

		expect(resp.headers.get("Access-Control-Allow-Methods")).toBe("*");
	});

	it("should preserve multiple cookies", async () => {
		const resp = await fetch(`${PREVIEW_REMOTE}/cookies`, {
			method: "GET",
			headers: {
				origin: "https://cloudflare.dev",
				"cf-raw-http": "true",
				"X-CF-Token": defaultUserToken,
			},
		});

		expect(resp.headers.get("cf-ew-raw-set-cookie")).toMatchInlineSnapshot(
			`"foo=1, bar=2"`
		);
	});
});
