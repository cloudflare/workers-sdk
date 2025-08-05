import module from "node:module";
import { configFileName } from "../config";
import { logger } from "../logger";
import type { Config } from "../config";

/**
 * Returns the compatibility date to use in development.
 *
 * When no compatibility date is configured, uses the installed Workers runtime's latest supported date.
 *
 * @param config wrangler configuration
 * @param compatibilityDate configured compatibility date
 * @returns the compatibility date to use in development
 */
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
	const workerdDate = miniflareWorkerd.compatibilityDate;

	if (config.configPath !== undefined && compatibilityDate === undefined) {
		logger.warn(
			`No compatibility_date was specified. Using the installed Workers runtime's latest supported date: ${workerdDate}.\n` +
				`❯❯ Add one to your ${configFileName(config.configPath)} file: compatibility_date = "${workerdDate}", or\n` +
				`❯❯ Pass it in your terminal: wrangler dev [<SCRIPT>] --compatibility-date=${workerdDate}\n\n` +
				"See https://developers.cloudflare.com/workers/platform/compatibility-dates/ for more information."
		);
	}
	return compatibilityDate ?? workerdDate;
}

/**
 * Returns the date formatted as a compatibility date
 *
 * @param date
 * @returns The date as a `YYYY-MM-DD` string
 */
export function formatCompatibilityDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
