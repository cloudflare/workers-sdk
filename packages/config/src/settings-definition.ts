import { createConfigDefiner } from "./definition";
import type { ConfigInput } from "./definition";
import type { SettingsConfig } from "./types";

export type SettingsConfigExport<T extends SettingsConfig = SettingsConfig> =
	ConfigInput<T>;

/**
 * Authored settings config shape — {@link SettingsConfig} without the `type`
 * discriminant, which `defineSettings` injects.
 */
export type SettingsConfigInput = Omit<SettingsConfig, "type">;

/**
 * Declare shared settings.
 * Authored as a named `settings` export.
 */
export const defineSettings = createConfigDefiner<
	SettingsConfigInput,
	"settings"
>("settings");
