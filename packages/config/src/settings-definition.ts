import { DEFINITION } from "./definition";
import type { ConfigInput } from "./definition";
import type { SettingsConfig } from "./types";

/**
 * Authored settings config shape — {@link SettingsConfig} without the `type`
 * discriminant, which `defineSettings` injects.
 */
export type SettingsConfigInput = Omit<SettingsConfig, "type">;

/**
 * Declare shared settings.
 * Authored as a named `settings` export.
 */
export function defineSettings(config: ConfigInput<SettingsConfigInput>) {
	return { [DEFINITION]: { config, type: "settings" } };
}
