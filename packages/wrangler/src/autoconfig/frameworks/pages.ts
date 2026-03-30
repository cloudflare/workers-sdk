import { Framework } from "./framework-class";
import type { ConfigurationResults } from "./framework-class";

export class CloudflarePages extends Framework {
	async configure(): Promise<ConfigurationResults> {
		return {
			wranglerConfig: {},
		};
	}
}
