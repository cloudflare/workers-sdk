import { Framework } from ".";
import type { ConfigurationOptions } from ".";
import type { RawConfig } from "@cloudflare/workers-utils";

export class Static extends Framework {
	configure({
		outputDir,
	}: ConfigurationOptions): Promise<RawConfig> | RawConfig {
		return {
			assets: {
				directory: outputDir,
			},
		};
	}
}
