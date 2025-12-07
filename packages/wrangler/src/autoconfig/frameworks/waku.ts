import { Framework } from ".";
import type { ConfigurationOptions, ConfigurationResults } from ".";

export class Waku extends Framework {
	isConfigured(): boolean {
		// TODO
		return false;
	}

	async configure({
		dryRun,
	}: ConfigurationOptions): Promise<ConfigurationResults> {
		if (!dryRun) {
			// TODO
		}

		return {
			wranglerConfig: {
				// TODO
			},
		};
	}
}
