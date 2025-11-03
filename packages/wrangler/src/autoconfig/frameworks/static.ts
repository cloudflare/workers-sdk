import { Framework } from ".";
import type { RawConfig } from "@cloudflare/workers-utils";

export class Static extends Framework {
	name: string;
	constructor(name: string) {
		super();
		this.name = name ?? "static";
	}

	configure(outputDir: string): Promise<RawConfig> | RawConfig {
		return {
			assets: {
				directory: outputDir,
			},
		};
	}
}
