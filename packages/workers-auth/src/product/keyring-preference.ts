import { existsSync } from "node:fs";
import {
	getEncryptedAuthConfigFilePath,
	scrubEncryptedCredentials,
} from "../credential-store";
import { getCloudflareAuthUseKeyringFromEnv } from "../env-vars";
import { validateProfileName } from "../profiles";
import { createCloudflareProfileStore } from "./profile-store";
import type { OAuthFlowContext } from "../context";
import type { CredentialStore } from "../credential-store";
import type { FileFormat } from "../file-format";
import type { Preferences } from "./preferences";

/**
 * Result of {@link KeyringPreference.setKeyringPreference}: the preference
 * actually persisted, which can differ from the requested value when enabling
 * was rolled back because the keyring backend isn't usable on this host.
 */
export interface SetKeyringPreferenceResult {
	enabled: boolean;
}

/** Consumer primitives {@link KeyringPreference.setKeyringPreference} needs. */
export interface KeyringPreferenceContext {
	logger: OAuthFlowContext["logger"];
	/** The currently-active credential store for the active profile. */
	getCredentialStore: () => CredentialStore;
}

/** Product deps for {@link createKeyringPreference}. */
export interface KeyringPreferenceDeps {
	cliName: string;
	keyringServiceName: string;
	getConfigPath: () => string;
	format: FileFormat;
	preferences: Preferences;
}

export interface KeyringPreference {
	setKeyringPreference: (
		enabled: boolean,
		ctx: KeyringPreferenceContext
	) => SetKeyringPreferenceResult;
}

/**
 * Build the keyring-storage preference manager for a product.
 *
 * The returned `setKeyringPreference` is shared by `<cli> auth keyring
 * enable|disable` and the `<cli> login --use-keyring` / `--no-use-keyring`
 * flags so both behave identically.
 */
export function createKeyringPreference(
	deps: KeyringPreferenceDeps
): KeyringPreference {
	const { cliName, keyringServiceName, getConfigPath, format, preferences } =
		deps;
	const { readUserPreferences, updateUserPreferences } = preferences;

	function describeProfile(profile: string | undefined): string {
		return profile ?? "default";
	}

	/**
	 * The profiles whose credentials are currently stored encrypted (have a
	 * `.enc` file on disk): the default profile (as `undefined`) plus any named
	 * profiles.
	 */
	function listEncryptedProfiles(
		logger: OAuthFlowContext["logger"]
	): Array<string | undefined> {
		const encrypted: Array<string | undefined> = [];

		if (existsSync(getEncryptedAuthConfigFilePath(getConfigPath()))) {
			encrypted.push(undefined);
		}

		const profileStore = createCloudflareProfileStore({
			logger,
			getConfigPath,
			keyringServiceName,
			format,
		});
		for (const name of profileStore.configs.list()) {
			try {
				validateProfileName(name);
			} catch {
				continue;
			}
			if (existsSync(getEncryptedAuthConfigFilePath(getConfigPath(), name))) {
				encrypted.push(name);
			}
		}

		return encrypted;
	}

	/**
	 * Scrub the encrypted credentials (`.enc` file + keyring entry) for every
	 * profile currently stored encrypted. Used when keyring storage is disabled
	 * globally so no encrypted secrets or keyring entries are left orphaned.
	 */
	function scrubAllEncryptedProfiles(logger: OAuthFlowContext["logger"]): void {
		const encryptedProfiles = listEncryptedProfiles(logger);
		if (encryptedProfiles.length === 0) {
			return;
		}

		const cleared: string[] = [];
		const unreachable: string[] = [];
		for (const profile of encryptedProfiles) {
			try {
				const { backendAvailable } = scrubEncryptedCredentials({
					serviceName: keyringServiceName,
					configPath: getConfigPath(),
					profile,
					format,
				});
				cleared.push(describeProfile(profile));
				if (!backendAvailable) {
					unreachable.push(describeProfile(profile));
				}
			} catch (e) {
				logger.warn(
					`Failed to remove encrypted credentials for profile "${describeProfile(profile)}": ${
						e instanceof Error ? e.message : String(e)
					}. You may need to clear them manually.`
				);
			}
		}

		if (cleared.length > 0) {
			logger.log(
				`Removed encrypted credentials for ${cleared
					.map((p) => `"${p}"`)
					.join(
						", "
					)}. Re-authenticate with \`${cliName} login\` (default profile) or \`${cliName} auth create <name>\` (named profiles).`
			);
		}
		if (unreachable.length > 0) {
			logger.warn(
				`The keyring backend was not reachable on this host, so the keyring entry for ${unreachable
					.map((p) => `"${p}"`)
					.join(", ")} could not be cleared. Clear it manually if it persists.`
			);
		}
	}

	function setKeyringPreference(
		enabled: boolean,
		ctx: KeyringPreferenceContext
	): SetKeyringPreferenceResult {
		const { logger, getCredentialStore } = ctx;
		const previouslyEnabled = readUserPreferences().keyring_enabled === true;
		const envOverride = getCloudflareAuthUseKeyringFromEnv();
		if (envOverride !== undefined && envOverride !== enabled) {
			logger.warn(
				`CLOUDFLARE_AUTH_USE_KEYRING=${envOverride} overrides ${
					enabled ? "enabling" : "disabling"
				} keyring storage for this command.`
			);
		}

		// Scrub on any disable, not just when the persisted preference was on:
		// a user who only ever opted in via `CLOUDFLARE_AUTH_USE_KEYRING=true`
		// (never persisting `keyring_enabled`) would otherwise leave orphaned
		// `.enc` files behind. `scrubAllEncryptedProfiles` is a no-op when no
		// encrypted profiles exist, so this is safe to run unconditionally.
		// Skipped only when the env var is *forcing keyring on for this session*
		// (`envOverride === true`): the subsequent login would re-create the
		// encrypted credentials we just scrubbed, so scrubbing would be churn —
		// the conflict warning above already told the user the env var wins.
		if (!enabled && envOverride !== true) {
			scrubAllEncryptedProfiles(logger);
		}

		updateUserPreferences({ keyring_enabled: enabled });

		if (enabled && envOverride !== false) {
			// Resolve the store eagerly so backend problems surface now. The
			// preference is persisted *before* validating (the resolver re-reads
			// it), so roll back if the keyring backend isn't usable here.
			try {
				const store = getCredentialStore();
				if (store.kind !== "encrypted-file") {
					updateUserPreferences({ keyring_enabled: previouslyEnabled });
					logger.warn(
						"Keyring storage isn't available on this host (see warning above), so it was not enabled. Try again once the keyring backend is reachable."
					);
				}
			} catch (e) {
				updateUserPreferences({ keyring_enabled: previouslyEnabled });
				throw e;
			}
		}

		return { enabled: readUserPreferences().keyring_enabled === true };
	}

	return { setKeyringPreference };
}
