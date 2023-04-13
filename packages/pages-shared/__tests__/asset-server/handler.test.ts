import {
	generateHandler,
	getResponseFromMatch,
} from "../../asset-server/handler";
import { createMetadataObject } from "../../metadata-generator/createMetadataObject";
import type { HandlerContext } from "../../asset-server/handler";
import type { Metadata } from "../../asset-server/metadata";
import type { RedirectRule } from "../../metadata-generator/types";

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
				.concat({
					status: 302,
					from: "/500",
					to: "/home",
				})
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
	});

	test("Match exact pathnames, before any HTML redirection", async () => {
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
				request: "/index.html",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/");
		}
		{
			const { response } = await getTestResponse({
				request: "/index",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toEqual("/");
		}
		{
			const { response } = await getTestResponse({
				request: "/",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home");
		}
		{
			// The redirect rule takes precedence to the 308s
			const { response } = await getTestResponse({
				request: "/page.html",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/elsewhere");
		}
		{
			// This serves the HTML even though the redirect rule is present
			const { response, spies } = await getTestResponse({
				request: "/page",
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
				request: "/?sort=price",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home?sort=price");
		}
		{
			const { response } = await getTestResponse({
				request: "/recent",
				metadata,
				findAssetEntryForPath,
			});
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toEqual("/home?sort=updated_at");
		}
		{
			const { response } = await getTestResponse({
				request: "/recent?other=query",
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
				request: "/blog/a-blog-posting",
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
				request: "/products/abba_562/tricycle/123abc@~!",
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
					request: "/home",
					metadata,
					findAssetEntryForPath,
				});
				expect(response.status).toBe(301);
				expect(response.headers.get("Location")).toEqual("/");
			}
			{
				const { response } = await getTestResponse({
					request: "/blog/post",
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
					request: "/foo",
					metadata,
					findAssetEntryForPath,
				});
				expect(response.status).toBe(301);
				expect(response.headers.get("Location")).toEqual("/bar");
			}
		});
	}

	test("Returns a redirect without duplicating the hash component", async () => {
		const { response, spies } = await getTestResponse({
			request: "https://foo.com/bar",
			metadata: createMetadataObjectWithRedirects([
				{ from: "/bar", to: "https://foobar.com/##heading-7", status: 301 },
			]),
		});

		expect(spies.fetchAsset).toBe(0);
		expect(spies.findAssetEntryForPath).toBe(0);
		expect(spies.getAssetKey).toBe(0);
		expect(spies.negotiateContent).toBe(0);
		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe(
			"https://foobar.com/##heading-7"
		);
	});

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

	test("getResponseFromMatch - same origin paths specified as root-relative", () => {
		const res = getResponseFromMatch(
			{
				to: "/bar",
				status: 301,
			},
			new URL("https://example.com/foo")
		);

		expect(res.status).toBe(301);
		expect(res.headers.get("Location")).toBe("/bar");
	});

	test("getResponseFromMatch - same origin paths specified as full URLs", () => {
		const res = getResponseFromMatch(
			{
				to: "https://example.com/bar",
				status: 301,
			},
			new URL("https://example.com/foo")
		);

		expect(res.status).toBe(301);
		expect(res.headers.get("Location")).toBe("/bar");
	});
});

test("getResponseFromMatch - different origins", () => {
	const res = getResponseFromMatch(
		{
			to: "https://bar.com/bar",
			status: 302,
		},
		new URL("https://example.com/foo")
	);

	expect(res.status).toBe(302);
	expect(res.headers.get("Location")).toBe("https://bar.com/bar");
});

interface HandlerSpies {
	fetchAsset: number;
	findAssetEntryForPath: number;
	getAssetKey: number;
	negotiateContent: number;
}

async function getTestResponse({
	request,
	metadata = createMetadataObject({
		redirects: {
			invalid: [],
			rules: [],
		},
	}) as Metadata,
	...options
}: {
	request: Request | string;
} & Omit<Partial<HandlerContext<string>>, "request">): Promise<{
	response: Response;
	spies: HandlerSpies;
}> {
	const spies: HandlerSpies = {
		fetchAsset: 0,
		findAssetEntryForPath: 0,
		getAssetKey: 0,
		negotiateContent: 0,
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
