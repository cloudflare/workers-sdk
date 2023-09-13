import { fetch } from "undici";
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";

function removeUUID(str: string) {
	return str.replace(
		/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g,
		"00000000-0000-0000-0000-000000000000"
	);
}

const REMOTE = "https://playground-testing.devprod.cloudflare.dev";
const PREVIEW_REMOTE =
	"https://random-data.playground-testing.devprod.cloudflare.dev";

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
				"Content-Type":
					"multipart/form-data; boundary=----WebKitFormBoundaryqJEYLXuUiiZQHgvf",
			},
			body: '------WebKitFormBoundaryqJEYLXuUiiZQHgvf\nContent-Disposition: form-data; name="index.js"; filename="index.js"\nContent-Type: application/javascript+module\n\nexport default {\n	fetch(request) {\n		const url = new URL(request.url)\n		if(url.pathname === "/exchange") {\n			return Response.json({\n				token: "TEST_TOKEN",\n				prewarm: "TEST_PREWARM"\n			})\n		}\n		if(url.pathname === "/redirect") {\n			return Response.redirect("https://example.com", 302)\n		}\n		if(url.pathname === "/method") {\n			return new Response(request.method)\n		}\n		if(url.pathname === "/status") {\n			return new Response(407)\n		}\n		if(url.pathname === "/header") {\n			return new Response(request.headers.get("X-Custom-Header"))\n		}\n		return Response.json({\n			url: request.url,\n			headers: [...request.headers.entries()]\n		})\n	}\n}\n\n------WebKitFormBoundaryqJEYLXuUiiZQHgvf\nContent-Disposition: form-data; name="metadata"; filename="blob"\nContent-Type: application/json\n\n{"compatibility_date":"2023-05-04","main_module":"index.js"}\n------WebKitFormBoundaryqJEYLXuUiiZQHgvf--',
		}).then((response) => response.json());
	});

	it("should be redirected with cookie", async () => {
		const resp = await fetch(
			`${PREVIEW_REMOTE}/.update-preview-token?token=TEST_TOKEN&suffix=${encodeURIComponent(
				"/hello?world"
			)}`,
			{
				method: "GET",
				redirect: "manual",
			}
		);
		expect(resp.headers.get("location")).toMatchInlineSnapshot(
			'"/hello?world"'
		);
		expect(resp.headers.get("set-cookie") ?? "").toMatchInlineSnapshot(
			'"token=TEST_TOKEN; Domain=random-data.playground-testing.devprod.cloudflare.dev; HttpOnly; Secure; SameSite=None"'
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
				"Content-Type":
					"multipart/form-data; boundary=----WebKitFormBoundaryqJEYLXuUiiZQHgvf",
			},
			body: '------WebKitFormBoundaryqJEYLXuUiiZQHgvf\nContent-Disposition: form-data; name="index.js"; filename="index.js"\nContent-Type: application/javascript+module\n\nexport default {\n	fetch(request) {\n		const url = new URL(request.url)\n		if(url.pathname === "/exchange") {\n			return Response.json({\n				token: "TEST_TOKEN",\n				prewarm: "TEST_PREWARM"\n			})\n		}\n		if(url.pathname === "/redirect") {\n			return Response.redirect("https://example.com", 302)\n		}\n		if(url.pathname === "/method") {\n			return new Response(request.method)\n		}\n		if(url.pathname === "/status") {\n			return new Response(407)\n		}\n		if(url.pathname === "/header") {\n			return new Response(request.headers.get("X-Custom-Header"))\n		}\n		return Response.json({\n			url: request.url,\n			headers: [...request.headers.entries()]\n		})\n	}\n}\n\n------WebKitFormBoundaryqJEYLXuUiiZQHgvf\nContent-Disposition: form-data; name="metadata"; filename="blob"\nContent-Type: application/json\n\n{"compatibility_date":"2023-05-04","main_module":"index.js"}\n------WebKitFormBoundaryqJEYLXuUiiZQHgvf--',
		});
		expect(w.status).toMatchInlineSnapshot("200");
	});
	it("should provide error message on invalid worker", async () => {
		const w = await fetch(`${REMOTE}/api/worker`, {
			method: "POST",
			headers: {
				cookie: `user=${defaultUserToken}`,
				"Content-Type":
					"multipart/form-data; boundary=----WebKitFormBoundaryqJEYLXuUiiZQHgvf",
			},
			body: '------WebKitFormBoundaryqJEYLXuUiiZQHgvf\nContent-Disposition: form-data; name="index.js"; filename="index.js"\nContent-Type: application/javascript+module\n\nexport default {\n	fetch(request {\n		const url = new URL(request.url)\n		if(url.pathname === "/exchange") {\n			return Response.json({\n				token: "TEST_TOKEN",\n				prewarm: "TEST_PREWARM"\n			})\n		}\n		if(url.pathname === "/redirect") {\n			return Response.redirect("https://example.com", 302)\n		}\n		if(url.pathname === "/method") {\n			return new Response(request.method)\n		}\n		if(url.pathname === "/status") {\n			return new Response(407)\n		}\n		if(url.pathname === "/header") {\n			return new Response(request.headers.get("X-Custom-Header"))\n		}\n		return Response.json({\n			url: request.url,\n			headers: [...request.headers.entries()]\n		})\n	}\n}\n\n------WebKitFormBoundaryqJEYLXuUiiZQHgvf\nContent-Disposition: form-data; name="metadata"; filename="blob"\nContent-Type: application/json\n\n{"compatibility_date":"2023-05-04","main_module":"index.js"}\n------WebKitFormBoundaryqJEYLXuUiiZQHgvf--',
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
});

describe("Raw HTTP preview", () => {
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
});
