import { existsSync } from "node:fs";
import {
	getCloudflareAuthUseKeyringFromEnv,
	scrubEncryptedCredentials,
	validateProfileName,
} from "@cloudflare/workers-auth";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { getEncryptedAuthConfigFilePath } from "./auth-config-file";
import { readUserPreferences, updateUserPreferences } from "./preferences";
import { createWranglerProfileStore } from "./profile-store";
import { getCredentialStore, WRANGLER_KEYRING_SERVICE_NAME } from "./user";

/**
 * Result of {@link setKeyringPreference}: the preference actually persisted,
 * which can differ from the requested value when enabling was rolled back
 * because the keyring backend isn't usable on this host.
 */
export interface SetKeyringPreferenceResult {
	enabled: boolean;
}

/**
 * Render a profile for user-facing messages (`undefined` is the default
 * profile).
 */
function describeProfile(profile: string | undefined): string {
	return profile ?? "default";
}

/**
 * The profiles whose credentials are currently stored encrypted (have a `.enc`
 * file on disk): the default profile (as `undefined`) plus any named profiles.
 *
 * `configs.list()` also returns the default profile's on-disk base name
 * (`default`, or the API-environment name such as `staging`), which is a
 * reserved name that `validateProfileName` rejects — that's how named profiles
 * are separated from the default profile here (the default profile is handled
 * explicitly as `undefined`).
 */
function listEncryptedProfiles(): Array<string | undefined> {
	const encrypted: Array<string | undefined> = [];

	if (existsSync(getEncryptedAuthConfigFilePath())) {
		encrypted.push(undefined);
	}

	for (const name of createWranglerProfileStore().configs.list()) {
		try {
			validateProfileName(name);
		} catch {
			continue;
		}
		if (existsSync(getEncryptedAuthConfigFilePath(name))) {
			encrypted.push(name);
		}
	}

	return encrypted;
}

/**
 * Scrub the encrypted credentials (`.enc` file + keyring entry) for every
 * profile currently stored encrypted. Used when keyring storage is disabled
 * globally so no encrypted secrets or keyring entries are left orphaned.
 *
 * Credentials are removed rather than decrypted to a plaintext file: writing
 * plaintext on opt-out would defeat the at-rest protection the user is
 * disabling. The next `wrangler login` / `wrangler auth create` writes fresh
 * plaintext credentials.
 */
function scrubAllEncryptedProfiles(): void {
	const encryptedProfiles = listEncryptedProfiles();
	if (encryptedProfiles.length === 0) {
		return;
	}

	const cleared: string[] = [];
	const unreachable: string[] = [];
	for (const profile of encryptedProfiles) {
		try {
			const { backendAvailable } = scrubEncryptedCredentials({
				serviceName: WRANGLER_KEYRING_SERVICE_NAME,
				configPath: getGlobalConfigPath(),
				profile,
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
				)}. Re-authenticate with \`wrangler login\` (default profile) or \`wrangler auth create <name>\` (named profiles).`
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

/**
 * Apply and persist the global keyring-storage preference (`keyring_enabled`
 * in the user preferences file).
 *
 * Shared by `wrangler auth keyring enable|disable` and the
 * `wrangler login --use-keyring` / `--no-use-keyring` flags so both behave
 * identically:
 *
 * - Warns when `CLOUDFLARE_AUTH_USE_KEYRING` is set and disagrees with the
 *   requested value (the env var wins for the current process).
 * - On disable, scrubs every profile's encrypted credentials + keyring entry
 *   so nothing is left orphaned.
 * - On enable, eagerly resolves the credential store so platform/backend
 *   issues (Windows binding install, Linux missing `secret-tool`, ...) surface
 *   immediately, rolling the persisted preference back if the keyring backend
 *   isn't actually usable on this host.
 *
 * Does not print an enable/disable confirmation — the caller owns that
 * messaging so `wrangler login` output stays focused on the login flow.
 *
 * @returns the preference actually persisted (may differ from `enabled` when
 * enabling was rolled back).
 */
export function setKeyringPreference(
	enabled: boolean
): SetKeyringPreferenceResult {
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
		scrubAllEncryptedProfiles();
	}

	updateUserPreferences({ keyring_enabled: enabled });

	if (enabled && envOverride !== false) {
		// Resolve the store eagerly so backend problems surface now. The
		// preference is persisted *before* validating (the resolver re-reads
		// it), so roll back if the keyring backend isn't usable here.
		//
		// Skipped when `CLOUDFLARE_AUTH_USE_KEYRING=false`: the resolver then
		// short-circuits to the file store unconditionally, which would always
		// trip the `kind !== "encrypted-file"` check and roll back the
		// persisted preference with a misleading warning. The env var only
		// governs the current process; future commands re-resolve normally.
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
