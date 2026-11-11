import { existsSync } from "node:fs";
import path from "node:path";
import {
	getCloudflareApiEnvironmentFromEnv,
	readFileSync,
} from "@cloudflare/workers-utils";
import { clearFile, writeFileAtomically } from "../core/atomic-write";
import { parseFile, stringifyFile } from "../core/file-format";
import { validateProfileName } from "../profiles";
import type { UserAuthConfig } from "../config-file/auth";
import type { FileFormat } from "../core/file-format";
import type { CredentialStore } from "./interface";

/**
 * Subdirectory under the global config path where auth files live.
 */
const USER_AUTH_CONFIG_PATH = "config";

/**
 * Resolve the on-disk base name (without extension) for an auth profile.
 *
 * This is the single authority shared by the plaintext-TOML store
 * ({@link getAuthConfigFilePath}), the encrypted store
 * (`getEncryptedAuthConfigFilePath`), and the keyring account name
 * (`getKeyringAccountName`) so all three stay in lock-step for a given
 * profile.
 *
 * - The default profile (`undefined` or `"default"`) follows the
 *   environment-based layout: `default` in production, or the environment
 *   name (`staging`, etc.) otherwise, so production and staging credentials
 *   coexist.
 * - A named profile uses the profile name verbatim. The name is validated
 *   here as a backstop (commands validate on the way in) before it reaches
 *   the filesystem / keyring.
 */
export function resolveAuthProfileBaseName(profile?: string): string {
	if (profile === undefined || profile === "default") {
		const environment = getCloudflareApiEnvironmentFromEnv();
		return environment === "production" ? "default" : environment;
	}
	validateProfileName(profile);
	return profile;
}

/**
 * Absolute path to the plaintext TOML credentials file for the given auth
 * profile (defaulting to the active Cloudflare API environment's default
 * profile).
 *
 * `configPath` is the consumer's global config directory — the client (e.g.
 * wrangler, or a future `cf` CLI) owns where its config lives, so it is passed
 * in rather than resolved here. The environment is appended to the
 * default-profile filename so callers running with
 * `WRANGLER_API_ENVIRONMENT=staging` get a separate file from production; named
 * profiles get `<profile>.toml`. The path stays exposed so the migration code,
 * defensive scrubs on logout, and tests that assert against it can all point at
 * the same location as the {@link FileCredentialStore}.
 */
export function getAuthConfigFilePath(
	configPath: string,
	profile?: string,
	extension: string = "toml"
): string {
	return path.join(
		configPath,
		USER_AUTH_CONFIG_PATH,
		`${resolveAuthProfileBaseName(profile)}.${extension}`
	);
}

/**
 * The plaintext-TOML credentials store.
 *
 * Used as the default backend when the user hasn't opted into keyring
 * storage, and as the soft-fallback when keyring storage is requested
 * but a backend isn't available.
 */
export class FileCredentialStore implements CredentialStore {
	readonly kind = "file" as const;

	/**
	 * @param configPath consumer-provided global config directory (the CLI
	 * owns where its config lives, so workers-auth never resolves it itself).
	 * @param profile the auth profile (defaults to the active environment's
	 * default profile).
	 * @param format on-disk file format (defaults to TOML for wrangler's
	 * historical layout; cf and other CLIs pass JSON).
	 */
	constructor(
		private readonly configPath: string,
		private readonly profile?: string,
		private readonly format: FileFormat = "toml"
	) {}

	private filePath(): string {
		return getAuthConfigFilePath(this.configPath, this.profile, this.format);
	}

	read(): UserAuthConfig | undefined {
		const filePath = this.filePath();
		if (!existsSync(filePath)) {
			return undefined;
		}
		// If the parse throws we propagate the error so the user sees
		// the corruption rather than silently being treated as logged out.
		return parseFile(this.format, readFileSync(filePath)) as UserAuthConfig;
	}

	write(config: UserAuthConfig): void {
		const filePath = this.filePath();
		writeFileAtomically(filePath, stringifyFile(this.format, config));
	}

	clear(): boolean {
		return clearFile(this.filePath());
	}

	path(): string {
		return this.filePath();
	}

	describe(): string {
		return this.filePath();
	}
}
