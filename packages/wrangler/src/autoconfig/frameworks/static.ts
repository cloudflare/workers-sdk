import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Static extends Framework {
	configure({ outputDir }: ConfigurationOptions): ConfigurationResults {
		return {
			wranglerConfig: {
				assets: {
					directory: outputDir,
				},
			},
			buildCommand: undefined,
		};
	}
}
