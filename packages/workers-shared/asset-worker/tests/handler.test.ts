import { vi } from "vitest";
import { mockJaegerBinding } from "../../utils/tracing";
import { applyConfigurationDefaults } from "../src/configuration";
import { canFetch, handleRequest } from "../src/handler";
import type { AssetConfig } from "../../utils/types";

const mockEnv = {
	JAEGER: mockJaegerBinding(),
};

describe("[Asset Worker] `handleRequest`", () => {
	it("attaches ETag headers to responses", async () => {
		const configuration: AssetConfig = applyConfigurationDefaults({
			html_handling: "none",
			not_found_handling: "none",
		});
		const eTag = "some-etag";
		const exists = vi.fn().mockReturnValue(eTag);
		const getByETag = vi.fn().mockReturnValue({
			readableStream: new ReadableStream(),
			contentType: "text/html",
		});

		const response = await handleRequest(
			new Request("https://example.com/"),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			configuration,
			exists,
			getByETag
		);

		expect(response.headers.get("ETag")).toBe(`"${eTag}"`);
	});

	it("returns 304 Not Modified responses for a valid strong ETag in If-None-Match", async () => {
		const configuration: AssetConfig = applyConfigurationDefaults({
			html_handling: "none",
			not_found_handling: "none",
		});
		const eTag = "some-etag";
		const exists = vi.fn().mockReturnValue(eTag);
		const getByETag = vi.fn().mockReturnValue({
			readableStream: new ReadableStream(),
			contentType: "text/html",
		});

		const response = await handleRequest(
			new Request("https://example.com/", {
				headers: { "If-None-Match": `"${eTag}"` },
			}),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			configuration,
			exists,
			getByETag
		);

		expect(response.status).toBe(304);
	});

	it("returns 304 Not Modified responses for a valid weak ETag in If-None-Match", async () => {
		const configuration: AssetConfig = applyConfigurationDefaults({
			html_handling: "none",
			not_found_handling: "none",
		});
		const eTag = "some-etag";
		const exists = vi.fn().mockReturnValue(eTag);
		const getByETag = vi.fn().mockReturnValue({
			readableStream: new ReadableStream(),
			contentType: "text/html",
		});

		const response = await handleRequest(
			new Request("https://example.com/", {
				headers: { "If-None-Match": `W/"${eTag}"` },
			}),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			configuration,
			exists,
			getByETag
		);

		expect(response.status).toBe(304);
	});

	it("returns 200 OK responses for an invalid ETag in If-None-Match", async () => {
		const configuration: AssetConfig = applyConfigurationDefaults({
			html_handling: "none",
			not_found_handling: "none",
		});
		const eTag = "some-etag";
		const exists = vi.fn().mockReturnValue(eTag);
		const getByETag = vi.fn().mockReturnValue({
			readableStream: new ReadableStream(),
			contentType: "text/html",
		});

		const response = await handleRequest(
			new Request("https://example.com/", {
				headers: { "If-None-Match": "a fake etag!" },
			}),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			configuration,
			exists,
			getByETag
		);

		expect(response.status).toBe(200);
	});

	it("cannot fetch assets outside of configured path", async () => {
		const assets: Record<string, string> = {
			"/blog/test.html": "aaaaaaaaaa",
			"/blog/index.html": "bbbbbbbbbb",
			"/index.html": "cccccccccc",
			"/test.html": "dddddddddd",
		};

		// Attempt to path traverse down to the root /test within asset-server
		let response = await handleRequest(
			new Request("https://example.com/blog/../test"),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			applyConfigurationDefaults({}),
			async (pathname: string) => {
				if (pathname.startsWith("/blog/")) {
					// our route
					return assets[pathname] ?? null;
				} else {
					return null;
				}
			},
			async (_: string) => ({
				readableStream: new ReadableStream(),
				contentType: "text/html",
			})
		);

		expect(response.status).toBe(404);

		// Attempt to path traverse down to the root /test within asset-server
		response = await handleRequest(
			new Request("https://example.com/blog/%2E%2E/test"),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			applyConfigurationDefaults({}),
			async (pathname: string) => {
				if (pathname.startsWith("/blog/")) {
					// our route
					return assets[pathname] ?? null;
				} else {
					return null;
				}
			},
			async (_: string) => ({
				readableStream: new ReadableStream(),
				contentType: "text/html",
			})
		);

		expect(response.status).toBe(404);
	});

	it("returns expected responses for malformed path", async () => {
		const assets: Record<string, string> = {
			"/index.html": "aaaaaaaaaa",
			"/%A0%A0.html": "bbbbbbbbbb",
		};
		const configuration: AssetConfig = applyConfigurationDefaults({
			html_handling: "drop-trailing-slash",
			not_found_handling: "none",
		});

		const exists = async (pathname: string) => {
			return assets[pathname] ?? null;
		};
		const getByEtag = async (_: string) => ({
			readableStream: new ReadableStream(),
			contentType: "text/html",
		});

		// first malformed URL should return 404 as no match above
		const response = await handleRequest(
			new Request("https://example.com/%A0"),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			configuration,
			exists,
			getByEtag
		);
		expect(response.status).toBe(404);

		// but second malformed URL should return 307 as it matches and then redirects
		const response2 = await handleRequest(
			new Request("https://example.com/%A0%A0"),
			// @ts-expect-error Empty config default to using mocked jaeger
			mockEnv,
			configuration,
			exists,
			getByEtag
		);
		expect(response2.status).toBe(307);
	});

	describe("_headers", () => {
		it("attaches custom headers", async () => {
			const configuration: AssetConfig = applyConfigurationDefaults({
				html_handling: "none",
				not_found_handling: "none",
				headers: {
					version: 2,
					rules: {
						"/": {
							set: {
								"X-Custom-Header": "Custom-Value",
							},
						},
						"/foo": {
							set: {
								"X-Custom-Foo-Header": "Custom-Foo-Value",
							},
						},
						"/bang/:placeheld": {
							set: {
								"X-Custom-Bang-Header": "Custom-Bang-Value :placeheld",
							},
						},
						"/art/*": {
							set: {
								"X-Custom-Art-Header": "Custom-Art-Value :splat",
								"Set-Cookie": "me",
							},
						},
						"/art/nested/attack": {
							set: {
								"Set-Cookie": "me too",
							},
						},
						"/system/override": {
							set: {
								ETag: "very rogue",
							},
						},
						"/system/underride": {
							unset: ["ETAg"],
						},
						"/art/nested/unset/attack*": {
							unset: ["Set-Cookie"],
							set: {
								"Set-Cookie": "hijack",
							},
						},
						"/art/nested/unset/attack/totalunset": {
							unset: ["Set-Cookie"],
						},
						"/foo.html": {
							set: {
								"X-Custom-Foo-HTML-Header": "Custom-Foo-HTML-Value",
							},
						},
					},
				},
			});
			const eTag = "some-etag";
			const exists = vi.fn().mockReturnValue(eTag);
			const getByETag = vi.fn().mockReturnValue({
				readableStream: new ReadableStream(),
				contentType: "text/html",
			});

			// Static header on root
			let response = await handleRequest(
				new Request("https://example.com/"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("X-Custom-Header")).toBe("Custom-Value");
			expect(response.headers.has("X-Custom-Foo-Header")).toBeFalsy();

			// Static header on path
			response = await handleRequest(
				new Request("https://example.com/foo"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("X-Custom-Foo-Header")).toBe(
				"Custom-Foo-Value"
			);
			expect(response.headers.has("X-Custom-Header")).toBeFalsy();

			// Placeholder header
			response = await handleRequest(
				new Request("https://example.com/bang/baz"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("X-Custom-Bang-Header")).toBe(
				"Custom-Bang-Value baz"
			);

			// Placeholder doesn't catch children
			response = await handleRequest(
				new Request("https://example.com/bang/baz/abba"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.has("X-Custom-Bang-Header")).toBeFalsy();

			// Splat header
			response = await handleRequest(
				new Request("https://example.com/art/attack/by/Neil/Buchanan"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("X-Custom-Art-Header")).toBe(
				"Custom-Art-Value attack/by/Neil/Buchanan"
			);
			expect(response.headers.get("Set-Cookie")).toBe("me");

			// Headers are appended
			response = await handleRequest(
				new Request("https://example.com/art/nested/attack"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("Set-Cookie")).toBe("me, me too");

			// System headers are overwritten
			response = await handleRequest(
				new Request("https://example.com/system/override"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("ETag")).toBe("very rogue");

			// System headers can be unset
			response = await handleRequest(
				new Request("https://example.com/system/underride"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.has("ETag")).toBeFalsy();

			// Custom headers can be unset and redefined
			response = await handleRequest(
				new Request("https://example.com/art/nested/unset/attack"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.get("Set-Cookie")).toBe("hijack");

			// Custom headers can entirely unset
			response = await handleRequest(
				new Request("https://example.com/art/nested/unset/attack/totalunset"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.headers.has("Set-Cookie")).toBeFalsy();

			// Custom headers are applied even to redirect responses
			response = await handleRequest(
				new Request("https://example.com/foo.html"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				{ ...configuration, html_handling: "auto-trailing-slash" },
				(pathname: string) => {
					if (pathname === "/foo.html") {
						return true;
					}

					return false;
				},
				getByETag
			);

			expect(response.headers.get("Location")).toBe("/foo");
			expect(response.headers.get("X-Custom-Foo-HTML-Header")).toBe(
				"Custom-Foo-HTML-Value"
			);

			// Custom headers are applied even to not modified responses
			response = await handleRequest(
				new Request("https://example.com/foo", {
					headers: { "If-None-Match": `"${eTag}"` },
				}),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				configuration,
				exists,
				getByETag
			);

			expect(response.status).toBe(304);
			expect(response.headers.get("X-Custom-Foo-Header")).toBe(
				"Custom-Foo-Value"
			);
		});
	});
});

describe("[Asset Worker] `canFetch`", () => {
	it('should return "true" if for exact and nearby assets with html_handling on', async () => {
		const exists = (pathname: string) => {
			if (pathname === "/foo.html") {
				return "some-etag";
			}

			return null;
		};

		expect(
			await canFetch(
				new Request("https://example.com/foo.html"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				applyConfigurationDefaults({ html_handling: "auto-trailing-slash" }),
				exists
			)
		).toBeTruthy();

		expect(
			await canFetch(
				new Request("https://example.com/foo"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				applyConfigurationDefaults({ html_handling: "auto-trailing-slash" }),
				exists
			)
		).toBeTruthy();

		expect(
			await canFetch(
				new Request("https://example.com/foo/"),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				applyConfigurationDefaults({ html_handling: "auto-trailing-slash" }),
				exists
			)
		).toBeTruthy();
	});

	it("should not consider 404s or SPAs", async () => {
		const exists = (pathname: string) => {
			if (["/404.html", "/index.html", "/foo.html"].includes(pathname)) {
				return "some-etag";
			}

			return null;
		};

		for (const notFoundHandling of [
			"single-page-application",
			"404-page",
		] as const) {
			expect(
				await canFetch(
					new Request("https://example.com/foo"),
					// @ts-expect-error Empty config default to using mocked jaeger
					mockEnv,
					applyConfigurationDefaults({ not_found_handling: notFoundHandling }),
					exists
				)
			).toBeTruthy();

			expect(
				await canFetch(
					new Request("https://example.com/bar"),
					// @ts-expect-error Empty config default to using mocked jaeger
					mockEnv,
					applyConfigurationDefaults({ not_found_handling: notFoundHandling }),
					exists
				)
			).toBeFalsy();

			expect(
				await canFetch(
					new Request("https://example.com/"),
					// @ts-expect-error Empty config default to using mocked jaeger
					mockEnv,
					applyConfigurationDefaults({ not_found_handling: notFoundHandling }),
					exists
				)
			).toBeTruthy();

			expect(
				await canFetch(
					new Request("https://example.com/404"),
					// @ts-expect-error Empty config default to using mocked jaeger
					mockEnv,
					applyConfigurationDefaults({ not_found_handling: notFoundHandling }),
					exists
				)
			).toBeTruthy();
		}
	});

	it('should return "true" even for a bad method', async () => {
		const exists = (pathname: string) => {
			if (pathname === "/foo.html") {
				return "some-etag";
			}

			return null;
		};

		expect(
			await canFetch(
				new Request("https://example.com/foo", { method: "POST" }),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				applyConfigurationDefaults(),
				exists
			)
		).toBeTruthy();

		expect(
			await canFetch(
				new Request("https://example.com/bar", { method: "POST" }),
				// @ts-expect-error Empty config default to using mocked jaeger
				mockEnv,
				applyConfigurationDefaults(),
				exists
			)
		).toBeFalsy();
	});
});
