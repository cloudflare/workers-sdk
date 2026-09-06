const CONFIG_ENV_PREFIXES = ["npm_config_", "pnpm_config_"];

/**
 * Reduce a setting name to a spelling-insensitive identity, so that
 * `minimum-release-age`, `minimum_release_age` and `minimumReleaseAge` all
 * compare equal.
 */
function settingIdentity(name: string): string {
	return name.toLowerCase().replaceAll(/[-_]/g, "");
}

/**
 * The setting an environment variable configures, or `undefined` if it isn't a
 * package-manager config variable.
 */
function settingFromEnvKey(key: string): string | undefined {
	const lowerCased = key.toLowerCase();
	const prefix = CONFIG_ENV_PREFIXES.find((candidate) =>
		lowerCased.startsWith(candidate)
	);

	if (prefix === undefined) {
		return undefined;
	}

	return settingIdentity(lowerCased.slice(prefix.length));
}

/**
 * Copy `env`, replacing any inherited spelling of the given settings with a
 * single canonical variable per package manager.
 *
 * Every `pnpm run` script inherits the repository's own pnpm settings via
 * `npm_config_*` variables, which pnpm matches case-insensitively. Spreading
 * `process.env` and adding one spelling therefore leaves both in place, and
 * which one wins depends on the order of the environment block — not stable on
 * Windows, where it is sorted when a process is created. Removing every
 * spelling first avoids that.
 *
 * Settings are keyed by kebab-case name. Matching is exact but
 * spelling-insensitive, so overriding `minimum-release-age` leaves
 * `minimum-release-age-strict` alone; pass such settings explicitly.
 *
 * @param env the environment to copy, usually `process.env`
 * @param overrides settings to apply, keyed by kebab-case setting name
 * @returns the new environment, and the names of the variables that were removed
 */
export function overrideConfigEnv(
	env: NodeJS.ProcessEnv,
	overrides: Record<string, string>
): { env: NodeJS.ProcessEnv; removed: string[] } {
	const overriddenSettings = new Set(
		Object.keys(overrides).map((setting) => settingIdentity(setting))
	);

	const result: NodeJS.ProcessEnv = {};
	const removed: string[] = [];

	for (const [key, value] of Object.entries(env)) {
		const setting = settingFromEnvKey(key);

		if (setting !== undefined && overriddenSettings.has(setting)) {
			removed.push(key);
			continue;
		}

		result[key] = value;
	}

	for (const [setting, value] of Object.entries(overrides)) {
		// `npm_config_` is read by npm and pnpm 10, `pnpm_config_` by pnpm 11.
		const envKey = setting.replaceAll("-", "_");
		for (const prefix of CONFIG_ENV_PREFIXES) {
			result[`${prefix}${envKey}`] = value;
		}
	}

	return { env: result, removed };
}
