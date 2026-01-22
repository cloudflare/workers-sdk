import { beforeEach, describe, expect, it, vi } from "vitest";
import { getErrorType, handleError } from "../../core/handle-errors";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("getErrorType", () => {
	describe("DNS errors", () => {
		it("should return 'DNSError' for ENOTFOUND to api.cloudflare.com", () => {
			const error = Object.assign(
				new Error("getaddrinfo ENOTFOUND api.cloudflare.com"),
				{
					code: "ENOTFOUND",
					hostname: "api.cloudflare.com",
					syscall: "getaddrinfo",
				}
			);

			expect(getErrorType(error)).toBe("DNSError");
		});

		it("should return 'DNSError' for ENOTFOUND to dash.cloudflare.com", () => {
			const error = Object.assign(
				new Error("getaddrinfo ENOTFOUND dash.cloudflare.com"),
				{
					code: "ENOTFOUND",
					hostname: "dash.cloudflare.com",
				}
			);

			expect(getErrorType(error)).toBe("DNSError");
		});

		it("should return 'DNSError' for DNS errors in error cause", () => {
			const cause = Object.assign(
				new Error("getaddrinfo ENOTFOUND api.cloudflare.com"),
				{
					code: "ENOTFOUND",
					hostname: "api.cloudflare.com",
				}
			);
			const error = new Error("Request failed", { cause });

			expect(getErrorType(error)).toBe("DNSError");
		});

		it("should NOT return 'DNSError' for non-Cloudflare hostnames", () => {
			const error = Object.assign(
				new Error("getaddrinfo ENOTFOUND example.com"),
				{
					code: "ENOTFOUND",
					hostname: "example.com",
				}
			);

			expect(getErrorType(error)).not.toBe("DNSError");
		});
	});

	describe("Connection timeout errors", () => {
		it("should return 'ConnectionTimeout' for api.cloudflare.com timeouts", () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://api.cloudflare.com/endpoint"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			expect(getErrorType(error)).toBe("ConnectionTimeout");
		});

		it("should return 'ConnectionTimeout' for dash.cloudflare.com timeouts", () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://dash.cloudflare.com/api"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			expect(getErrorType(error)).toBe("ConnectionTimeout");
		});

		it("should return 'ConnectionTimeout' for timeout errors in error cause", () => {
			const cause = Object.assign(
				new Error("timeout connecting to api.cloudflare.com"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);
			const error = new Error("Request failed", { cause });

			expect(getErrorType(error)).toBe("ConnectionTimeout");
		});

		it("should return 'ConnectionTimeout' when Cloudflare URL is in parent message", () => {
			const cause = Object.assign(new Error("connect timeout"), {
				code: "UND_ERR_CONNECT_TIMEOUT",
			});
			const error = new Error(
				"Failed to connect to https://api.cloudflare.com/client/v4/accounts",
				{ cause }
			);

			expect(getErrorType(error)).toBe("ConnectionTimeout");
		});

		it("should NOT return 'ConnectionTimeout' for non-Cloudflare URLs", () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://example.com/api"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			expect(getErrorType(error)).not.toBe("ConnectionTimeout");
		});

		it("should NOT return 'ConnectionTimeout' for user's dev server timeouts", () => {
			const cause = Object.assign(
				new Error("timeout connecting to localhost:8787"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);
			const error = new Error("Request failed", { cause });

			expect(getErrorType(error)).not.toBe("ConnectionTimeout");
		});
	});

	describe("Permission errors", () => {
		it("should return 'PermissionError' for EPERM errors", () => {
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

			expect(getErrorType(error)).toBe("PermissionError");
		});

		it("should return 'PermissionError' for EACCES errors", () => {
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

			expect(getErrorType(error)).toBe("PermissionError");
		});

		it("should return 'PermissionError' for EPERM errors without path", () => {
			const error = Object.assign(
				new Error("EPERM: operation not permitted, mkdir"),
				{
					code: "EPERM",
				}
			);

			expect(getErrorType(error)).toBe("PermissionError");
		});

		it("should return 'PermissionError' for EPERM errors in error cause", () => {
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

			expect(getErrorType(error)).toBe("PermissionError");
		});

		it("should NOT return 'PermissionError' for non-EPERM/EACCES errors", () => {
			const error = Object.assign(new Error("ENOENT: file not found"), {
				code: "ENOENT",
			});

			expect(getErrorType(error)).not.toBe("PermissionError");
		});
	});

	describe("File not found errors", () => {
		it("should return 'FileNotFoundError' for ENOENT errors with path", () => {
			const error = Object.assign(
				new Error("ENOENT: no such file or directory, open 'wrangler.toml'"),
				{
					code: "ENOENT",
					errno: -2,
					syscall: "open",
					path: "wrangler.toml",
				}
			);

			expect(getErrorType(error)).toBe("FileNotFoundError");
		});

		it("should return 'FileNotFoundError' for ENOENT errors without path", () => {
			const error = Object.assign(
				new Error("ENOENT: no such file or directory"),
				{
					code: "ENOENT",
				}
			);

			expect(getErrorType(error)).toBe("FileNotFoundError");
		});

		it("should return 'FileNotFoundError' for ENOENT errors in error cause", () => {
			const cause = Object.assign(
				new Error("ENOENT: no such file or directory, stat '.wrangler'"),
				{
					code: "ENOENT",
					path: ".wrangler",
				}
			);
			const error = new Error("Failed to read directory", { cause });

			expect(getErrorType(error)).toBe("FileNotFoundError");
		});
	});

	describe("Fallback behavior", () => {
		it("should return constructor name for unknown Error types", () => {
			const error = new TypeError("Something went wrong");

			expect(getErrorType(error)).toBe("TypeError");
		});

		it("should return undefined for non-Error values", () => {
			expect(getErrorType("string error")).toBe(undefined);
			expect(getErrorType(null)).toBe(undefined);
			expect(getErrorType(undefined)).toBe(undefined);
		});
	});
});

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

			await handleError(error, {}, []);

			expect(std.err).toContain("The request to Cloudflare's API timed out");
			expect(std.err).toContain("network connectivity issues");
			expect(std.err).toContain("Please check your internet connection");
		});

		it("should show user-friendly message for dash.cloudflare.com timeouts", async () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://dash.cloudflare.com/api"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			await handleError(error, {}, []);

			expect(std.err).toContain("The request to Cloudflare's API timed out");
		});

		it("should handle timeout errors in error cause", async () => {
			const cause = Object.assign(
				new Error("timeout connecting to api.cloudflare.com"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);
			const error = new Error("Request failed", { cause });

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

			expect(std.err).toContain("The request to Cloudflare's API timed out");
		});

		it("should NOT show timeout message for non-Cloudflare URLs", async () => {
			const error = Object.assign(
				new Error("Connect Timeout Error: https://example.com/api"),
				{ code: "UND_ERR_CONNECT_TIMEOUT" }
			);

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

			expect(std.err).toContain(
				"A permission error occurred while accessing the file system"
			);
			expect(std.err).toContain("Affected path: /var/logs/wrangler.log");
		});

		it("should NOT treat non-EPERM errors as permission errors", async () => {
			const error = Object.assign(new Error("ENOENT: file not found"), {
				code: "ENOENT",
			});

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

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

			await handleError(error, {}, []);

			expect(std.err).not.toContain(
				"Unable to resolve Cloudflare's API hostname"
			);
		});
	});

	describe("File not found errors (ENOENT)", () => {
		it("should show user-friendly message for ENOENT errors with path", async () => {
			const error = Object.assign(
				new Error("ENOENT: no such file or directory, open 'wrangler.toml'"),
				{
					code: "ENOENT",
					errno: -2,
					syscall: "open",
					path: "wrangler.toml",
				}
			);

			await handleError(error, {}, []);

			expect(std.err).toContain("A file or directory could not be found");
			expect(std.err).toContain("Missing file or directory: wrangler.toml");
			expect(std.err).toContain("The file or directory does not exist");
		});

		it("should show error message when path is not available", async () => {
			const error = Object.assign(
				new Error("ENOENT: no such file or directory"),
				{
					code: "ENOENT",
				}
			);

			await handleError(error, {}, []);

			expect(std.err).toContain("A file or directory could not be found");
			expect(std.err).toContain("Error: ENOENT: no such file or directory");
			expect(std.err).not.toContain("Missing file or directory:");
		});

		it("should handle ENOENT errors in error cause", async () => {
			const cause = Object.assign(
				new Error("ENOENT: no such file or directory, stat '.wrangler'"),
				{
					code: "ENOENT",
					path: ".wrangler",
				}
			);
			const error = new Error("Failed to read directory", { cause });

			await handleError(error, {}, []);

			expect(std.err).toContain("A file or directory could not be found");
			expect(std.err).toContain("Missing file or directory: .wrangler");
		});
	});
});
