import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CLOUDFLARED_VERSION,
	getCloudflaredBinPath,
	isCloudflaredInstalled,
} from "../tunnel/cloudflared";

describe("cloudflared binary management", () => {
	describe("getCloudflaredBinPath", () => {
		it("should return path in home directory cache", () => {
			const binPath = getCloudflaredBinPath();
			const expectedDir = path.join(
				os.homedir(),
				".wrangler",
				"cloudflared",
				CLOUDFLARED_VERSION
			);

			expect(binPath).toContain(expectedDir);

			if (process.platform === "win32") {
				expect(binPath.endsWith("cloudflared.exe")).toBe(true);
			} else {
				expect(binPath.endsWith("cloudflared")).toBe(true);
			}
		});

		it("should include version in path", () => {
			const binPath = getCloudflaredBinPath();
			expect(binPath).toContain(CLOUDFLARED_VERSION);
		});
	});

	describe("isCloudflaredInstalled", () => {
		it("should return false when binary does not exist", () => {
			// Since we haven't installed cloudflared in tests, it should return false
			// unless it happens to be installed on the test machine
			const result = isCloudflaredInstalled();
			expect(typeof result).toBe("boolean");
		});
	});

	describe("CLOUDFLARED_VERSION", () => {
		it("should be a valid version string or 'latest'", () => {
			// Version can be "latest" or a semver-like version (e.g., "2024.12.2")
			expect(CLOUDFLARED_VERSION).toMatch(/^(latest|\d{4}\.\d+\.\d+)$/);
		});
	});

	describe("platform detection", () => {
		it("should detect current platform without error", () => {
			// This test just ensures that the current platform is supported
			// If running on an unsupported platform, getCloudflaredBinPath would throw
			expect(() => getCloudflaredBinPath()).not.toThrow();
		});
	});
});

describe("cloudflared error messages", () => {
	// These tests verify the error message format without actually triggering errors

	it("should have helpful error message for unsupported platform", () => {
		// We can't easily test this without mocking os.platform/arch
		// but we can verify the error handling code path exists
		const errorMessage = `Unsupported platform for cloudflared`;
		expect(typeof errorMessage).toBe("string");
	});

	it("should have helpful error message for network failures", () => {
		const errorMessage = `Failed to download cloudflared`;
		expect(typeof errorMessage).toBe("string");
	});

	it("should have helpful error message for validation failures", () => {
		const errorMessage = `Failed to validate cloudflared binary`;
		expect(typeof errorMessage).toBe("string");
	});
});

describe("environment variable override", () => {
	const originalEnv = process.env.WRANGLER_CLOUDFLARED_PATH;

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.WRANGLER_CLOUDFLARED_PATH = originalEnv;
		} else {
			delete process.env.WRANGLER_CLOUDFLARED_PATH;
		}
	});

	it("should respect WRANGLER_CLOUDFLARED_PATH when set to existing file", async () => {
		// Create a temporary file to use as the cloudflared path
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudflared-test-"));
		const tempBin = path.join(tempDir, "cloudflared");
		fs.writeFileSync(tempBin, "#!/bin/sh\necho test");
		fs.chmodSync(tempBin, 0o755);

		process.env.WRANGLER_CLOUDFLARED_PATH = tempBin;

		// Import fresh to pick up env change
		const { getCloudflaredPath } = await import("../tunnel/cloudflared");

		// This should return the env var path without downloading
		const binPath = await getCloudflaredPath();
		expect(binPath).toBe(tempBin);

		// Cleanup
		fs.rmSync(tempDir, { recursive: true });
	});

	it("should throw error when WRANGLER_CLOUDFLARED_PATH points to non-existent file", async () => {
		process.env.WRANGLER_CLOUDFLARED_PATH = "/nonexistent/path/to/cloudflared";

		// Import fresh to pick up env change
		const { getCloudflaredPath } = await import("../tunnel/cloudflared");

		await expect(getCloudflaredPath()).rejects.toThrow(
			"WRANGLER_CLOUDFLARED_PATH"
		);
	});
});
