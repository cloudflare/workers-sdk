import { vi } from "vitest";
import { applyConfigurationDefaults } from "../src/configuration";
import { handleRequest } from "../src/handler";
import type { AssetConfig } from "../../utils/types";

describe("[Asset Worker] `handleRequest`", () => {
	it("attaches ETag headers to responses", async () => {
		const configuration: Required<AssetConfig> = {
			html_handling: "none",
			not_found_handling: "none",
			serve_directly: true,
		};
		const eTag = "some-etag";
		const exists = vi.fn().mockReturnValue(eTag);
		const getByETag = vi.fn().mockReturnValue({
			readableStream: new ReadableStream(),
			contentType: "text/html",
		});

		const response = await handleRequest(
			new Request("https://example.com/"),
			configuration,
			exists,
			getByETag
		);

		expect(response.headers.get("ETag")).toBe(`"${eTag}"`);
	});

	it("returns 304 Not Modified responses for a valid strong ETag in If-None-Match", async () => {
		const configuration: Required<AssetConfig> = {
			html_handling: "none",
			not_found_handling: "none",
			serve_directly: true,
		};
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
			configuration,
			exists,
			getByETag
		);

		expect(response.status).toBe(304);
	});

	it("returns 304 Not Modified responses for a valid weak ETag in If-None-Match", async () => {
		const configuration: Required<AssetConfig> = {
			html_handling: "none",
			not_found_handling: "none",
			serve_directly: true,
		};
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
			configuration,
			exists,
			getByETag
		);

		expect(response.status).toBe(304);
	});

	it("returns 200 OK responses for an invalid ETag in If-None-Match", async () => {
		const configuration: Required<AssetConfig> = {
			html_handling: "none",
			not_found_handling: "none",
			serve_directly: true,
		};
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
		const configuration: Required<AssetConfig> = {
			html_handling: "drop-trailing-slash",
			not_found_handling: "none",
			serve_directly: true,
		};

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
			configuration,
			exists,
			getByEtag
		);
		expect(response.status).toBe(404);

		// but second malformed URL should return 307 as it matches and then redirects
		const response2 = await handleRequest(
			new Request("https://example.com/%A0%A0"),
			configuration,
			exists,
			getByEtag
		);
		expect(response2.status).toBe(307);
	});
});
