import { AutoConfigFrameworkConfigurationError } from "../errors";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

/**
 * A Hono app runs on Workers through its own Worker entry point, which only a project that
 * already deploys with Wrangler has. Such a project needs no setup: the Wrangler migration
 * brings its entry point and build settings over to cf.
 */
export class Hono extends Framework {
	configure({ wranglerConfig }: ConfigurationOptions): ConfigurationResults {
		if (wranglerConfig === undefined) {
			throw new AutoConfigFrameworkConfigurationError(
				"cf can only set up Hono projects that already deploy with a Wrangler configuration file. To deploy this project, export the Hono app from a Worker entry point and set it as the `entrypoint` in `cloudflare.config.ts`.",
				{ telemetryMessage: "autoconfig hono wrangler config missing" }
			);
		}

		return { workerConfig: {} };
	}
}
