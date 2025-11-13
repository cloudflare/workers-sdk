import { Framework } from ".";
import type { ConfigurationOptions } from ".";
import type { RawConfig } from "@cloudflare/workers-utils";

export class Static extends Framework {
	name: string;
	constructor(name: string) {
		super();
		this.name = name ?? "static";
	}

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
