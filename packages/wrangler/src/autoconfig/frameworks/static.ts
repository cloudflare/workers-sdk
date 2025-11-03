import type { Framework } from ".";
import type { AutoConfigDetails } from "../types";
import type { RawConfig } from "@cloudflare/workers-utils";

export class Static implements Framework {
	constructor(public name: string) {}

	configure(options: AutoConfigDetails): Promise<RawConfig> | RawConfig {
		return {
			assets: {
				directory: options.outputDir,
			},
		};
	}
}
