import { Cache } from "@miniflare/cache";
import { MemoryStorage } from "@miniflare/storage-memory";
import { describe, expect, test } from "vitest";
import { generateHandler } from "../../asset-server/handler";
import { createMetadataObject } from "../../metadata-generator/createMetadataObject";
import type { HandlerContext } from "../../asset-server/handler";
import type { Metadata } from "../../asset-server/metadata";
import type { RedirectRule } from "../../metadata-generator/types";
import type { Cache as WorkersCache } from "@cloudflare/workers-types/experimental";

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

	// test("Returns a redirect without duplicating the hash component", async () => {
	// 	const { response, spies } = await getTestResponse({
	// 		request: "https://foo.com/bar",
	// 		metadata: createMetadataObjectWithRedirects([
	// 			{ from: "/bar", to: "https://foobar.com/##heading-7", status: 301 },
	// 		]),
	// 	});

	// 	expect(spies.fetchAsset).toBe(0);
	// 	expect(spies.findAssetEntryForPath).toBe(0);
	// 	expect(spies.getAssetKey).toBe(0);
	// 	expect(spies.negotiateContent).toBe(0);
	// 	expect(response.status).toBe(301);
	// 	expect(response.headers.get("Location")).toBe(
	// 		"https://foobar.com/##heading-7"
	// 	);
	// });

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
				return "index.html";
			}

			return null;
		};

		// Create cache storage to reuse between requests
		const { caches, cacheSpy } = createCacheStorage();

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
									<link rel="preload" as="image" href="/a.png" />
									<link rel="preload" as="image" href="/b.png" />
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

		const earlyHintsCache = cacheSpy[`eh:${deploymentId}`];
		const earlyHintsRes = await earlyHintsCache.match("https://example.com/");

		if (!earlyHintsRes) {
			throw new Error(
				"Did not match early hints cache on https://example.com/"
			);
		}

		expect(earlyHintsRes.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel=\\"preload\\"; as=image, </b.png>; rel=\\"preload\\"; as=image"`
		);

		// Do it again, but this time ensure that we didn't write to cache again
		const { response: response2, spies: spies2 } = await getResponse();

		expect(response2.status).toBe(200);
		// waitUntil should only be called for asset-preservation
		expect(spies2.waitUntil.length).toBe(1);

		await Promise.all(spies2.waitUntil);

		const earlyHintsRes2 = await earlyHintsCache.match("https://example.com/");

		if (!earlyHintsRes2) {
			throw new Error(
				"Did not match early hints cache on https://example.com/"
			);
		}

		expect(earlyHintsRes2.headers.get("link")).toMatchInlineSnapshot(
			`"</a.png>; rel=\\"preload\\"; as=image, </b.png>; rel=\\"preload\\"; as=image"`
		);
	});
});

interface HandlerSpies {
	fetchAsset: number;
	findAssetEntryForPath: number;
	getAssetKey: number;
	negotiateContent: number;
	waitUntil: Promise<unknown>[];
	caches: {
		[key: string]: WorkersCache;
	} & { default: WorkersCache };
}

function createMemoryCache(): WorkersCache {
	// Miniflare RequestInit is missing CfProperties so we need to cast
	return new Cache(new MemoryStorage()) as unknown as WorkersCache;
}

function createCacheStorage(): {
	caches: CacheStorage;
	cacheSpy: {
		[key: string]: WorkersCache;
	} & { default: WorkersCache };
} {
	const cacheSpy: { [key: string]: WorkersCache } & {
		default: WorkersCache;
	} = {
		default: createMemoryCache(),
	};
	const caches = {
		open(cacheName: string): Promise<WorkersCache> {
			if (cacheSpy[cacheName]) {
				return Promise.resolve(cacheSpy[cacheName]);
			}
			const cache = createMemoryCache();
			cacheSpy[cacheName] = cache;
			return Promise.resolve(cache);
		},
		default: cacheSpy.default,
	};
	return { caches, cacheSpy };
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
		caches: {
			default: createMemoryCache(),
		},
	};

	const response = await generateHandler<string>({
		request: request instanceof Request ? request : new Request(request),
		metadata,
		xServerEnvHeader: "dev",
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
		caches: options.caches ?? {
			open(cacheName) {
				const cache = createMemoryCache();
				spies.caches[cacheName] = cache;
				return Promise.resolve(cache);
			},
			...spies.caches,
		},
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
