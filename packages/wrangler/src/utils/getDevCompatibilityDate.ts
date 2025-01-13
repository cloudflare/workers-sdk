import module from "node:module";
import { configFileName } from "../config";
import { logger } from "../logger";
import type { Config } from "../config";

export function getDevCompatibilityDate(
	config: Config,
	compatibilityDate = config.compatibility_date
): string {
	// Get the maximum compatibility date supported by the installed Miniflare
	const miniflareEntry = require.resolve("miniflare");
	const miniflareRequire = module.createRequire(miniflareEntry);
	const miniflareWorkerd = miniflareRequire("workerd") as {
		compatibilityDate: string;
	};
	const currentDate = miniflareWorkerd.compatibilityDate;

	if (config.configPath !== undefined && compatibilityDate === undefined) {
		logger.warn(
			`No compatibility_date was specified. Using the installed Workers runtime's latest supported date: ${currentDate}.\n` +
				`❯❯ Add one to your ${configFileName(config.configPath)} file: compatibility_date = "${currentDate}", or\n` +
				`❯❯ Pass it in your terminal: wrangler dev [<SCRIPT>] --compatibility-date=${currentDate}\n\n` +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
	}
	return compatibilityDate ?? currentDate;
}
