/**
 * cloudflared binary management for Wrangler tunnel commands.
 *
 * This module handles downloading, caching, and running the cloudflared binary.
 * It uses the Cloudflare update worker (update.argotunnel.com) to resolve
 * the latest version and download URL, matching cloudflared's own update mechanism.
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
import { arch, homedir } from "node:os";
import { dirname, join } from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { sync as commandExistsSync } from "command-exists";
import { fetch } from "undici";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import type { ChildProcess } from "node:child_process";

/**
 * Cloudflare update worker URL.
 * This is the same endpoint cloudflared itself uses for self-update.
 * It takes os, arch, and version query parameters and returns JSON with
 * the download URL, version, checksum, and whether compression is used.
 * The worker uses KV for caching.
 */
const UPDATE_SERVICE_URL = "https://update.argotunnel.com";

/**
 * Response shape from the Cloudflare update worker.
 */
interface VersionResponse {
	url: string;
	version: string;
	checksum: string;
	compressed: boolean;
	shouldUpdate: boolean;
	userMessage: string;
	error: string;
}

function sha256Hex(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Map Node.js arch() values to Go runtime.GOARCH values
 * used by the update worker.
 */
function getGoArch(): string {
	const nodeArch = arch();
	switch (nodeArch) {
		case "x64":
			return "amd64";
		case "arm64":
			return "arm64";
		case "arm":
			return "arm";
		default:
			throw new UserError(
				`Unsupported architecture for cloudflared: ${nodeArch}\n\n` +
					`cloudflared supports: x64 (amd64), arm64, arm\n\n` +
					`You can manually install cloudflared and set the WRANGLER_CLOUDFLARED_PATH environment variable.\n` +
					`Download instructions: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/`
			);
	}
}

/**
 * Map Node.js process.platform to Go runtime.GOOS values
 * used by the update worker.
 */
function getGoOS(): string {
	switch (process.platform) {
		case "darwin":
			return "darwin";
		case "linux":
			return "linux";
		case "win32":
			return "windows";
		default:
			throw new UserError(
				`Unsupported platform for cloudflared: ${process.platform}\n\n` +
					`cloudflared supports: darwin (macOS), linux, win32 (Windows)\n\n` +
					`You can manually install cloudflared and set the WRANGLER_CLOUDFLARED_PATH environment variable.\n` +
					`Download instructions: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/`
			);
	}
}

/** GitHub release URL pattern for cloudflared binaries. */
const GITHUB_RELEASE_BASE =
	"https://github.com/cloudflare/cloudflared/releases/download";

/**
 * Build the expected GitHub release asset filename for this platform.
 */
export function getAssetFilename(goOS: string, goArch: string): string {
	if (goOS === "windows") {
		return `cloudflared-${goOS}-${goArch}.exe`;
	}
	if (goOS === "darwin") {
		return `cloudflared-${goOS}-${goArch}.tgz`;
	}
	return `cloudflared-${goOS}-${goArch}`;
}

/**
 * Query the update worker for a specific os/arch combination.
 * Returns the parsed response, or null if the request failed or the
 * worker returned an error (e.g. "no release found").
 */
async function queryUpdateService(
	goOS: string,
	goArch: string
): Promise<VersionResponse | null> {
	const url = new URL(UPDATE_SERVICE_URL);
	url.searchParams.set("os", goOS);
	url.searchParams.set("arch", goArch);

	logger.debug(`Checking for latest cloudflared: ${url.toString()}`);

	let response: Response;
	try {
		response = await fetch(url.toString(), {
			headers: { "User-Agent": "wrangler" },
		});
	} catch {
		return null;
	}

	if (!response.ok) {
		return null;
	}

	const data = (await response.json()) as VersionResponse;

	if (data.error || !data.url || !data.version) {
		return data.version ? data : null;
	}

	return data;
}

/**
 * Query the Cloudflare update worker to get the latest cloudflared version info.
 *
 * The update worker doesn't have entries for every os/arch combination
 * (e.g. darwin/arm64 is missing even though the GitHub release exists).
 * When the primary query fails, we fall back to querying a known-working
 * combination (linux/amd64) to discover the latest version, then construct
 * the GitHub release URL directly.
 */
async function getLatestVersionInfo(): Promise<VersionResponse> {
	const goOS = getGoOS();
	const goArch = getGoArch();

	// Try the update worker for our exact platform first
	const primary = await queryUpdateService(goOS, goArch);
	if (primary && primary.url && primary.version) {
		return primary;
	}

	// Fallback: query a known-working combination to get the latest version,
	// then construct the GitHub download URL for our actual platform.
	logger.debug(
		`Update worker had no result for ${goOS}/${goArch}, falling back to GitHub release URL`
	);

	const fallback = await queryUpdateService("linux", "amd64");
	if (!fallback || !fallback.version) {
		throw new UserError(
			`[cloudflared] Failed to determine the latest cloudflared version.\n\n` +
				`The update service did not return results for ${goOS}/${goArch},\n` +
				`and the fallback query also failed.\n\n` +
				`You can manually install cloudflared from:\n` +
				`https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/`
		);
	}

	const version = fallback.version;
	const filename = getAssetFilename(goOS, goArch);
	const url = `${GITHUB_RELEASE_BASE}/${version}/${filename}`;
	const compressed = filename.endsWith(".tgz");

	return {
		url,
		version,
		checksum: "", // no checksum available for fallback URLs
		compressed,
		shouldUpdate: true,
		userMessage: "",
		error: "",
	};
}

/**
 * Get the directory where cloudflared binary should be cached.
 * Uses the resolved version so the cache is per-version.
 */
function getCacheDir(version: string): string {
	return join(homedir(), ".wrangler", "cloudflared", version);
}

/**
 * Get the expected path for the cloudflared binary within a version cache dir.
 */
export function getCloudflaredBinPath(version: string): string {
	const binName =
		process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
	return join(getCacheDir(version), binName);
}

/**
 * Check if cloudflared binary exists and is executable at a given path.
 */
function isBinaryExecutable(binPath: string): boolean {
	try {
		accessSync(binPath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate that a binary works correctly by running --version.
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
		errorMessage += `  1. Deleting the cache directory: rm -rf ~/.wrangler/cloudflared/\n`;
		errorMessage += `  2. Running the command again to re-download\n`;
		errorMessage += `  3. Manually installing cloudflared: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/\n`;
		errorMessage += `  4. Setting WRANGLER_CLOUDFLARED_PATH to point to your cloudflared binary`;

		throw new UserError(errorMessage);
	}
}

export function redactCloudflaredArgsForLogging(args: string[]): string[] {
	const redacted = [...args];
	for (let i = 0; i < redacted.length; i++) {
		const arg = redacted[i];
		if (arg === "--token" && i + 1 < redacted.length) {
			redacted[i + 1] = "[REDACTED]";
		}
		if (arg.startsWith("--token=")) {
			redacted[i] = "--token=[REDACTED]";
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

/**
 * Extract the version string from `cloudflared --version` output.
 * Output format: "cloudflared version 2025.7.0 (built 2025-07-03-1703 UTC)"
 * Returns null if the version cannot be parsed.
 */
function getInstalledVersion(binPath: string): string | null {
	try {
		const output = execFileSync(binPath, ["--version"], {
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 10000,
		}).toString();
		const match = output.match(/(\d+\.\d+\.\d+)/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

/**
 * Compare two cloudflared version strings (e.g. "2025.7.0" vs "2026.2.0").
 * Returns true if `installed` is older than `latest`.
 */
export function isVersionOutdated(installed: string, latest: string): boolean {
	const parse = (v: string) => v.split(".").map(Number);
	const [iYear, iMonth, iPatch] = parse(installed);
	const [lYear, lMonth, lPatch] = parse(latest);

	if (iYear !== lYear) {
		return iYear < lYear;
	}
	if (iMonth !== lMonth) {
		return iMonth < lMonth;
	}
	return iPatch < lPatch;
}

/**
 * Check if a PATH-installed cloudflared is outdated compared to the latest
 * version from the update worker. Logs a warning if outdated.
 * This runs asynchronously and never throws — it's purely advisory.
 */
async function warnIfOutdated(binPath: string): Promise<void> {
	try {
		const installed = getInstalledVersion(binPath);
		if (!installed) {
			return;
		}

		// Try our platform first, fall back to linux/amd64 (always available)
		const latest =
			(await queryUpdateService(getGoOS(), getGoArch())) ??
			(await queryUpdateService("linux", "amd64"));
		const latestVersion = latest?.version;
		if (!latestVersion) {
			return;
		}

		if (isVersionOutdated(installed, latestVersion)) {
			logger.warn(
				`Your cloudflared (${installed}) is outdated. Latest version is ${latestVersion}.\n` +
					`Update: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/`
			);
		}
	} catch (e) {
		logger.debug("Failed to check cloudflared version", e);
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
 * Download cloudflared binary using the version info from the update worker.
 */
async function downloadCloudflared(
	versionInfo: VersionResponse,
	binPath: string
): Promise<void> {
	const { url, version, checksum, compressed } = versionInfo;

	logger.log(`Downloading cloudflared ${version}...`);
	logger.debug(`Download URL: ${url}`);

	const cacheDir = dirname(binPath);
	mkdirSync(cacheDir, { recursive: true });

	let response: Response;
	try {
		response = await fetch(url, {
			headers: { "User-Agent": "wrangler" },
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
				`You can manually download cloudflared from:\n` +
				`https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/`
		);
	}

	try {
		if (compressed) {
			await downloadAndExtractTarball(response, checksum, binPath, cacheDir);
		} else {
			await downloadBinary(response, checksum, binPath);
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

	logger.log(`cloudflared ${version} installed`);
}

/**
 * Download and extract a tarball (for macOS)
 */
async function downloadAndExtractTarball(
	response: Response,
	expectedChecksum: string,
	binPath: string,
	cacheDir: string
): Promise<void> {
	const tempTarPath = join(cacheDir, "cloudflared.tgz");

	const buffer = Buffer.from(await response.arrayBuffer());
	if (expectedChecksum) {
		const actualSha256 = sha256Hex(buffer);
		if (actualSha256 !== expectedChecksum) {
			throw new UserError(
				`[cloudflared] SHA256 mismatch for downloaded cloudflared tarball.\n\n` +
					`Expected: ${expectedChecksum}\n` +
					`Actual:   ${actualSha256}`
			);
		}
	}
	writeFileSync(tempTarPath, buffer);

	try {
		execFileSync("tar", ["-xzf", tempTarPath, "-C", cacheDir], {
			stdio: ["pipe", "pipe", "pipe"],
		});

		const extractedPath = join(cacheDir, "cloudflared");
		if (extractedPath !== binPath && existsSync(extractedPath)) {
			renameSync(extractedPath, binPath);
		}
	} finally {
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
	expectedChecksum: string,
	binPath: string
): Promise<void> {
	const buffer = Buffer.from(await response.arrayBuffer());
	if (expectedChecksum) {
		const actualSha256 = sha256Hex(buffer);
		if (actualSha256 !== expectedChecksum) {
			throw new UserError(
				`[cloudflared] SHA256 mismatch for downloaded cloudflared binary.\n\n` +
					`Expected: ${expectedChecksum}\n` +
					`Actual:   ${actualSha256}`
			);
		}
	}
	writeFileAtomic(binPath, buffer);
}

/**
 * Get cloudflared binary path, installing if necessary.
 *
 * Resolution order:
 * 1. WRANGLER_CLOUDFLARED_PATH environment variable (user override)
 * 2. cloudflared in system PATH
 * 3. Cached binary in ~/.wrangler/cloudflared/{version}/
 * 4. Download latest from Cloudflare update worker
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
		await warnIfOutdated(pathBin);
		return pathBin;
	}

	// Query the update worker for the latest version
	const versionInfo = await getLatestVersionInfo();
	const binPath = getCloudflaredBinPath(versionInfo.version);

	// Check if this version is already cached and valid
	if (isBinaryExecutable(binPath)) {
		try {
			validateBinary(binPath);
			logger.debug(
				`Using cached cloudflared ${versionInfo.version}: ${binPath}`
			);
			return binPath;
		} catch (e) {
			logger.debug("Cached cloudflared failed validation; re-downloading", e);
			removeCloudflaredCache(versionInfo.version);
		}
	}

	// Prompt user before downloading
	const shouldDownload = await confirm(
		`cloudflared (${versionInfo.version}) is needed but not installed. Download to ${binPath}?`,
		{ defaultValue: true, fallbackValue: true }
	);
	if (!shouldDownload) {
		throw new UserError(
			`cloudflared is required to run this command.\n\n` +
				`You can install it manually from:\n` +
				`https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/\n\n` +
				`Then either add it to your PATH or set WRANGLER_CLOUDFLARED_PATH.`
		);
	}

	// Download cloudflared
	await downloadCloudflared(versionInfo, binPath);

	// Validate the downloaded binary
	validateBinary(binPath);

	return binPath;
}

/**
 * Spawn cloudflared process with automatic binary management
 */
export async function spawnCloudflared(
	args: string[],
	options?: { stdio?: "inherit" | "pipe"; env?: Record<string, string> }
): Promise<ChildProcess> {
	const binPath = await getCloudflaredPath();

	logger.debug(
		`Spawning cloudflared: ${binPath} ${redactCloudflaredArgsForLogging(args).join(" ")}`
	);

	const cloudflared = spawn(binPath, args, {
		stdio: options?.stdio ?? "inherit",
		env: options?.env ? { ...process.env, ...options.env } : undefined,
	});

	return cloudflared;
}

/**
 * Remove cached cloudflared binary for a specific version, or all versions.
 */
export function removeCloudflaredCache(version?: string): void {
	const cacheDir = version
		? getCacheDir(version)
		: join(homedir(), ".wrangler", "cloudflared");
	if (existsSync(cacheDir)) {
		rmSync(cacheDir, { recursive: true, force: true });
		logger.log(`Removed cloudflared cache: ${cacheDir}`);
	}
}
