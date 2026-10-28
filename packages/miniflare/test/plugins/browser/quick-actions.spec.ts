import assert from "node:assert";
import http from "node:http";
import { LogLevel, Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test, vi } from "vitest";
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

const CHROME_INSTALL_TIMEOUT = 10 * 60 * 1_000;

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
			// The CLI spinner shown while downloading Chrome writes to stdout
			vi.spyOn(process.stdout, "write").mockImplementation(() => true);
			server = http.createServer((req, res) => {
				if (req.url === "/empty") {
					req.socket.destroy();
				} else if (req.url === "/redirect") {
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
			// Launches (and on a cold machine downloads) Chrome before timed tests
			const warm = await quickAction("content", { html: "<p>warm</p>" });
			assert.strictEqual(warm.status, 200, await warm.text());
		}, CHROME_INSTALL_TIMEOUT);

		afterAll(async () => {
			await disposeWithRetry(mf);
			await new Promise((resolve) => server.close(resolve));
			vi.restoreAllMocks();
		});

		test("content returns the rendered HTML and page metadata", async ({
			expect,
		}) => {
			const res = await quickAction("content", { html: PAGE });
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("application/json");
			expect(Number(res.headers.get("x-browser-ms-used"))).toBeGreaterThan(0);
			const body = await res.json();
			expect(body).toEqual({
				success: true,
				result: expect.stringContaining("<h1>Hello</h1>"),
				meta: { status: 200, title: "Quick actions" },
			});
		});

		test("content runs no page scripts if setJavaScriptEnabled is false", async ({
			expect,
		}) => {
			const html =
				'<title>static</title><script>document.title = "scripted"</script>';
			const enabled = await quickAction("content", { html });
			expect(
				((await enabled.json()) as { meta: { title: string } }).meta.title
			).toBe("scripted");
			const disabled = await quickAction("content", {
				html,
				setJavaScriptEnabled: false,
			});
			expect(
				((await disabled.json()) as { meta: { title: string } }).meta.title
			).toBe("static");
		});

		test("content reports the origin response and redirects for a url", async ({
			expect,
		}) => {
			const res = await quickAction("content", { url: `${origin}/redirect` });
			expect(res.status).toBe(200);
			const { meta } = (await res.json()) as {
				meta: {
					status: number;
					finalUrl: string;
					headers: Record<string, string>;
					redirectChain: { url: string; status: number }[];
				};
			};
			expect(meta.status).toBe(200);
			expect(meta.finalUrl).toBe(`${origin}/`);
			expect(meta.headers["x-custom"]).toBe("yes");
			expect(meta.redirectChain).toMatchObject([
				{ url: `${origin}/redirect`, status: 302 },
			]);
		});

		test("markdown converts the page, resolving links against the url", async ({
			expect,
		}) => {
			const res = await quickAction("markdown", { url: origin });
			expect(res.status).toBe(200);
			const { result } = (await res.json()) as { result: string };
			expect(result).toMatch(/^---\ntitle: "Quick actions"\n---\n/);
			expect(result).toContain("# Hello");
			expect(result).toContain(`[About](${origin}/about)`);
		});

		test("markdown keeps the language of code blocks mdream can't read it from", async ({
			expect,
		}) => {
			const res = await quickAction("markdown", {
				html: [
					'<figure><figcaption><span>index.js</span><span>js</span></figcaption><pre class="astro-code" data-language="js"><code>a()</code></pre></figure>',
					'<pre data-lang="js"><code>b()</code></pre>',
					'<pre class="shiki language-js"><code>c()</code></pre>',
					'<pre class="language-js"><code data-language="ts">d()</code></pre>',
					'<pre data-language="js"><code data-lang="ts">e()</code></pre>',
					'<pre data-language="js" class="language-ts"><code>f()</code></pre>',
					'<pre data-language="sh"><code class="language-ts">g()</code></pre>',
					'<pre data-language="TypeScript"><code>h()</code></pre>',
					'<pre data-language="\t js \n"><code>i()</code></pre>',
					'<pre data-language="a b"><code>j()</code></pre>',
					'<pre lang="en" class="lang-de"><code>k()</code></pre>',
					'<pre class="astro-code" data-lang="sh">l</pre>',
				].join(""),
			});
			expect(res.status).toBe(200);
			const { result } = (await res.json()) as { result: string };
			expect(result).toBe(
				[
					"*index.jsjs*",
					"```js\na()\n```",
					"```js\nb()\n```",
					"```js\nc()\n```",
					"```ts\nd()\n```",
					"```ts\ne()\n```",
					"```ts\nf()\n```",
					"```ts\ng()\n```",
					"```TypeScript\nh()\n```",
					"```js\ni()\n```",
					"```\nj()\n```",
					"```\nk()\n```",
					"```sh\nl\n```",
				].join("\n\n")
			);
		});

		test("markdown uses the page's own HTML if the page hides document.cloneNode", async ({
			expect,
		}) => {
			const res = await quickAction("markdown", {
				html: '<form name="cloneNode"></form><pre data-language="js"><code>a()</code></pre>',
			});
			expect(res.status).toBe(200);
			expect(((await res.json()) as { result: string }).result).toBe(
				"```\na()\n```"
			);
		});

		test("json returns placeholder data shaped like the schema, and warns", async ({
			expect,
		}) => {
			log.logs = [];
			const res = await quickAction("json", {
				html: PAGE,
				response_format: {
					type: "json_schema",
					json_schema: {
						type: "object",
						properties: {
							title: { type: "string" },
							count: { type: "integer" },
							tags: { type: "array", items: { type: "string" } },
							kind: { type: "string", enum: ["page", "post"] },
							author: {
								type: "object",
								properties: { verified: { type: "boolean" } },
							},
							heading: { $ref: "#/$defs/text" },
							list: { $ref: "#/$defs/node" },
						},
						$defs: {
							text: { type: "string" },
							node: {
								type: "object",
								properties: { next: { $ref: "#/$defs/node" } },
							},
						},
					},
				},
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				success: true,
				result: {
					title: "",
					count: 0,
					tags: [],
					kind: "page",
					author: { verified: false },
					heading: "",
					list: { next: null },
				},
				meta: { status: 200, title: "Quick actions" },
			});
			expect(log.logsAtLevel(LogLevel.WARN)).toEqual([
				expect.stringContaining('"remote": true'),
			]);

			const promptOnly = await quickAction("json", {
				html: PAGE,
				prompt: "Get the title",
			});
			expect(((await promptOnly.json()) as { result: unknown }).result).toEqual(
				{}
			);
			expect(log.logsAtLevel(LogLevel.WARN)).toHaveLength(2);
		});

		test("json validates its options", async ({ expect }) => {
			const missing = await quickAction("json", { html: PAGE });
			expect(missing.status).toBe(400);
			expect(await missing.json()).toEqual({
				success: false,
				errors: [
					{
						code: "custom",
						message: "Either 'prompt' or 'response_format' must be defined",
						path: ["prompt", "response_format"],
					},
				],
			});

			const invalid = await quickAction("json", {
				html: PAGE,
				response_format: { type: "json_schema" },
				// Any number of models with any name is accepted
				custom_ai: ["llama", "a", "b", "c"].map((model) => ({ model })),
			});
			expect(await invalid.json()).toEqual({
				success: false,
				errors: [
					{
						code: "custom",
						message:
							"response_format.json_schema is required and must be non-empty when response_format.type is 'json_schema'",
						path: ["response_format", "json_schema"],
					},
				],
			});
		});

		test("invalid options return the validation issues", async ({ expect }) => {
			const res = await quickAction("content", {
				url: origin,
				html: PAGE,
				browser: "chrome",
			});
			expect(res.status).toBe(400);
			expect(res.headers.get("x-browser-ms-used")).toBe("0");
			expect(await res.json()).toEqual({
				success: false,
				errors: [
					{
						code: "custom",
						message:
							"url and html cannot be set at the same time, please remove one of them",
						path: ["url"],
					},
					{
						code: "invalid_value",
						values: ["kitesurf"],
						path: [],
						message: 'Invalid input: expected "kitesurf"',
					},
				],
			});
		});

		test("page failures caused by the request return 422", async ({
			expect,
		}) => {
			const empty = await quickAction("content", { url: `${origin}/empty` });
			expect(empty.status).toBe(422);
			expect(empty.headers.get("x-browser-ms-used")).toBe("0");
			expect(await empty.json()).toEqual({
				success: false,
				errors: [
					{
						code: 5011,
						message: "Empty response from server",
						detail: `net::ERR_EMPTY_RESPONSE at ${origin}/empty`,
					},
				],
			});

			const timeout = await quickAction("content", {
				html: PAGE,
				waitForSelector: { selector: "#never", timeout: 100 },
			});
			expect(timeout.status).toBe(422);
			expect(await timeout.json()).toEqual({
				success: false,
				errors: [
					{
						code: 6002,
						message:
							"A timeout was reached. Check gotoOptions/waitForSelector/waitForTimeout/actionTimeout options.",
						detail:
							"Waiting for selector `#never` failed: Waiting failed: 100ms exceeded",
					},
				],
			});

			const blocked = await quickAction("content", {
				url: origin,
				rejectRequestPattern: ["^http://localhost"],
			});
			expect(await blocked.json()).toEqual({
				success: false,
				errors: [
					{
						code: 5009,
						message: "Network error when attempting to load page",
						detail: `net::ERR_FAILED at ${origin}`,
					},
				],
			});

			const actionTimeout = await quickAction("content", {
				html: PAGE,
				waitForTimeout: 5_000,
				actionTimeout: 100,
			});
			expect(await actionTimeout.json()).toMatchObject({
				errors: [{ code: 6002, detail: "Request timed out" }],
			});
		});

		test("cacheTTL is accepted and ignored", async ({ expect }) => {
			const res = await quickAction("content", { html: PAGE, cacheTTL: -1 });
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({ success: true });
		});

		test("unknown actions and missing options reject the call", async ({
			expect,
		}) => {
			const unknown = await quickAction("crawl", { url: origin });
			expect(unknown.status).toBe(599);
			expect(await unknown.json()).toEqual({
				name: "Error",
				message: "Invalid quick action: crawl",
			});

			const missing = await call(["content"]);
			expect(await missing.json()).toEqual({
				name: "TypeError",
				message: "Cannot read properties of undefined (reading 'url')",
			});
		});

		test("the kitesurf browser rejects the call", async ({ expect }) => {
			const res = await quickAction("content", {
				html: PAGE,
				browser: "kitesurf",
			});
			expect(res.status).toBe(599);
			expect(await res.json()).toEqual({
				name: "Error",
				message:
					'The "kitesurf" browser is not supported in local development. Remove the `browser` option to use the local browser.',
			});
		});
	}
);
