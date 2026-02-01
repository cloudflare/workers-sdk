// eslint-disable-next-line workers-sdk/no-vitest-import-expect
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	CACHE_PRESERVATION_WRITE_FREQUENCY,
	generateHandler,
	isPreservationCacheResponseExpiring,
} from "../../asset-server/handler";
import { createMetadataObject } from "../../metadata-generator/createMetadataObject";
import type { HandlerContext } from "../../asset-server/handler";
import type { Metadata } from "../../asset-server/metadata";
import type { RedirectRule } from "@cloudflare/workers-shared/utils/configuration/types";

describe("asset-server handler", () => {
	test("Returns appropriate status codes", async () => {
		const statuses = [301, 302, 303, 307, 308];
		const metadata = createMetadataObjectWithRedirects(
			statuses
				.map((status) => ({
					status,
					from: `/${status}`,
					to: "/home",
				}))
				.concat(
					{
						status: 302,
						from: "/500",
						to: "/home",
					},
					{
						status: 200,
						from: "/200",
						to: "/proxied-file",
					}
				)
		);

		const tests = statuses.map(async (status) => {
			const { response } = await getTestResponse({
				request: "https://foo.com/" + status,
				metadata,
			});

			expect(response.status).toBe(status);
			expect(response.headers.get("Location")).toBe("/home");
		});

		await Promise.all(tests);

		const { response } = await getTestResponse({
			request: "https://foo.com/500",
			metadata,
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/home");

		const { response: proxyResponse } = await getTestResponse({
			request: "https://foo.com/200",
			metadata,
			findAssetEntryForPath: async (path: string) => {
				if (path === "/proxied-file.html") {
					return "proxied file";
				}
				return null;
			},
		});

		expect(proxyResponse.status).toBe(200);
		expect(proxyResponse.headers.get("Location")).toBeNull();
	});

	test("Won't redirect to protocol-less double-slashed URLs", async () => {
		const metadata = createMetadataObjectWithRedirects([
			{ from: "/", to: "/home", status: 301 },
			{ from: "/page.html", to: "/elsewhere", status: 301 },
		]);
		const findAssetEntryForPath = async (path: string) => {
			if (path === "/index.html") {
				return "index page";
			}

			if (path === "/page.html") {
				return "some page";
			}

			return null;
		};

		{
			const { response } = await getTestResponse({
				request: "https://example.com/%2Fwww.example.com/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/%5Cwww.example.com/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/%2Fwww.example.com/%2F/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com///");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/%09/www.example.com/%09/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/	/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/%5Cwww.example.com/%5C/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/\\/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/%2fwww.example.com/%2f/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com///");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/%5cwww.example.com/%5c/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/www.example.com/\\/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/foo/index/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/foo/");
		}
	});

	test("Match exact pathnames, before any HTML redirection", async () => {
		const metadata = createMetadataObjectWithRedirects([
			{ from: "/", to: "/home", status: 301 },
			{ from: "/page.html", to: "/elsewhere", status: 301 },
			{ from: "/protocol-less-test", to: "/%2fwww.example.com/", status: 308 },
		]);
		const findAssetEntryForPath = async (path: string) => {
			if (path === "/index.html") {
				return "index page";
			}

			if (path === "/page.html") {
				return "some page";
			}

			return null;
		};

		{
			const { response } = await getTestResponse({
				request: "https://example.com/index.html",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/index",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home");
		}
		{
			// The redirect rule takes precedence to the 308s
			const { response } = await getTestResponse({
				request: "https://example.com/page.html",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/elsewhere");
		}
		{
			// The redirect rule takes precedence to the 308s
			const { response } = await getTestResponse({
				request: "https://example.com/protocol-less-test",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/%2fwww.example.com/");
		}
		{
			// This serves the HTML even though the redirect rule is present
			const { response, spies } = await getTestResponse({
				request: "https://example.com/page",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(200);
			expect(spies.fetchAsset).toBe(1);
		}
	});

	test("cross-host static redirects still are executed with line number precedence", async () => {
		const metadata = createMetadataObjectWithRedirects([
			{ from: "https://fakehost/home", to: "https://firsthost/", status: 302 },
			{ from: "/home", to: "https://secondhost/", status: 302 },
		]);
		const findAssetEntryForPath = async (path: string) => {
			if (path === "/index.html") {
				return "index page";
			}

			return null;
		};

		{
			const { response } = await getTestResponse({
				request: "https://yetanotherhost/home",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toEqual("https://secondhost/");
		}
		{
			const { response } = await getTestResponse({
				request: "https://fakehost/home",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toEqual("https://firsthost/");
		}
	});

	test("it should preserve querystrings unless to rule includes them", async () => {
		const metadata = createMetadataObjectWithRedirects([
			{ from: "/", status: 301, to: "/home" },
			{ from: "/recent", status: 301, to: "/home?sort=updated_at" },
		]);
		const findAssetEntryForPath = async (path: string) => {
			if (path === "/home.html") {
				return "home page";
			}

			return null;
		};

		{
			const { response } = await getTestResponse({
				request: "https://example.com/?sort=price",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home?sort=price");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/recent",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home?sort=updated_at");
		}
		{
			const { response } = await getTestResponse({
				request: "https://example.com/recent?other=query",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home?sort=updated_at");
		}
	});

	{
		const metadata = createMetadataObjectWithRedirects([
			{ from: "/home", status: 301, to: "/" },
			{ from: "/blog/*", status: 301, to: "https://blog.example.com/:splat" },
			{
				from: "/products/:code/:name/*",
				status: 301,
				to: "/products?junk=:splat&name=:name&code=:code",
			},
			{ from: "/foo", status: 301, to: "/bar" },
		]);
		const findAssetEntryForPath = async (path: string) => {
			if (path === "/home.html") {
				return "home page";
			}

			return null;
		};

		test("it should perform splat replacements", async () => {
			const { response } = await getTestResponse({
				request: "https://example.com/blog/a-blog-posting",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual(
				"https://blog.example.com/a-blog-posting"
			);
		});

		test("it should perform placeholder replacements", async () => {
			const { response } = await getTestResponse({
				request: "https://example.com/products/abba_562/tricycle/123abc@~!",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual(
				"/products?junk=123abc@~!&name=tricycle&code=abba_562"
			);
		});

		test("it should redirect both dynamic and static redirects", async () => {
			{
				const { response } = await getTestResponse({
					request: "https://example.com/home",
					metadata,
					findAssetEntryForPath,
				});
				expect(response.status).toBe(301);
				expect(response.headers.get("Location")).toEqual("/");
			}
			{
				const { response } = await getTestResponse({
					request: "https://example.com/blog/post",
					metadata,
					findAssetEntryForPath,
				});
				expect(response.status).toBe(301);
				expect(response.headers.get("Location")).toEqual(
					"https://blog.example.com/post"
				);
			}
			{
				const { response } = await getTestResponse({
					request: "https://example.com/foo",
					metadata,
					findAssetEntryForPath,
				});
				expect(response.status).toBe(301);
				expect(response.headers.get("Location")).toEqual("/bar");
			}
		});
	}

	// 	test("getResponseFromMatch - same origin paths specified as root-relative", () => {
	// 		const res = getResponseFromMatch(
	// 			{
	// 				to: "/bar",
	// 				status: 301,
	// 			},
	// 			new URL("https://example.com/foo")
	// 		);

	// 		expect(res.status).toBe(301);
	// 		expect(res.headers.get("Location")).toBe("/bar");
	// 	});

	// 	test("getResponseFromMatch - same origin paths specified as full URLs", () => {
	// 		const res = getResponseFromMatch(
	// 			{
	// 				to: "https://example.com/bar",
	// 				status: 301,
	// 			},
	// 			new URL("https://example.com/foo")
	// 		);

	// 		expect(res.status).toBe(301);
	// 		expect(res.headers.get("Location")).toBe("/bar");
	// 	});
	// });

	// test("getResponseFromMatch - different origins", () => {
	// 	const res = getResponseFromMatch(
	// 		{
	// 			to: "https://bar.com/bar",
	// 			status: 302,
	// 		},
	// 		new URL("https://example.com/foo")
	// 	);

	// 	expect(res.status).toBe(302);
	// 	expect(res.headers.get("Location")).toBe("https://bar.com/bar");

	test("early hints should cache link headers", async () => {
		const deploymentId = "deployment-" + Math.random();
		const metadata = createMetadataObject({ deploymentId }) as Metadata;

		const findAssetEntryForPath = async (path: string) => {
			if (path === "/index.html") {
				return "asset-key-index.html";
			}

			return null;
		};
		const fetchAsset = () =>
			Promise.resolve(
				Object.assign(
					new Response(`
					<!DOCTYPE html>
					<html>
						<body>
							<link rel="preload" as="image" href="/a.png" />
							<link rel="preload" as="image" href="/b.png" />
							<link rel="modulepreload" href="lib.js" />
							<link rel="preconnect" href="cloudflare.com" />
						</body>
					</html>`),
					{ contentType: "text/html" }
				)
			);

		const getResponse = async () =>
			getTestResponse({
				request: new Request("https://example.com/"),
				metadata,
				findAssetEntryForPath,
				caches,
				fetchAsset,
			});

		const { response, spies } = await getResponse();
		expect(response.status).toBe(200);
		// waitUntil should be called twice: once for asset-preservation, once for early hints
		expect(spies.waitUntil.length).toBe(2);

		await Promise.all(spies.waitUntil);

		const earlyHintsCache = await caches.open(`eh:${deploymentId}`);
		const earlyHintsRes = await earlyHintsCache.match(
			"https://example.com/asset-key-index.html"
		);

		if (!earlyHintsRes) {
			throw new Error(
				"Did not match early hints cache on https://example.com/asset-key-index.html"
			);
		}

		expect(earlyHintsRes.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel="preload"; as=image, </b.png>; rel="preload"; as=image, <lib.js>; rel="modulepreload", <cloudflare.com>; rel="preconnect""`
		);
		expect(response.headers.get("link")).toBeNull();

		// Do it again, but this time ensure that we didn't write to cache again
		const { response: response2, spies: spies2 } = await getResponse();

		expect(response2.status).toBe(200);
		// waitUntil should only be called for asset-preservation
		expect(spies2.waitUntil.length).toBe(1);

		await Promise.all(spies2.waitUntil);

		const earlyHintsRes2 = await earlyHintsCache.match(
			"https://example.com/asset-key-index.html"
		);

		if (!earlyHintsRes2) {
			throw new Error(
				"Did not match early hints cache on https://example.com/asset-key-index.html"
			);
		}

		expect(earlyHintsRes2.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel="preload"; as=image, </b.png>; rel="preload"; as=image, <lib.js>; rel="modulepreload", <cloudflare.com>; rel="preconnect""`
		);
		expect(response2.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel="preload"; as=image, </b.png>; rel="preload"; as=image, <lib.js>; rel="modulepreload", <cloudflare.com>; rel="preconnect""`
		);

		// Now make sure that requests for other paths which resolve to the same asset share the EH cache result
		const { response: response3, spies: spies3 } = await getTestResponse({
			request: new Request("https://example.com/foo"),
			metadata,
			findAssetEntryForPath,
			caches,
			fetchAsset,
		});

		expect(response3.status).toBe(200);
		// waitUntil should not be called at all (SPA)
		expect(spies3.waitUntil.length).toBe(0);

		await Promise.all(spies3.waitUntil);

		const earlyHintsRes3 = await earlyHintsCache.match(
			"https://example.com/asset-key-index.html"
		);

		if (!earlyHintsRes3) {
			throw new Error(
				"Did not match early hints cache on https://example.com/asset-key-index.html"
			);
		}

		expect(earlyHintsRes3.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel="preload"; as=image, </b.png>; rel="preload"; as=image, <lib.js>; rel="modulepreload", <cloudflare.com>; rel="preconnect""`
		);
		expect(response3.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel="preload"; as=image, </b.png>; rel="preload"; as=image, <lib.js>; rel="modulepreload", <cloudflare.com>; rel="preconnect""`
		);
	});

	test("early hints should cache empty link headers", async () => {
		const deploymentId = "deployment-" + Math.random();
		const metadata = createMetadataObject({ deploymentId }) as Metadata;

		const findAssetEntryForPath = async (path: string) => {
			if (path === "/index.html") {
				return "asset-key-index.html";
			}

			return null;
		};

		const getResponse = async () =>
			getTestResponse({
				request: new Request("https://example.com/"),
				metadata,
				findAssetEntryForPath,
				caches,
				fetchAsset: () =>
					Promise.resolve(
						Object.assign(
							new Response(`
							<!DOCTYPE html>
							<html>
								<body>
									<h1>I'm a teapot</h1>
								</body>
							</html>`),
							{ contentType: "text/html" }
						)
					),
			});

		const { response, spies } = await getResponse();
		expect(response.status).toBe(200);
		// waitUntil should be called twice: once for asset-preservation, once for early hints
		expect(spies.waitUntil.length).toBe(2);

		await Promise.all(spies.waitUntil);

		const earlyHintsCache = await caches.open(`eh:${deploymentId}`);
		const earlyHintsRes = await earlyHintsCache.match(
			"https://example.com/asset-key-index.html"
		);

		if (!earlyHintsRes) {
			throw new Error(
				"Did not match early hints cache on https://example.com/asset-key-index.html"
			);
		}

		expect(earlyHintsRes.headers.get("link")).toBeNull();
		expect(response.headers.get("link")).toBeNull();

		// Do it again, but this time ensure that we didn't write to cache again
		const { response: response2, spies: spies2 } = await getResponse();

		expect(response2.status).toBe(200);
		// waitUntil should only be called for asset-preservation
		expect(spies2.waitUntil.length).toBe(1);

		await Promise.all(spies2.waitUntil);

		const earlyHintsRes2 = await earlyHintsCache.match(
			"https://example.com/asset-key-index.html"
		);

		if (!earlyHintsRes2) {
			throw new Error(
				"Did not match early hints cache on https://example.com/asset-key-index.html"
			);
		}

		expect(earlyHintsRes2.headers.get("link")).toBeNull();
		expect(response2.headers.get("link")).toBeNull();
	});

	test.todo(
		"early hints should temporarily cache failures to parse links",
		async () => {
			// I couldn't figure out a way to make HTMLRewriter error out
		}
	);

	describe("should serve deleted assets from preservation cache", async () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test("preservationCacheV2", async () => {
			const deploymentId = "deployment-" + Math.random();
			const metadata = createMetadataObject({ deploymentId }) as Metadata;

			let findAssetEntryForPath = async (path: string) => {
				if (path === "/foo.html") {
					return "asset-key-foo.html";
				}
				return null;
			};
			const { response, spies } = await getTestResponse({
				request: new Request("https://example.com/foo"),
				metadata,
				findAssetEntryForPath,
				caches,
				fetchAsset: () =>
					Promise.resolve(Object.assign(new Response("hello world!"))),
			});
			expect(response.status).toBe(200);
			expect(await response.text()).toMatchInlineSnapshot('"hello world!"');
			const expectedHeaders = {
				"access-control-allow-origin": "*",
				"cache-control": "public, max-age=0, must-revalidate",
				"content-type": "undefined",
				etag: '"asset-key-foo.html"',
				"referrer-policy": "strict-origin-when-cross-origin",
				"x-content-type-options": "nosniff",
				"x-server-env": "dev",
			};
			expect(Object.fromEntries(response.headers)).toStrictEqual(
				expectedHeaders
			);
			// waitUntil should be called for asset-preservation,
			expect(spies.waitUntil.length).toBe(1);

			await Promise.all(spies.waitUntil);

			const preservationCacheV2 = await caches.open("assetPreservationCacheV2");
			const preservationRes = await preservationCacheV2.match(
				"https://example.com/foo"
			);

			if (!preservationRes) {
				throw new Error(
					"Did not match preservation cache on https://example.com/foo"
				);
			}

			expect(await preservationRes.text()).toMatchInlineSnapshot(
				'"asset-key-foo.html"'
			);

			// Delete the asset from the manifest and ensure it's served from preservation cache with a 304 when if-none-match is present
			findAssetEntryForPath = async (_path: string) => {
				return null;
			};
			const { response: response2 } = await getTestResponse({
				request: new Request("https://example.com/foo", {
					headers: { "if-none-match": expectedHeaders.etag },
				}),
				metadata,
				findAssetEntryForPath,
				caches,
				fetchAsset: () =>
					Promise.resolve(Object.assign(new Response("hello world!"))),
			});
			expect(response2.status).toBe(304);
			expect(await response2.text()).toMatchInlineSnapshot('""');

			// Ensure the asset is served from preservation cache with a 200 if if-none-match is not present
			const { response: response3 } = await getTestResponse({
				request: new Request("https://example.com/foo"),
				metadata,
				findAssetEntryForPath,
				caches,
				fetchAsset: () =>
					Promise.resolve(Object.assign(new Response("hello world!"))),
			});
			expect(response3.status).toBe(200);
			expect(await response3.text()).toMatchInlineSnapshot('"hello world!"');
			// Cached responses have the same headers with a few changes/additions:
			expect(Object.fromEntries(response3.headers)).toMatchObject({
				...expectedHeaders,
				"cache-control": "public, s-maxage=604800",
				"x-robots-tag": "noindex",
				"cf-cache-status": "HIT", // new header
			});

			// Serve with a fresh cache and ensure we don't get a response
			const { response: response4 } = await getTestResponse({
				request: new Request("https://example.com/foo"),
				metadata,
				findAssetEntryForPath,
				fetchAsset: () =>
					Promise.resolve(Object.assign(new Response("hello world!"))),
				// @ts-expect-error Create a dummy fake cache to simulate a fresh cache
				caches: {
					open(cacheName) {
						return caches.open("fresh" + cacheName);
					},
				},
			});

			expect(response4.status).toBe(404);
			expect(Object.fromEntries(response4.headers)).toMatchInlineSnapshot(`
				{
				  "access-control-allow-origin": "*",
				  "cache-control": "no-store",
				  "referrer-policy": "strict-origin-when-cross-origin",
				}
			`);
		});
	});

	describe("isPreservationCacheResponseExpiring()", async () => {
		test("no age header", async () => {
			const res = new Response(null);
			expect(isPreservationCacheResponseExpiring(res)).toBe(false);
		});

		test("empty age header", async () => {
			const res = new Response(null, {
				headers: { age: "" },
			});
			expect(isPreservationCacheResponseExpiring(res)).toBe(false);
		});

		test("unparsable age header", async () => {
			const res = new Response(null, {
				headers: { age: "not-a-number" },
			});
			expect(isPreservationCacheResponseExpiring(res)).toBe(false);
		});

		test("below write frequency", async () => {
			const res = new Response(null, {
				headers: { age: "0" },
			});
			expect(isPreservationCacheResponseExpiring(res)).toBe(false);

			const res2 = new Response(null, {
				headers: { age: "5" },
			});
			expect(isPreservationCacheResponseExpiring(res2)).toBe(false);

			// At the max age (without jitter)
			const res3 = new Response(null, {
				headers: { age: CACHE_PRESERVATION_WRITE_FREQUENCY.toString() },
			});
			expect(isPreservationCacheResponseExpiring(res3)).toBe(false);
		});

		test("above write frequency + jitter", async () => {
			const res = new Response(null, {
				headers: {
					age: (CACHE_PRESERVATION_WRITE_FREQUENCY + 43_200 + 1).toString(),
				},
			});
			expect(isPreservationCacheResponseExpiring(res)).toBe(true);
		});
	});

	describe("internal asset error doesn't set headers", async () => {
		const metadata = createMetadataObject({
			deploymentId: "mock-deployment-id",
			headers: {
				invalid: [],
				rules: [
					{
						path: "/*",
						headers: { "x-unwanted-header": "foo" },
						unsetHeaders: [],
					},
				],
			},
			redirects: {
				invalid: [],
				rules: [
					{
						from: "/here",
						to: "/there",
						status: 301,
						lineNumber: 1,
					},
				],
			},
		}) as Metadata;

		const findAssetEntryForPath = async (path: string) =>
			path.startsWith("/asset") ? "some-asset" : null;

		test("500 skips headers", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/asset",
				metadata,
				fetchAsset: async () => {
					throw "uh oh";
				},
				findAssetEntryForPath: findAssetEntryForPath,
			});

			expect(response.status).toBe(500);
			expect(Object.fromEntries(response.headers)).not.toHaveProperty(
				"x-unwanted-header"
			);
		});

		test("404 doesn't skip headers", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/404",
				metadata,
				findAssetEntryForPath: findAssetEntryForPath,
			});

			expect(response.status).toBe(404);
			expect(Object.fromEntries(response.headers)).toHaveProperty(
				"x-unwanted-header"
			);
		});

		test("301 doesn't skip headers", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/here",
				metadata,
				findAssetEntryForPath: findAssetEntryForPath,
			});

			expect(response.status).toBe(301);
			expect(Object.fromEntries(response.headers)).toHaveProperty(
				"x-unwanted-header"
			);
		});
	});

	describe("404 responses from our asset serving should not cache", () => {
		const metadata = createMetadataObject({
			deploymentId: "mock-deployment-id",
			headers: {
				invalid: [],
				rules: [
					{
						path: "/*",
						headers: { "cache-control": "public, max-age=604800" },
						unsetHeaders: [],
					},
				],
			},
		}) as Metadata;

		const findAssetEntryForPath = async (path: string) => {
			if (path.startsWith("/asset")) {
				return "some-asset";
			}
			return null;
		};

		test("404 adds cache-control: no-store", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/404",
				metadata: createMetadataObject({
					deploymentId: "mock-deployment-id",
				}) as Metadata,
				findAssetEntryForPath: findAssetEntryForPath,
			});

			expect(response.status).toBe(404);
			expect(Object.fromEntries(response.headers)).toEqual(
				expect.objectContaining({
					"cache-control": "no-store",
				})
			);
		});

		test("404 removes user-controlled cache-control", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/404",
				metadata,
				findAssetEntryForPath: findAssetEntryForPath,
			});

			expect(response.status).toBe(404);
			expect(Object.fromEntries(response.headers)).toEqual(
				expect.objectContaining({
					"cache-control": "no-store",
				})
			);
		});

		test("200 continues having the user's cache-control header", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/asset",
				metadata,
				findAssetEntryForPath: findAssetEntryForPath,
			});

			expect(response.status).toBe(200);
			expect(Object.fromEntries(response.headers)).toEqual(
				expect.objectContaining({
					"cache-control": "public, max-age=604800",
				})
			);
		});
	});

	describe("redirects", () => {
		test("it should redirect uri-encoded paths", async () => {
			const { response, spies } = await getTestResponse({
				request: "https://foo.com/some%20page",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/some%20page", to: "/home", status: 301 },
				]),
			});

			expect(spies.fetchAsset).toBe(0);
			expect(spies.findAssetEntryForPath).toBe(0);
			expect(spies.getAssetKey).toBe(0);
			expect(spies.negotiateContent).toBe(0);
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe("/home");
		});

		test("redirects to a query string same-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "/?test=abc", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe("/?test=abc");
		});

		test("redirects to a query string cross-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "https://foobar.com/?test=abc", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe(
				"https://foobar.com/?test=abc"
			);
		});

		test("redirects to hash component same-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "https://foo.com/##heading-7", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe("/##heading-7");
		});

		test("redirects to hash component cross-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "https://foobar.com/##heading-7", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe(
				"https://foobar.com/##heading-7"
			);
		});

		test("redirects to a query string and hash same-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "/?test=abc#def", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe("/?test=abc#def");
		});

		test("redirects to a query string and hash cross-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "https://foobar.com/?test=abc#def", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe(
				"https://foobar.com/?test=abc#def"
			);
		});

		// Query strings must be before the hash to be considered query strings
		// https://www.rfc-editor.org/rfc/rfc3986#section-4.1
		// Behaviour in Chrome is that the .hash is "#def?test=abc" and .search is ""
		test("redirects to a query string and hash against rfc", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "https://foobar.com/#def?test=abc", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe(
				"https://foobar.com/#def?test=abc"
			);
		});

		// Query string needs to be _before_ the hash
		test("redirects to a hash with an incoming query cross-origin", async () => {
			const { response } = await getTestResponse({
				request: "https://foo.com/bar?test=abc",
				metadata: createMetadataObjectWithRedirects([
					{ from: "/bar", to: "https://foobar.com/#heading", status: 301 },
				]),
			});

			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe(
				"https://foobar.com/?test=abc#heading"
			);
		});
	});

	const findIndexHtmlAssetEntryForPath = async (path: string) => {
		if (path === "/index.html") {
			return "asset-key-index.html";
		}
		return null;
	};

	const fetchHtmlAsset = () =>
		Promise.resolve(
			Object.assign(
				new Response(`
				<!DOCTYPE html>
				<html>
					<body>
						<h1>Hello World</h1>
					</body>
				</html>
			`),
				{ contentType: "text/html" }
			)
		);

	const fetchHtmlAssetWithoutBody = () =>
		Promise.resolve(
			Object.assign(
				new Response(`
				<!DOCTYPE html>
				<html>
					<head>
						<title>No Body</title>
					</head>
				</html>
			`),
				{ contentType: "text/html" }
			)
		);

	const findStyleCssAssetEntryForPath = async (path: string) =>
		path === "/style.css" ? "asset-key-style.css" : null;

	const fetchCssAsset = () =>
		Promise.resolve(
			Object.assign(
				new Response(`
				body {
					font-family: Arial, sans-serif;
					color: #333;
				}
			`),
				{ contentType: "text/css" }
			)
		);

	test("should emit header when Web Analytics Token is injected", async () => {
		const { response } = await getTestResponse({
			request: "https://example.com/",
			metadata: createMetadataObject({
				deploymentId: "mock-deployment-id",
				webAnalyticsToken: "test-analytics-token",
			}) as Metadata,
			findAssetEntryForPath: findIndexHtmlAssetEntryForPath,
			fetchAsset: fetchHtmlAsset,
			xWebAnalyticsHeader: true,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-cf-pages-analytics")).toBe("1");

		const responseText = await response.text();
		expect(responseText).toContain(
			'data-cf-beacon=\'{"token": "test-analytics-token"}\''
		);
	});

	test("should not emit header when Web Analytics Token is not configured", async () => {
		const { response } = await getTestResponse({
			request: "https://example.com/",
			metadata: createMetadataObject({
				deploymentId: "mock-deployment-id",
			}) as Metadata,
			findAssetEntryForPath: findIndexHtmlAssetEntryForPath,
			fetchAsset: fetchHtmlAsset,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-cf-pages-analytics")).toBeNull();

		const responseText = await response.text();
		expect(responseText).not.toContain("data-cf-beacon");
	});

	test("should emit header for HTML without <body> element but not inject script", async () => {
		const { response } = await getTestResponse({
			request: "https://example.com/",
			metadata: createMetadataObject({
				deploymentId: "mock-deployment-id",
				webAnalyticsToken: "test-analytics-token",
			}) as Metadata,
			findAssetEntryForPath: findIndexHtmlAssetEntryForPath,
			fetchAsset: fetchHtmlAssetWithoutBody,
			xWebAnalyticsHeader: true,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-cf-pages-analytics")).toBe("1");

		const responseText = await response.text();
		expect(responseText).not.toContain("data-cf-beacon");
		expect(responseText).toContain("<title>No Body</title>");
	});

	test("should not emit header for non-HTML responses", async () => {
		const { response } = await getTestResponse({
			request: "https://example.com/style.css",
			metadata: createMetadataObject({
				deploymentId: "mock-deployment-id",
				webAnalyticsToken: "test-analytics-token",
			}) as Metadata,
			findAssetEntryForPath: findStyleCssAssetEntryForPath,
			fetchAsset: fetchCssAsset,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-cf-pages-analytics")).toBeNull();
		expect(response.headers.get("content-type")).toBe("text/css");

		const responseText = await response.text();
		expect(responseText).not.toContain("data-cf-beacon");
		expect(responseText).toContain("font-family: Arial");
	});

	test("should not emit header when xWebAnalyticsHeader is false", async () => {
		const { response } = await getTestResponse({
			request: "https://example.com/",
			metadata: createMetadataObject({
				deploymentId: "mock-deployment-id",
				webAnalyticsToken: "test-analytics-token",
			}) as Metadata,
			findAssetEntryForPath: findIndexHtmlAssetEntryForPath,
			fetchAsset: fetchHtmlAsset,
			xWebAnalyticsHeader: false,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-cf-pages-analytics")).toBeNull();

		const responseText = await response.text();
		expect(responseText).toContain(
			'data-cf-beacon=\'{"token": "test-analytics-token"}\''
		);
	});

	test("should not emit header when xWebAnalyticsHeader is undefined", async () => {
		const { response } = await getTestResponse({
			request: "https://example.com/",
			metadata: createMetadataObject({
				deploymentId: "mock-deployment-id",
				webAnalyticsToken: "test-analytics-token",
			}) as Metadata,
			findAssetEntryForPath: findIndexHtmlAssetEntryForPath,
			fetchAsset: fetchHtmlAsset,
			xWebAnalyticsHeader: undefined,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-cf-pages-analytics")).toBeNull();

		const responseText = await response.text();
		expect(responseText).toContain(
			'data-cf-beacon=\'{"token": "test-analytics-token"}\''
		);
	});
});

interface HandlerSpies {
	fetchAsset: number;
	findAssetEntryForPath: number;
	getAssetKey: number;
	negotiateContent: number;
	waitUntil: Promise<unknown>[];
}

async function getTestResponse({
	request,
	metadata = createMetadataObject({
		deploymentId: "mock-deployment-id",
		redirects: {
			invalid: [],
			rules: [],
		},
	}) as Metadata,
	...options
}: {
	request: Request | string;
} & Omit<
	Partial<
		HandlerContext<
			string,
			{
				encoding: string | null;
			},
			{
				body: ReadableStream | null;
				contentType: string;
			}
		>
	>,
	"request"
>): Promise<{
	response: Response;
	spies: HandlerSpies;
}> {
	const spies: HandlerSpies = {
		fetchAsset: 0,
		findAssetEntryForPath: 0,
		getAssetKey: 0,
		negotiateContent: 0,
		waitUntil: [],
	};

	const response = await generateHandler<string>({
		request: request instanceof Request ? request : new Request(request),
		metadata,
		xServerEnvHeader: "dev",
		xWebAnalyticsHeader: options.xWebAnalyticsHeader,
		logError: console.error,
		findAssetEntryForPath: async (...args) => {
			spies.findAssetEntryForPath++;
			return options.findAssetEntryForPath?.(...args) ?? null;
		},
		getAssetKey: (assetEntry, content) => {
			spies.getAssetKey++;
			return options.getAssetKey?.(assetEntry, content) ?? assetEntry;
		},
		negotiateContent: (...args) => {
			spies.negotiateContent++;
			return options.negotiateContent?.(...args) ?? { encoding: null };
		},
		fetchAsset: async (...args) => {
			spies.fetchAsset++;
			return (
				options.fetchAsset?.(...args) ?? {
					body: null,
					contentType: "text/plain",
				}
			);
		},
		waitUntil: async (promise: Promise<unknown>) => {
			spies.waitUntil.push(promise);
		},
		caches: options.caches ?? caches,
	});

	return { response, spies };
}

function createMetadataObjectWithRedirects(
	rules: Pick<RedirectRule, "from" | "to" | "status">[]
): Metadata {
	return createMetadataObject({
		redirects: {
			invalid: [],
			rules: rules.map((rule, i) => ({ ...rule, lineNumber: i + 1 })),
		},
	}) as Metadata;
}
