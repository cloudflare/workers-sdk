import type { RawConfig } from "@cloudflare/workers-utils";

export abstract class Framework {
	abstract name: string;

	/** Some frameworks (i.e. Nuxt) don't need additional configuration */
	get configured() {
		return false;
	}

	abstract configure(outputDir: string): Promise<RawConfig> | RawConfig;
}
