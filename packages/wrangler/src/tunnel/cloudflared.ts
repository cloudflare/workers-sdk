/**
 * cloudflared binary management for Wrangler tunnel commands.
 *
 * This module handles downloading, caching, and running the cloudflared binary.
 * It follows the same patterns as the workerd npm package for binary management.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	accessSync,
	chmodSync,
	constants,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { arch, endianness, homedir } from "node:os";
import { dirname, join } from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { sync as commandExistsSync } from "command-exists";
import { fetch } from "undici";
import { logger } from "../logger";
import type { ChildProcess } from "node:child_process";

// cloudflared version to download
export const CLOUDFLARED_VERSION = "2026.1.2";

type GithubReleaseAsset = {
	name: string;
	digest?: string;
};

type GithubRelease = {
	assets: GithubReleaseAsset[];
};

let cachedReleaseByVersion: Map<string, GithubRelease> | undefined;

function sha256Hex(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

async function getGithubRelease(version: string): Promise<GithubRelease> {
	if (!cachedReleaseByVersion) {
		cachedReleaseByVersion = new Map();
	}
	const cached = cachedReleaseByVersion.get(version);
	if (cached) {
		return cached;
	}

	const url = `https://api.github.com/repos/cloudflare/cloudflared/releases/tags/${version}`;
	const response = await fetch(url, {
		headers: {
			"User-Agent": "wrangler",
			Accept: "application/vnd.github+json",
		},
	});
	if (!response.ok) {
		throw new UserError(
			`[cloudflared] Failed to fetch cloudflared release metadata from ${url}\n\n` +
				`HTTP ${response.status}: ${response.statusText}`
		);
	}

	const release = (await response.json()) as GithubRelease;
	cachedReleaseByVersion.set(version, release);
	return release;
}

async function getExpectedAssetSha256(assetName: string): Promise<string> {
	const release = await getGithubRelease(CLOUDFLARED_VERSION);
	const asset = release.assets?.find((a) => a.name === assetName);
	const digest = asset?.digest;
	if (!digest) {
		throw new UserError(
			`[cloudflared] Could not find SHA256 digest for release asset "${assetName}" (version ${CLOUDFLARED_VERSION}).\n\n` +
				`This is required to verify the downloaded binary.`
		);
	}
	if (!digest.startsWith("sha256:")) {
		throw new UserError(
			`[cloudflared] Unexpected digest format for "${assetName}": ${digest}`
		);
	}
	return digest.slice("sha256:".length);
}

// Platform and architecture mappings for cloudflared releases
// Format: "platform arch endianness" -> { url suffix, is tarball }
interface BinarySpec {
	/** URL path suffix for the GitHub release asset */
	urlSuffix: string;
	/** Whether the download is a tarball that needs extraction */
	isTarball: boolean;
}

const knownPlatforms: Record<string, BinarySpec> = {
	"darwin arm64 LE": {
		urlSuffix: "cloudflared-darwin-arm64.tgz",
		isTarball: true,
	},
	"darwin x64 LE": {
		urlSuffix: "cloudflared-darwin-amd64.tgz",
		isTarball: true,
	},
	"linux arm64 LE": {
		urlSuffix: "cloudflared-linux-arm64",
		isTarball: false,
	},
	"linux x64 LE": {
		urlSuffix: "cloudflared-linux-amd64",
		isTarball: false,
	},
	"linux arm LE": {
		urlSuffix: "cloudflared-linux-arm",
		isTarball: false,
	},
	"win32 x64 LE": {
		urlSuffix: "cloudflared-windows-amd64.exe",
		isTarball: false,
	},
};

/**
 * Get the binary specification for the current platform
 */
function getBinarySpecForCurrentPlatform(): BinarySpec {
	const platformKey = `${process.platform} ${arch()} ${endianness()}`;

	if (platformKey in knownPlatforms) {
		return knownPlatforms[platformKey];
	}

	throw new UserError(
		`Unsupported platform for cloudflared: ${platformKey}\n\n` +
			`cloudflared is available for the following platforms:\n` +
			Object.keys(knownPlatforms)
				.map((k) => `  - ${k}`)
				.join("\n") +
			`\n\nYou can manually install cloudflared and set the WRANGLER_CLOUDFLARED_PATH environment variable.\n` +
			`Download instructions: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`
	);
}

/**
 * Get the directory where cloudflared binary should be cached
 */
function getCacheDir(): string {
	// Use a cache directory in the user's home directory to persist across projects
	// Similar to how other tools cache binaries
	return join(homedir(), ".wrangler", "cloudflared", CLOUDFLARED_VERSION);
}

/**
 * Get the expected path for the cloudflared binary
 */
export function getCloudflaredBinPath(): string {
	const binName =
		process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
	return join(getCacheDir(), binName);
}

/**
 * Check if cloudflared binary exists and is executable
 */
