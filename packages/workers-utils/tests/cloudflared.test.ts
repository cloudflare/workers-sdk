import * as childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { sync as commandExistsSync } from "command-exists";
import * as undici from "undici";
import { beforeEach, describe, it, vi } from "vitest";
import {
	getAssetFilename,
	getCloudflaredBinPath,
	isVersionOutdated,
	redactCloudflaredArgsForLogging,
	spawnCloudflared,
} from "../src/cloudflared";
import { runInTempDir } from "../src/test-helpers";

vi.mock("command-exists", () => ({ sync: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
	...(await importOriginal<typeof childProcess>()),
	execFileSync: vi.fn(),
	spawn: vi.fn(),
}));
vi.mock("undici", async (importOriginal) => ({
	...(await importOriginal<typeof undici>()),
	fetch: vi.fn(),
}));

describe("cloudflared binary management", () => {
	runInTempDir();

	describe("getCloudflaredBinPath", () => {
		it("should return path in wrangler config directory cache including version", ({
			expect,
		}) => {
			const version = "2026.1.0";
			const binPath = getCloudflaredBinPath(version);
			const expectedDir = path.join(
				getGlobalConfigPath(),
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
		const { getCloudflaredPath } = await import("../src/cloudflared");

		// This should return the env var path without downloading
		const binPath = await getCloudflaredPath();
		expect(binPath).toBe(tempBin);
	});

	it("should throw error when CLOUDFLARED_PATH points to non-existent file", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARED_PATH", "/nonexistent/path/to/cloudflared");

		// Import fresh to pick up env change
		const { getCloudflaredPath } = await import("../src/cloudflared");

		await expect(getCloudflaredPath()).rejects.toThrow("CLOUDFLARED_PATH");
	});
});

describe("email-protected cloudflared version requirement", () => {
	runInTempDir();

	beforeEach(() => {
		const binPath = path.join(process.cwd(), "cloudflared");
		fs.writeFileSync(binPath, "test binary");
		vi.stubEnv("CLOUDFLARED_PATH", binPath);
		vi.mocked(childProcess.execFileSync).mockReturnValue(
			"cloudflared version 2026.9.2 (built 2026-09-24 UTC)"
		);
		vi.mocked(childProcess.spawn).mockReturnValue(
			new childProcess.ChildProcess()
		);
	});

	it.for(["2025.12.0", "2026.8.3", "2026.9.0", "2026.9.1"])(
		"rejects an overridden binary at version %s before spawning",
		async (version, { expect }) => {
			vi.mocked(childProcess.execFileSync).mockReturnValue(
				`cloudflared version ${version}`
			);

			await expect(
				spawnCloudflared(["tunnel", "--allowed-mail", "user@example.com"], {
					skipVersionCheck: true,
				})
			).rejects.toThrow(
				"--allowed-mail requires cloudflared 2026.9.2 or later"
			);
			expect(childProcess.spawn).not.toHaveBeenCalled();
		}
	);

	it.for(["--allowed-mail", "--allowed-mail=user@example.com"])(
		"rejects an older PATH binary with %s",
		async (flag, { expect }) => {
			vi.stubEnv("CLOUDFLARED_PATH", "");
			vi.mocked(commandExistsSync).mockReturnValue(true);
			vi.mocked(childProcess.execFileSync).mockReturnValue(
				"cloudflared version 2026.9.1"
			);

			await expect(
				spawnCloudflared(["tunnel", flag, "user@example.com"], {
					skipVersionCheck: true,
				})
			).rejects.toThrow(
				"Update cloudflared in your PATH or set CLOUDFLARED_PATH to a compatible binary"
			);
			expect(childProcess.spawn).not.toHaveBeenCalled();
		}
	);

	it("rejects an older cached binary", async ({ expect }) => {
		vi.stubEnv("CLOUDFLARED_PATH", "");
		vi.mocked(commandExistsSync).mockReturnValue(false);
		vi.mocked(undici.fetch).mockResolvedValue(
			new undici.Response(
				JSON.stringify({
					version: "2026.9.1",
					url: "https://example.com/cloudflared",
				})
			)
		);
		const binPath = getCloudflaredBinPath("2026.9.1");
		fs.mkdirSync(path.dirname(binPath), { recursive: true });
		fs.writeFileSync(binPath, "test binary", { mode: 0o755 });
		vi.mocked(childProcess.execFileSync).mockReturnValue(
			"cloudflared version 2026.9.1"
		);

		await expect(
			spawnCloudflared(["tunnel", "--allowed-mail", "user@example.com"])
		).rejects.toThrow("--allowed-mail requires cloudflared 2026.9.2 or later");
		expect(childProcess.spawn).not.toHaveBeenCalled();
	});

	it.for(["unrecognised version", "failed version command"])(
		"rejects a binary with %s",
		async (failure, { expect }) => {
			vi.mocked(childProcess.execFileSync).mockImplementation(() => {
				if (failure === "failed version command") {
					throw new Error("version command failed");
				}
				return "cloudflared development build";
			});

			await expect(
				spawnCloudflared(["tunnel", "--allowed-mail", "user@example.com"])
			).rejects.toThrow(
				"Could not determine the version of the selected binary"
			);
			expect(childProcess.spawn).not.toHaveBeenCalled();
		}
	);

	it.for(["2026.9.2", "2026.9.3", "2026.10.0", "2027.1.0"])(
		"starts an email-protected tunnel with version %s",
		async (version, { expect }) => {
			vi.mocked(childProcess.execFileSync).mockReturnValue(
				`cloudflared version ${version}`
			);
			const args = ["tunnel", "--allowed-mail", "user@example.com"];

			await spawnCloudflared(args);

			expect(childProcess.spawn).toHaveBeenCalledWith(
				path.join(process.cwd(), "cloudflared"),
				args,
				{ stdio: "inherit", env: undefined }
			);
		}
	);

	it("starts a public tunnel without imposing the email-protection version requirement", async ({
		expect,
	}) => {
		await spawnCloudflared(["tunnel", "--url", "http://localhost:3000"]);

		expect(childProcess.execFileSync).not.toHaveBeenCalled();
		expect(childProcess.spawn).toHaveBeenCalledOnce();
	});
});

describe("cloudflared arg redaction", () => {
	it("redacts separate sensitive argument values", ({ expect }) => {
		const args = [
			"tunnel",
			"run",
			"--token",
			"SECRET_TOKEN",
			"--allowed-mail",
			"user@example.com,*@example.org",
		];

		expect(redactCloudflaredArgsForLogging(args)).toEqual([
			"tunnel",
			"run",
			"--token",
			"[REDACTED]",
			"--allowed-mail",
			"[REDACTED]",
		]);
	});

	it("redacts equals-style sensitive arguments", ({ expect }) => {
		expect(
			redactCloudflaredArgsForLogging([
				"--token=SECRET",
				"--allowed-mail=user@example.com",
			])
		).toEqual(["--token=[REDACTED]", "--allowed-mail=[REDACTED]"]);
	});
});
