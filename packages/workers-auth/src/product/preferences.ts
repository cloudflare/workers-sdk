import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Persistent, user-level preferences for the authentication subsystem.
 *
 * Stored as `<global-config-path>/preferences.json` (always JSON, regardless of
 * the product's credential file format). The preference is only consulted when
 * the `CLOUDFLARE_AUTH_USE_KEYRING` environment variable is unset.
 */
export interface UserPreferences {
	/**
	 * When `true`, OAuth credentials are stored in the OS keychain rather than
	 * the plaintext file. Set by `<cli> login --use-keyring` and cleared by
	 * `<cli> login --no-use-keyring`.
	 */
	keyring_enabled?: boolean;
}

/** Reads/writes for the {@link UserPreferences} file. */
export interface Preferences {
	readUserPreferences: () => UserPreferences;
	updateUserPreferences: (update: Partial<UserPreferences>) => void;
}

/**
 * Build the preferences accessor for a product, bound to its global config
 * directory. The path is resolved lazily on every call so `runInTempDir()`
 * fixtures (which re-stub `HOME` / `XDG_CONFIG_HOME`) isolate preferences.
 */
export function createPreferences(getConfigPath: () => string): Preferences {
	function getUserPreferencesPath(): string {
		return path.resolve(getConfigPath(), "preferences.json");
	}

	function readUserPreferences(): UserPreferences {
		try {
			const raw = readFileSync(getUserPreferencesPath(), "utf8");
			const parsed = JSON.parse(raw) as unknown;
			if (typeof parsed === "object" && parsed !== null) {
				return parsed as UserPreferences;
			}
			return {};
		} catch {
			return {};
		}
	}

	function updateUserPreferences(update: Partial<UserPreferences>): void {
		const current = readUserPreferences();
		const next: UserPreferences = { ...current, ...update };
		const filePath = getUserPreferencesPath();
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, JSON.stringify(next, null, "\t"), {
			encoding: "utf-8",
		});
	}

	return { readUserPreferences, updateUserPreferences };
}
