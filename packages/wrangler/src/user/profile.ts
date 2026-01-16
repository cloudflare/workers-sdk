/**
 * Profile management for Wrangler multi-account support.
 *
 * Profiles allow users to store and switch between multiple user identities
 * (OAuth tokens or API tokens), enabling seamless work across different
 * Cloudflare user accounts without re-authenticating.
 *
 * File locations:
 * - Credentials (all profiles): ~/.wrangler/credentials
 * - Global current profile: ~/.wrangler/current-profile
 * - Project-level profile: .wrangler/profile (in project directory)
 * - Legacy OAuth (migrated): ~/.wrangler/config/default.toml
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import * as path from "node:path";
import {
	findWranglerConfig,
	getCloudflareApiEnvironmentFromEnv,
	getGlobalWranglerConfigPath,
	parseTOML,
} from "@cloudflare/workers-utils";
import TOML from "smol-toml";
import { logger } from "../logger";
import { getWranglerHiddenDirPath } from "../paths";
import type { Scope } from "./user";

// Profile name validation regex: alphanumeric, dash, underscore
const VALID_PROFILE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * A profile stores credentials for a single user identity.
 * Can contain either OAuth tokens or an API token.
 */
export interface Profile {
	/** OAuth access token */
	oauth_token?: string;
	/** OAuth refresh token */
	refresh_token?: string;
	/** OAuth token expiration time (ISO 8601) */
	expiration_time?: string;
	/** OAuth scopes granted */
	scopes?: string[];
	/** API token (alternative to OAuth) */
	api_token?: string;
	/** Default account ID for this profile */
	account_id?: string;
}

/**
 * The credentials file contains all profiles.
 * Each key is a profile name, value is the profile data.
 */
export interface CredentialsFile {
	[profileName: string]: Profile;
}

/**
 * Default profile name used when no profile is specified.
 */
export const DEFAULT_PROFILE_NAME = "default";

/**
 * Get the path to the credentials file.
 * Location: ~/.wrangler/credentials (no extension, like AWS CLI)
 */
export function getCredentialsFilePath(): string {
	return path.join(getGlobalWranglerConfigPath(), "credentials");
}

/**
 * Get the path to the global current-profile file.
 * Location: ~/.wrangler/current-profile
 */
export function getGlobalCurrentProfilePath(): string {
	return path.join(getGlobalWranglerConfigPath(), "current-profile");
}

/**
 * Get the path to the project-level profile file.
 * Location: .wrangler/profile (in project directory)
 */
export function getProjectProfilePath(projectRoot?: string): string {
	return path.join(getWranglerHiddenDirPath(projectRoot), "profile");
}

/**
 * Get the legacy auth config file path for migration.
 * Location: ~/.wrangler/config/default.toml (or staging.toml for staging env)
 */
export function getLegacyAuthConfigFilePath(): string {
	const environment = getCloudflareApiEnvironmentFromEnv();
	const fileName =
		environment === "production" ? "default.toml" : `${environment}.toml`;
	return path.join(getGlobalWranglerConfigPath(), "config", fileName);
}

/**
 * Validate a profile name.
 * Allowed characters: alphanumeric, dash (-), underscore (_)
 */
export function isValidProfileName(name: string): boolean {
	return VALID_PROFILE_NAME_REGEX.test(name);
}

/**
 * Read the credentials file.
 * Returns an empty object if the file doesn't exist.
 */
export function readCredentialsFile(): CredentialsFile {
	const credentialsPath = getCredentialsFilePath();

	if (!existsSync(credentialsPath)) {
		return {};
	}

	try {
		const content = readFileSync(credentialsPath, "utf-8");
		return parseTOML(content) as CredentialsFile;
	} catch (error) {
		logger.debug(`Failed to read credentials file: ${error}`);
		return {};
	}
}

/**
 * Write the credentials file.
 * Creates the directory if it doesn't exist.
 * Sets file permissions to 600 (user-readable only).
 */
export function writeCredentialsFile(credentials: CredentialsFile): void {
	const credentialsPath = getCredentialsFilePath();
	const credentialsDir = path.dirname(credentialsPath);

	mkdirSync(credentialsDir, { recursive: true });
	writeFileSync(credentialsPath, TOML.stringify(credentials), {
		encoding: "utf-8",
		mode: 0o600, // User-readable only
	});
}

/**
 * Get a specific profile from the credentials file.
 * Returns undefined if the profile doesn't exist.
 */
