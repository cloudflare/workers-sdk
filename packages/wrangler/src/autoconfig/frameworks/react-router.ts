import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class ReactRouter extends Framework {
	async configure({
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			// TODO
		}
		return {
			wranglerConfig: {
				main: "TODO",
				assets: {
					binding: "ASSETS",
					directory: "TODO",
				},
			},
		};
	}
}
