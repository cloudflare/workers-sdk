import { FatalError } from "@cloudflare/workers-utils";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class NoOpFramework extends Framework {
	async configure({
		existingWorkerConfig,
	}: ConfigurationOptions): Promise<ConfigurationResults | null> {
		// Pages projects aren't supported yet, even with a Wrangler config
		if (existingWorkerConfig && this.id !== "cloudflare-pages") {
			return null;
		}
		throw new FatalError(
			this.id === "cloudflare-pages"
				? `The target project seems to be using Cloudflare Pages. Automatically migrating from a Pages project to Workers is not yet supported.`
				: `The detected framework ("${this.name}") cannot be automatically configured.`,
			{ telemetryMessage: "autoconfig run framework unsupported" }
		);
	}
}
