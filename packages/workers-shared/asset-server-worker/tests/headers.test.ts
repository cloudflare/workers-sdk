import { getAdditionalHeaders, getMergedHeaders } from "../src/utils/headers";
import type { AssetMetadata } from "../src/utils/kv";

describe("[Asset Worker] Response Headers", () => {
	describe("getMergedHeaders()", () => {
		it("should merge headers with override", () => {
			const existingHeaders = new Headers({
				"Accept-Encoding": "gzip",
				"Cache-Control": "max-age=180, public",
				"Content-Type": "text/html; charset=utf-8",
			});

			const additionalHeaders = new Headers({
				"Accept-Encoding": "*",
				"Content-Type": "text/javascript; charset=utf-8",
				"Keep-Alive": "timeout=5, max=1000",
			});

			const mergedHeaders = getMergedHeaders(
				existingHeaders,
				additionalHeaders
			);
			expect(mergedHeaders).toEqual(
				new Headers({
					"Accept-Encoding": "*",
					"Cache-Control": "max-age=180, public",
					"Content-Type": "text/javascript; charset=utf-8",
					"Keep-Alive": "timeout=5, max=1000",
				})
			);
		});
	});

	describe("getAdditionalHeaders()", () => {
		it("should return the default headers the Asset Worker should set on every response", () => {
			const request = new Request("https://example.com", {
				method: "GET",
				headers: {
					"Accept-Encoding": "*",
				},
			});
			const assetMetadata: AssetMetadata = {
				contentType: "text/html; charset=utf-8",
			};
			const additionalHeaders = getAdditionalHeaders(
				"33a64df551425fcc55e4d42a148795d9f25f89d4",
				assetMetadata,
				request
			);

			expect(additionalHeaders).toEqual(
				new Headers({
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "text/html; charset=utf-8",
					"Referrer-Policy": "strict-origin-when-cross-origin",
					"X-Content-Type-Options": "nosniff",
					ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4",
					"Cache-Control": "public, max-age=0, must-revalidate",
				})
			);
		});

		it("should default 'Content-Type' to 'application/octet-stream' if not specified by asset metadata", () => {
			const request = new Request("https://example.com", {
				method: "GET",
				headers: {
					"Accept-Encoding": "*",
				},
			});
			const additionalHeaders = getAdditionalHeaders(
				"33a64df551425fcc55e4d42a148795d9f25f89d4",
				null,
				request
			);

			expect(additionalHeaders).toEqual(
				new Headers({
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/octet-stream",
					"Referrer-Policy": "strict-origin-when-cross-origin",
					"X-Content-Type-Options": "nosniff",
					ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4",
					"Cache-Control": "public, max-age=0, must-revalidate",
				})
			);
		});

		it("should set the 'charset' to 'utf-8' when appropriate, if not specified", () => {
			const request = new Request("https://example.com", {
				method: "GET",
				headers: {
					"Accept-Encoding": "*",
				},
			});
			const assetMetadata: AssetMetadata = { contentType: "text/html" };
			const additionalHeaders = getAdditionalHeaders(
				"33a64df551425fcc55e4d42a148795d9f25f89d4",
				assetMetadata,
				request
			);

			expect(additionalHeaders).toEqual(
				new Headers({
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "text/html; charset=utf-8",
					"Referrer-Policy": "strict-origin-when-cross-origin",
					"X-Content-Type-Options": "nosniff",
					ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4",
					"Cache-Control": "public, max-age=0, must-revalidate",
				})
			);
		});

		it("should not set the 'Cache-Control' header, if 'Authorization' and 'Range' headers are present in the request", () => {
			const request = new Request("https://example.com", {
				method: "GET",
				headers: {
					"Accept-Encoding": "*",
					Authorization: "Basic 123",
					Range: "bytes=0-499",
				},
			});
			const assetMetadata: AssetMetadata = {
				contentType: "text/html; charset=utf-8",
			};
			const additionalHeaders = getAdditionalHeaders(
				"33a64df551425fcc55e4d42a148795d9f25f89d4",
				assetMetadata,
				request
			);

			expect(additionalHeaders).toEqual(
				new Headers({
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "text/html; charset=utf-8",
					"Referrer-Policy": "strict-origin-when-cross-origin",
					"X-Content-Type-Options": "nosniff",
					ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4",
				})
			);
		});
	});
});
