import { Framework } from ".";
import type { ConfigurationResults } from ".";

export class Hono extends Framework {
	configure(): ConfigurationResults {
		return {
			wranglerConfig: {},
		};
	}

	autoConfigSupported = false;
}
