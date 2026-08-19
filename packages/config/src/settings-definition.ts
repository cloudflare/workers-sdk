import { DEFINITION } from "./definition";
import type { ConfigInput } from "./definition";
import type { SettingsConfig } from "./types";

/**
 * Authored settings config shape — {@link SettingsConfig} without the `type`
 * discriminant, which `defineSettings` injects.
 */
export type SettingsConfigInput = Omit<SettingsConfig, "type">;

/**
 * Shape of a settings definition. Carries the authored config (stored without
 * its `type` discriminant, which is stamped back on during resolution) under
 * the {@link DEFINITION} symbol.
 *
 * `defineSettings` declares this as its return type so that consumers can name
 * it when emitting declarations — an inferred return type would reference the
 * unexported {@link DEFINITION} symbol and fail with TS4023.
 */
export interface SettingsDefinition {
	[DEFINITION]: {
		config: ConfigInput<SettingsConfigInput>;
		type: "settings";
	};
}

/**
 * Declare shared settings.
 * Authored as a named `settings` export.
 *
 * @param config The authored settings, optionally as a promise or a function of the config context.
 * @returns A {@link SettingsDefinition} to be exported as `settings` from `cloudflare.config.ts`.
 */
export function defineSettings(
	config: ConfigInput<SettingsConfigInput>
): SettingsDefinition {
	return { [DEFINITION]: { config, type: "settings" } };
}
