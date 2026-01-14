import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleError } from "../../core/handle-errors";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("handleError", () => {
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("SSL/TLS certificate errors", () => {
		it("should log a warning for self-signed certificate errors", async () => {
			const error = new Error("self-signed certificate in certificate chain");

			await handleError(error, {}, []);

			expect(std.warn).toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
			expect(std.warn).toContain("certificate mismatch");
			expect(std.warn).toContain("install the missing system roots");
		});

		it("should log a warning for unable to verify first certificate errors", async () => {
			const error = new Error("unable to verify the first certificate");

			await handleError(error, {}, []);

			expect(std.warn).toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
		});

		it("should log a warning for unable to get local issuer certificate errors", async () => {
			const error = new Error("unable to get local issuer certificate");

			await handleError(error, {}, []);

			expect(std.warn).toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
		});

		it("should log a warning when certificate error is in error cause", async () => {
			const cause = new Error("self-signed certificate in certificate chain");
			const error = new Error("fetch failed", { cause });

			await handleError(error, {}, []);

			expect(std.warn).toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
		});

		it("should log a warning when certificate error is part of a longer message", async () => {
			const error = new Error(
				"Request failed: self-signed certificate in certificate chain (details: some info)"
			);

			await handleError(error, {}, []);

			expect(std.warn).toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
		});

		it("should not log a warning for unrelated errors", async () => {
			const error = new Error("Connection refused");

			await handleError(error, {}, []);

			expect(std.warn).not.toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
		});

		it("should still log the original error after the warning", async () => {
			const error = new Error("self-signed certificate in certificate chain");

			await handleError(error, {}, []);

			// The warning should appear
			expect(std.warn).toContain(
				"Wrangler detected that a corporate proxy or VPN might be enabled"
			);
			// The original error should also be logged
			expect(std.err).toContain("self-signed certificate in certificate chain");
		});
	});

	describe("Cloudflare API connection timeout errors", () => {
		it("should show user-friendly message for api.cloudflare.com timeouts", async () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://api.cloudflare.com/endpoint"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("ConnectionTimeout");
			expect(std.err).toContain("The request to Cloudflare's API timed out");
			expect(std.err).toContain("network connectivity issues");
			expect(std.err).toContain("Please check your internet connection");
		});

		it("should show user-friendly message for dash.cloudflare.com timeouts", async () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://dash.cloudflare.com/api"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("ConnectionTimeout");
			expect(std.err).toContain("The request to Cloudflare's API timed out");
		});

		it("should handle timeout errors in error cause", async () => {
			const cause = Object.assign(
				new Error("timeout connecting to api.cloudflare.com"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);
			const error = new Error("Request failed", { cause });

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("ConnectionTimeout");
			expect(std.err).toContain("The request to Cloudflare's API timed out");
		});

		it("should handle timeout when Cloudflare URL is in parent message", async () => {
			const cause = Object.assign(new Error("connect timeout"), {
				code: "UND_ERR_CONNECT_TIMEOUT",
			});
			const error = new Error(
				"Failed to connect to https://api.cloudflare.com/client/v4/accounts",
				{ cause }
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("ConnectionTimeout");
			expect(std.err).toContain("The request to Cloudflare's API timed out");
		});

		it("should NOT show timeout message for non-Cloudflare URLs", async () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://example.com/api"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).not.toBe("ConnectionTimeout");
			expect(std.err).not.toContain(
				"The request to Cloudflare's API timed out"
			);
		});

		it("should NOT show timeout message for user's dev server timeouts", async () => {
			const cause = Object.assign(
				new Error("timeout connecting to localhost:8787"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);
			const error = new Error("Request failed", { cause });

			const errorType = await handleError(error, {}, []);

			expect(errorType).not.toBe("ConnectionTimeout");
			expect(std.err).not.toContain(
				"The request to Cloudflare's API timed out"
			);
		});
	});
});
