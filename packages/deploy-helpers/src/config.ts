import {
	ConfigSchema as ConfigSchemaBase,
	convertToWranglerConfig as convertToWranglerConfigBase,
} from "@cloudflare/config/cf";
import type { RawConfig } from "@cloudflare/workers-utils";

type ConfigSchemaParseResult =
	| { success: true; data: unknown }
	| { success: false; error: unknown };

export const ConfigSchema: {
	parse(data: unknown): unknown;
	safeParse(data: unknown): ConfigSchemaParseResult;
} = ConfigSchemaBase;

export function convertToWranglerConfig(config: unknown): RawConfig {
	return convertToWranglerConfigBase(config as never);
}
