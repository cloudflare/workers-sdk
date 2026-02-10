import { Framework } from ".";
import type { ConfigurationResults } from ".";

export class CloudflarePages extends Framework {
	async configure(): Promise<ConfigurationResults> {
		return {
			wranglerConfig: {},
		};
	}

	// Autoconfiguring a Pages project into a Workers one is not yet supported
	autoConfigSupported = false;
}
