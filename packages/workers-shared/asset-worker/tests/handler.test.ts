import { vi } from "vitest";
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
});
