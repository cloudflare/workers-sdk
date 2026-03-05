import fs from "node:fs";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import {
	getAssetFilename,
	getCloudflaredBinPath,
	isVersionOutdated,
} from "../../tunnel/cloudflared";
import { runInTempDir } from "../helpers/run-in-tmp";

describe("cloudflared binary management", () => {
	runInTempDir();

	describe("getCloudflaredBinPath", () => {
		it("should return path in wrangler config directory cache including version", ({
			expect,
		}) => {
			const version = "2026.1.0";
			const binPath = getCloudflaredBinPath(version);
			const expectedDir = path.join(
				getGlobalWranglerConfigPath(),
				"cloudflared",
				version
			);

			expect(binPath).toContain(expectedDir);

			if (process.platform === "win32") {
				expect(binPath.endsWith("cloudflared.exe")).toBe(true);
			} else {
				expect(binPath.endsWith("cloudflared")).toBe(true);
			}
		});
	});

	describe("getAssetFilename", () => {
		it("returns .tgz for darwin", ({ expect }) => {
			expect(getAssetFilename("darwin", "amd64")).toBe(
				"cloudflared-darwin-amd64.tgz"
			);
			expect(getAssetFilename("darwin", "arm64")).toBe(
				"cloudflared-darwin-arm64.tgz"
			);
		});

		it("returns .exe for windows", ({ expect }) => {
			expect(getAssetFilename("windows", "amd64")).toBe(
				"cloudflared-windows-amd64.exe"
			);
		});

		it("returns bare binary name for linux", ({ expect }) => {
			expect(getAssetFilename("linux", "amd64")).toBe(
				"cloudflared-linux-amd64"
			);
			expect(getAssetFilename("linux", "arm64")).toBe(
				"cloudflared-linux-arm64"
			);
			expect(getAssetFilename("linux", "arm")).toBe("cloudflared-linux-arm");
		});
	});

	describe("isVersionOutdated", () => {
		it("returns true when installed is older by year", ({ expect }) => {
			expect(isVersionOutdated("2024.1.0", "2025.1.0")).toBe(true);
		});

		it("returns true when installed is older by month", ({ expect }) => {
			expect(isVersionOutdated("2025.1.0", "2025.7.0")).toBe(true);
		});

		it("returns true when installed is older by patch", ({ expect }) => {
			expect(isVersionOutdated("2025.7.0", "2025.7.1")).toBe(true);
		});

		it("returns false when versions are equal", ({ expect }) => {
			expect(isVersionOutdated("2025.7.0", "2025.7.0")).toBe(false);
		});

		it("returns false when installed is newer", ({ expect }) => {
			expect(isVersionOutdated("2026.1.0", "2025.12.0")).toBe(false);
		});

		it("handles double-digit months correctly", ({ expect }) => {
			expect(isVersionOutdated("2025.9.0", "2025.12.0")).toBe(true);
			expect(isVersionOutdated("2025.12.0", "2025.9.0")).toBe(false);
		});
	});
});

describe("environment variable override", () => {
	runInTempDir();

	it("should respect CLOUDFLARED_PATH when set to existing file", async ({
		expect,
	}) => {
		// Create a temporary file to use as the cloudflared path
		const tempBin = path.join(process.cwd(), "cloudflared");
		fs.writeFileSync(tempBin, "#!/bin/sh\necho test");
		fs.chmodSync(tempBin, 0o755);

		vi.stubEnv("CLOUDFLARED_PATH", tempBin);

		// Import fresh to pick up env change
		const { getCloudflaredPath } = await import("../../tunnel/cloudflared");

		// This should return the env var path without downloading
		const binPath = await getCloudflaredPath();
		expect(binPath).toBe(tempBin);
	});

	it("should throw error when CLOUDFLARED_PATH points to non-existent file", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARED_PATH", "/nonexistent/path/to/cloudflared");

		// Import fresh to pick up env change
		const { getCloudflaredPath } = await import("../../tunnel/cloudflared");

		await expect(getCloudflaredPath()).rejects.toThrow("CLOUDFLARED_PATH");
	});
});
