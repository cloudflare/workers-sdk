import { getPackageManager } from "../../package-manager";
import { Framework } from ".";
import type { ConfigurationResults } from ".";

export class Hono extends Framework {
	async configure(): Promise<ConfigurationResults> {
		const { type: npm } = await getPackageManager();
		return {
			wranglerConfig: {},
			buildCommand: `${npm} run build`,
		};
	}

	autoConfigSupported = false;
}
