import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";

/**
 * Persistent, user-level preferences for the authentication subsystem.
 *
 * Stored alongside `metrics.json` and the auth TOML inside
 * `<global-wrangler-config-path>/preferences.json`. The preference is only
 * consulted when the `CLOUDFLARE_AUTH_USE_KEYRING` environment variable is unset.
 */
export interface UserPreferences {
	/**
	 * When `true`, OAuth credentials are stored in the OS keychain rather than
	 * the legacy plaintext TOML file. Set by `wrangler login --use-keyring` and
	 * cleared by `wrangler login --no-use-keyring`.
	 */
	keyring_enabled?: boolean;
}

/**
 * Path to the user preferences file. Sibling of `metrics.json` so that
 * `runInTempDir()` test fixtures (which override `HOME` / `XDG_CONFIG_HOME`)
 * isolate preferences alongside the auth TOML.
 */
function getUserPreferencesPath(): string {
	return path.resolve(getGlobalWranglerConfigPath(), "preferences.json");
}

/**
 * Read the persistent user preferences file.
 *
 * Returns an empty object when the file does not exist or cannot be parsed,
 * so callers can treat "no preferences set yet" identically to "all defaults".
 */
export function readUserPreferences(): UserPreferences {
	try {
		const raw = readFileSync(getUserPreferencesPath(), "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null) {
			return parsed as UserPreferences;
		}
		return {};
	} catch {
		return {};
	}
}

/**
 * Persist a partial update to the user preferences file.
 *
 * Merges with the existing file contents so unrelated keys are preserved.
 */
export function updateUserPreferences(update: Partial<UserPreferences>): void {
	const current = readUserPreferences();
	const next: UserPreferences = { ...current, ...update };
	const filePath = getUserPreferencesPath();
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, JSON.stringify(next, null, "\t"), {
		encoding: "utf-8",
	});
}
