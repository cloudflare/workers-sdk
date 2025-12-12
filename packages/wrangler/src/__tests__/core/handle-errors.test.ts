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
});