export function getProfile(profileName: string): Profile | undefined {
	const credentials = readCredentialsFile();
	return credentials[profileName];
}

/**
 * Save a profile to the credentials file.
 * Creates or updates the profile.
 */
export function saveProfile(profileName: string, profile: Profile): void {
	const credentials = readCredentialsFile();
	credentials[profileName] = profile;
	writeCredentialsFile(credentials);
}

/**
 * Delete a profile from the credentials file.
 * Returns true if the profile was deleted, false if it didn't exist.
 */
export function deleteProfile(profileName: string): boolean {
	const credentials = readCredentialsFile();
	if (!(profileName in credentials)) {
		return false;
	}
	delete credentials[profileName];
	writeCredentialsFile(credentials);
	return true;
}

/**
 * List all profile names in the credentials file.
 */
export function listProfiles(): string[] {
	const credentials = readCredentialsFile();
	return Object.keys(credentials);
}

/**
 * Read the global current profile name.
 * Returns undefined if not set.
 */
export function readGlobalCurrentProfile(): string | undefined {
	const profilePath = getGlobalCurrentProfilePath();

	if (!existsSync(profilePath)) {
		return undefined;
	}

	try {
		return readFileSync(profilePath, "utf-8").trim();
	} catch (error) {
		logger.debug(`Failed to read global current profile: ${error}`);
		return undefined;
	}
}

/**
 * Write the global current profile name.
 */
export function writeGlobalCurrentProfile(profileName: string): void {
	const profilePath = getGlobalCurrentProfilePath();
	const profileDir = path.dirname(profilePath);

	mkdirSync(profileDir, { recursive: true });
	writeFileSync(profilePath, profileName, { encoding: "utf-8" });
}

/**
 * Clear the global current profile.
 */
export function clearGlobalCurrentProfile(): void {
	const profilePath = getGlobalCurrentProfilePath();

	if (existsSync(profilePath)) {
		rmSync(profilePath);
	}
}

/**
 * Read the project-level profile name.
 * Returns undefined if not set or not in a wrangler project.
 */
export function readProjectProfile(projectRoot?: string): string | undefined {
	const profilePath = getProjectProfilePath(projectRoot);

	if (!existsSync(profilePath)) {
		return undefined;
	}

	try {
		return readFileSync(profilePath, "utf-8").trim();
	} catch (error) {
		logger.debug(`Failed to read project profile: ${error}`);
		return undefined;
	}
}

/**
 * Write the project-level profile name.
 * Creates the .wrangler directory if it doesn't exist.
 */
export function writeProjectProfile(
	profileName: string,
	projectRoot?: string
): void {
	const profilePath = getProjectProfilePath(projectRoot);
	const profileDir = path.dirname(profilePath);

	mkdirSync(profileDir, { recursive: true });
	writeFileSync(profilePath, profileName, { encoding: "utf-8" });
}

/**
 * Clear the project-level profile.
 * Returns true if the profile was cleared, false if it didn't exist.
 */
export function clearProjectProfile(projectRoot?: string): boolean {
	const profilePath = getProjectProfilePath(projectRoot);

	if (!existsSync(profilePath)) {
		return false;
	}

	rmSync(profilePath);
	return true;
}

/**
 * Check if the current directory is a wrangler project.
 * Returns true if wrangler.toml, wrangler.json, or wrangler.jsonc exists.
 */
export function isWranglerProject(projectRoot?: string): boolean {
	const { configPath } = findWranglerConfig(projectRoot ?? process.cwd());
	return configPath !== undefined;
}

/**
 * Migrate legacy auth config to the new credentials file.
 * Only migrates if the legacy file exists and credentials file doesn't have a default profile.
 *
 * @returns true if migration was performed, false otherwise
 */
