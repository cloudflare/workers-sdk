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

	describe("Permission errors (EPERM, EACCES)", () => {
		it("should show user-friendly message for EPERM errors with path", async () => {
			const error = Object.assign(
				new Error(
					"EPERM: operation not permitted, open '/Users/user/.wrangler/logs/wrangler.log'"
				),
				{
					code: "EPERM",
					errno: -1,
					syscall: "open",
					path: "/Users/user/.wrangler/logs/wrangler.log",
				}
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("PermissionError");
			expect(std.err).toContain(
				"A permission error occurred while accessing the file system"
			);
			expect(std.err).toContain(
				"Affected path: /Users/user/.wrangler/logs/wrangler.log"
			);
			expect(std.err).toContain("Insufficient file or directory permissions");
		});

		it("should show user-friendly message for EACCES errors with path", async () => {
			const error = Object.assign(
				new Error(
					"EACCES: permission denied, open '/Users/user/Library/Preferences/.wrangler/config/default.toml'"
				),
				{
					code: "EACCES",
					errno: -13,
					syscall: "open",
					path: "/Users/user/Library/Preferences/.wrangler/config/default.toml",
				}
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("PermissionError");
			expect(std.err).toContain(
				"A permission error occurred while accessing the file system"
			);
			expect(std.err).toContain(
				"Affected path: /Users/user/Library/Preferences/.wrangler/config/default.toml"
			);
			expect(std.err).toContain("Insufficient file or directory permissions");
		});

		it("should show error message when path is not available", async () => {
			const error = Object.assign(
				new Error("EPERM: operation not permitted, mkdir"),
				{
					code: "EPERM",
				}
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("PermissionError");
			expect(std.err).toContain(
				"A permission error occurred while accessing the file system"
			);
			expect(std.err).toContain("Error: EPERM: operation not permitted, mkdir");
			expect(std.err).not.toContain("Affected path:");
		});

		it("should handle EPERM errors in error cause", async () => {
			const cause = Object.assign(
				new Error(
					"EPERM: operation not permitted, open '/var/logs/wrangler.log'"
				),
				{
					code: "EPERM",
					path: "/var/logs/wrangler.log",
				}
			);
			const error = new Error("Failed to write to log file", { cause });

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("PermissionError");
			expect(std.err).toContain(
				"A permission error occurred while accessing the file system"
			);
			expect(std.err).toContain("Affected path: /var/logs/wrangler.log");
		});

		it("should NOT treat non-EPERM errors as permission errors", async () => {
			const error = Object.assign(new Error("ENOENT: file not found"), {
				code: "ENOENT",
			});

			const errorType = await handleError(error, {}, []);

			expect(errorType).not.toBe("PermissionError");
			expect(std.err).not.toContain(
				"A permission error occurred while accessing the file system"
			);
		});
	});

	describe("DNS resolution errors (ENOTFOUND)", () => {
		it("should show user-friendly message for ENOTFOUND to api.cloudflare.com", async () => {
			const error = Object.assign(
				new Error("getaddrinfo ENOTFOUND api.cloudflare.com"),
				{
					code: "ENOTFOUND",
					hostname: "api.cloudflare.com",
					syscall: "getaddrinfo",
				}
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("DNSError");
			expect(std.err).toContain("Unable to resolve Cloudflare's API hostname");
			expect(std.err).toContain("api.cloudflare.com or dash.cloudflare.com");
			expect(std.err).toContain("No internet connection");
			expect(std.err).toContain("DNS resolver not configured");
		});

		it("should show user-friendly message for ENOTFOUND to dash.cloudflare.com", async () => {
			const error = Object.assign(
				new Error("getaddrinfo ENOTFOUND dash.cloudflare.com"),
				{
					code: "ENOTFOUND",
					hostname: "dash.cloudflare.com",
				}
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("DNSError");
			expect(std.err).toContain("Unable to resolve Cloudflare's API hostname");
		});

		it("should handle DNS errors in error cause", async () => {
			const cause = Object.assign(
				new Error("getaddrinfo ENOTFOUND api.cloudflare.com"),
				{
					code: "ENOTFOUND",
					hostname: "api.cloudflare.com",
				}
			);
			const error = new Error("Request failed", { cause });

			const errorType = await handleError(error, {}, []);

			expect(errorType).toBe("DNSError");
			expect(std.err).toContain("Unable to resolve Cloudflare's API hostname");
		});

		it("should NOT show DNS error for non-Cloudflare hostnames", async () => {
			const error = Object.assign(
				new Error("getaddrinfo ENOTFOUND example.com"),
				{
					code: "ENOTFOUND",
					hostname: "example.com",
				}
			);

			const errorType = await handleError(error, {}, []);

			expect(errorType).not.toBe("DNSError");
			expect(std.err).not.toContain(
				"Unable to resolve Cloudflare's API hostname"
			);
		});
	});
});