export function isCloudflaredInstalled(): boolean {
	const binPath = getCloudflaredBinPath();
	try {
		accessSync(binPath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate that the installed binary works correctly
 */
function validateBinary(binPath: string): void {
	try {
		const result = execFileSync(binPath, ["--version"], {
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 10000,
		});
		const output = result.toString().trim();
		logger.debug(`cloudflared version: ${output}`);
	} catch {
		let errorMessage = `[cloudflared] Failed to validate cloudflared binary at ${binPath}\n\n`;
		errorMessage += `This usually means:\n`;
		errorMessage += `  - The binary is corrupted or incomplete\n`;
		errorMessage += `  - You're missing required system libraries\n`;

		if (process.platform === "linux") {
			errorMessage += `\nOn Linux, make sure you have the required dependencies:\n`;
			errorMessage += `  - glibc (GNU C Library)\n`;
			errorMessage += `  - For Debian/Ubuntu: sudo apt-get install libc6\n`;
		}

		errorMessage += `\nYou can try:\n`;
		errorMessage += `  1. Deleting the cache directory: rm -rf ${getCacheDir()}\n`;
		errorMessage += `  2. Running the command again to re-download\n`;
		errorMessage += `  3. Manually installing cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n`;
		errorMessage += `  4. Setting WRANGLER_CLOUDFLARED_PATH to point to your cloudflared binary`;

		throw new UserError(errorMessage);
	}
}

export function redactCloudflaredArgsForLogging(args: string[]): string[] {
	const redacted = [...args];
	const redactNextFor = new Set([
		"--token",
		"--origincert",
		"--credentials-contents",
	]);
	for (let i = 0; i < redacted.length; i++) {
		const arg = redacted[i];
		if (redactNextFor.has(arg) && i + 1 < redacted.length) {
			redacted[i + 1] = "[REDACTED]";
		}
		if (arg.startsWith("--token=")) {
			redacted[i] = "--token=[REDACTED]";
		}
		if (arg.startsWith("--credentials-contents=")) {
			redacted[i] = "--credentials-contents=[REDACTED]";
		}
	}
	return redacted;
}

function tryGetCloudflaredFromPath(): string | null {
	if (!commandExistsSync("cloudflared")) {
		return null;
	}
	try {
		validateBinary("cloudflared");
		return "cloudflared";
	} catch (e) {
		logger.debug("cloudflared found in PATH but failed validation", e);
		return null;
	}
}

function writeFileAtomic(filePath: string, contents: Buffer): void {
	const dir = dirname(filePath);
	const tmpPath = join(
		dir,
		`.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
	);
	try {
		writeFileSync(tmpPath, contents);
		renameSync(tmpPath, filePath);
	} finally {
		try {
			if (existsSync(tmpPath)) {
				unlinkSync(tmpPath);
			}
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Download cloudflared binary from GitHub releases
 */
async function downloadCloudflared(binPath: string): Promise<void> {
	const spec = getBinarySpecForCurrentPlatform();
	const url = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${spec.urlSuffix}`;
	const expectedSha256 = await getExpectedAssetSha256(spec.urlSuffix);

	logger.log(`Downloading cloudflared ${CLOUDFLARED_VERSION}...`);
	logger.debug(`Download URL: ${url}`);

	// Create cache directory
	const cacheDir = dirname(binPath);
	mkdirSync(cacheDir, { recursive: true });

	let response: Response;
	try {
		response = await fetch(url, {
			headers: {
				"User-Agent": "wrangler",
			},
		});
	} catch (e) {
		throw new UserError(
			`[cloudflared] Failed to download cloudflared from ${url}\n\n` +
				`Network error: ${e instanceof Error ? e.message : String(e)}\n\n` +
				`Please check your internet connection and try again.\n` +
				`If you're behind a proxy, make sure it's configured correctly.`
		);
	}

	if (!response.ok) {
		throw new UserError(
			`[cloudflared] Failed to download cloudflared from ${url}\n\n` +
				`HTTP ${response.status}: ${response.statusText}\n\n` +
				`This could mean:\n` +
				`  - The version ${CLOUDFLARED_VERSION} doesn't exist\n` +
				`  - GitHub is temporarily unavailable\n` +
				`  - You're being rate limited\n\n` +
				`You can manually download cloudflared from:\n` +
				`https://github.com/cloudflare/cloudflared/releases`
		);
	}

	try {
		if (spec.isTarball) {
			// For macOS tarballs, download and extract
			await downloadAndExtractTarball(response, expectedSha256, binPath, cacheDir);
		} else {
			// For Linux/Windows, download directly
			await downloadBinary(response, expectedSha256, binPath);
		}
	} catch (e) {
		// Clean up partial downloads
		try {
			if (existsSync(binPath)) {
				unlinkSync(binPath);
			}
		} catch {
			// Ignore cleanup errors
		}

		if (e instanceof UserError) {
			throw e;
		}

		throw new UserError(
			`[cloudflared] Failed to save cloudflared binary\n\n` +
				`Error: ${e instanceof Error ? e.message : String(e)}\n\n` +
				`Please ensure you have write permissions to: ${cacheDir}`
		);
	}

	// Make executable on Unix systems
	if (process.platform !== "win32") {
		chmodSync(binPath, 0o755);
	}

	logger.log(`cloudflared ${CLOUDFLARED_VERSION} installed`);
}

/**
 * Download and extract a tarball (for macOS)
 */
async function downloadAndExtractTarball(
	response: Response,
	expectedSha256: string,
	binPath: string,
	cacheDir: string
): Promise<void> {
	const tempTarPath = join(cacheDir, "cloudflared.tgz");

	// Download to temp file first
	const buffer = Buffer.from(await response.arrayBuffer());
	const actualSha256 = sha256Hex(buffer);
	if (actualSha256 !== expectedSha256) {
		throw new UserError(
			`[cloudflared] SHA256 mismatch for downloaded cloudflared tarball.\n\n` +
				`Expected: ${expectedSha256}\n` +
				`Actual:   ${actualSha256}`
		);
	}
	writeFileSync(tempTarPath, buffer);

	try {
		// Extract using native tar command
		execFileSync("tar", ["-xzf", tempTarPath, "-C", cacheDir], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		// The tarball extracts to 'cloudflared', rename if needed
		const extractedPath = join(cacheDir, "cloudflared");
		if (extractedPath !== binPath && existsSync(extractedPath)) {
			renameSync(extractedPath, binPath);
		}
	} finally {
		// Cleanup temp tarball
		try {
			if (existsSync(tempTarPath)) {
				unlinkSync(tempTarPath);
			}
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Download binary directly (for Linux/Windows)
 */
async function downloadBinary(
	response: Response,
	expectedSha256: string,
	binPath: string
): Promise<void> {
	const buffer = Buffer.from(await response.arrayBuffer());
	const actualSha256 = sha256Hex(buffer);
	if (actualSha256 !== expectedSha256) {
		throw new UserError(
			`[cloudflared] SHA256 mismatch for downloaded cloudflared binary.\n\n` +
				`Expected: ${expectedSha256}\n` +
				`Actual:   ${actualSha256}`
		);
	}
	writeFileAtomic(binPath, buffer);
}

/**
 * Get cloudflared binary path, installing if necessary
 *
 * Resolution order:
 * 1. WRANGLER_CLOUDFLARED_PATH environment variable (user override)
 * 2. Cached binary in ~/.wrangler/cloudflared/{version}/
 * 3. Download from GitHub releases
 */
export async function getCloudflaredPath(): Promise<string> {
	// Check for environment variable override first
	const envPath = process.env.WRANGLER_CLOUDFLARED_PATH;
	if (envPath) {
		if (!existsSync(envPath)) {
			throw new UserError(
				`WRANGLER_CLOUDFLARED_PATH is set to "${envPath}" but the file does not exist.\n\n` +
					`Please ensure the path points to a valid cloudflared binary.`
			);
		}
		logger.debug(
			`Using cloudflared from WRANGLER_CLOUDFLARED_PATH: ${envPath}`
		);
		validateBinary(envPath);
		return envPath;
	}

	// Next, prefer a user-installed cloudflared in PATH.
	const pathBin = tryGetCloudflaredFromPath();
	if (pathBin) {
		logger.debug("Using cloudflared from PATH");
		return pathBin;
	}

	const binPath = getCloudflaredBinPath();

	// Check if already installed and valid
	if (isCloudflaredInstalled()) {
		try {
			validateBinary(binPath);
			logger.debug(`Using cached cloudflared: ${binPath}`);
			return binPath;
		} catch (e) {
			logger.debug("Cached cloudflared failed validation; re-downloading", e);
			removeCloudflaredCache();
		}
	}

	// Download cloudflared
	await downloadCloudflared(binPath);

	// Validate the downloaded binary
	validateBinary(binPath);

	return binPath;
}

/**
 * Spawn cloudflared process with automatic binary management
 */
export async function spawnCloudflared(
	args: string[],
	options?: { stdio?: "inherit" | "pipe" }
): Promise<ChildProcess> {
	const binPath = await getCloudflaredPath();

	logger.debug(
		`Spawning cloudflared: ${binPath} ${redactCloudflaredArgsForLogging(args).join(" ")}`
	);

	const cloudflared = spawn(binPath, args, {
		stdio: options?.stdio ?? "inherit",
	});

	return cloudflared;
}

/**
 * Get the installed cloudflared version
 */
export async function getInstalledCloudflaredVersion(): Promise<string | null> {
	try {
		const binPath = await getCloudflaredPath();
		const output = execFileSync(binPath, ["--version"], {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		// Output format: "cloudflared version 2024.12.2 (built 2024-12-17-1234)"
		const match = output.match(/cloudflared version (\S+)/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

/**
 * Remove cached cloudflared binary
 */
export function removeCloudflaredCache(): void {
	const cacheDir = getCacheDir();
	if (existsSync(cacheDir)) {
		rmSync(cacheDir, { recursive: true, force: true });
		logger.log(`Removed cloudflared cache: ${cacheDir}`);
	}
}