export function migrateLegacyAuthConfig(): boolean {
	const legacyPath = getLegacyAuthConfigFilePath();

	// Check if legacy file exists
	if (!existsSync(legacyPath)) {
		return false;
	}

	// Check if we already have a default profile
	const credentials = readCredentialsFile();
	if (DEFAULT_PROFILE_NAME in credentials) {
		// Already migrated or user has set up default profile
		return false;
	}

	try {
		// Read legacy config
		const legacyContent = readFileSync(legacyPath, "utf-8");
		const legacyConfig = parseTOML(legacyContent) as Profile;

		// Only migrate if there's something to migrate
		if (!legacyConfig.oauth_token && !legacyConfig.api_token) {
			return false;
		}

		// Save as default profile
		credentials[DEFAULT_PROFILE_NAME] = {
			oauth_token: legacyConfig.oauth_token,
			refresh_token: legacyConfig.refresh_token,
			expiration_time: legacyConfig.expiration_time,
			scopes: legacyConfig.scopes,
			api_token: legacyConfig.api_token,
		};
		writeCredentialsFile(credentials);

		// Set current profile to default
		writeGlobalCurrentProfile(DEFAULT_PROFILE_NAME);

		logger.debug(
			`Migrated legacy auth config from ${legacyPath} to credentials file as '${DEFAULT_PROFILE_NAME}' profile`
		);

		return true;
	} catch (error) {
		logger.debug(`Failed to migrate legacy auth config: ${error}`);
		return false;
	}
}

/**
 * Get environment variable for profile selection.
 */
export function getProfileFromEnv(): string | undefined {
	return process.env.WRANGLER_PROFILE;
}

export interface ActiveProfileResult {
	/** The resolved profile name */
	name: string;
	/** How the profile was resolved */
	source: "cli" | "env" | "project" | "global" | "default";
}

/**
 * Resolve the active profile based on precedence.
 *
 * Precedence (highest to lowest):
 * 1. CLI flag (--profile)
 * 2. WRANGLER_PROFILE env var
 * 3. .wrangler/profile (project-level)
 * 4. ~/.wrangler/current-profile (global)
 * 5. "default" profile
 *
 * @param cliProfile - Profile specified via --profile CLI flag
 * @param projectRoot - Project root directory for project-level profile
 */
export function resolveActiveProfile(
	cliProfile?: string,
	projectRoot?: string
): ActiveProfileResult {
	// 1. CLI flag
	if (cliProfile) {
		return { name: cliProfile, source: "cli" };
	}

	// 2. WRANGLER_PROFILE env var
	const envProfile = getProfileFromEnv();
	if (envProfile) {
		return { name: envProfile, source: "env" };
	}

	// 3. Project-level profile
	const projectProfile = readProjectProfile(projectRoot);
	if (projectProfile) {
		return { name: projectProfile, source: "project" };
	}

	// 4. Global current profile
	const globalProfile = readGlobalCurrentProfile();
	if (globalProfile) {
		return { name: globalProfile, source: "global" };
	}

	// 5. Default profile
	return { name: DEFAULT_PROFILE_NAME, source: "default" };
}

/**
 * Check if file permissions are secure (user-readable only on Unix systems).
 * Returns true if secure or on Windows (where we can't easily check).
 */
export function checkCredentialsFilePermissions(): boolean {
	// Skip check on Windows
	if (process.platform === "win32") {
		return true;
	}

	const credentialsPath = getCredentialsFilePath();
	if (!existsSync(credentialsPath)) {
		return true;
	}

	try {
		const stats = statSync(credentialsPath);
		const mode = stats.mode & 0o777;

		// Check if group or others have any permissions
		if ((mode & 0o077) !== 0) {
			return false;
		}
		return true;
	} catch {
		return true;
	}
}

/**
 * Warn if credentials file permissions are too open.
 */
export function warnIfCredentialsInsecure(): void {
	if (!checkCredentialsFilePermissions()) {
		const credentialsPath = getCredentialsFilePath();
		logger.warn(
			`Warning: ${credentialsPath} is readable by others.\n` +
				`         Run: chmod 600 ${credentialsPath}`
		);
	}
}

/**
 * Convert a Profile to the legacy UserAuthConfig format for compatibility.
 */
export function profileToAuthConfig(profile: Profile): {
	oauth_token?: string;
	refresh_token?: string;
	expiration_time?: string;
	scopes?: string[];
	api_token?: string;
} {
	return {
		oauth_token: profile.oauth_token,
		refresh_token: profile.refresh_token,
		expiration_time: profile.expiration_time,
		scopes: profile.scopes,
		api_token: profile.api_token,
	};
}

/**
 * Convert OAuth auth tokens to a Profile for storage.
 */
export function authConfigToProfile(
	authConfig: {
		oauth_token?: string;
		refresh_token?: string;
		expiration_time?: string;
		scopes?: Scope[];
	},
	accountId?: string
): Profile {
	return {
		oauth_token: authConfig.oauth_token,
		refresh_token: authConfig.refresh_token,
		expiration_time: authConfig.expiration_time,
		scopes: authConfig.scopes,
		account_id: accountId,
	};
}
