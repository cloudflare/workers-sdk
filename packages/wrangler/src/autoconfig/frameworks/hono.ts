import { Framework } from ".";
import type { ConfigurationResults } from ".";

export class Hono extends Framework {
	async configure(): Promise<ConfigurationResults> {
		return {
			wranglerConfig: {},
		};
	}

	autoConfigSupported = false;
}
