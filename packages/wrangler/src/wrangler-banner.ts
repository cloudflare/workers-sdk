import { stripVTControlCharacters } from "node:util";
import { getWranglerHideBanner } from "@cloudflare/workers-utils";
import chalk from "chalk";
import semiver from "semiver";
import supportsColor from "supports-color";
import { version as wranglerVersion } from "../package.json";
import { logger } from "./logger";
import { updateCheck } from "./update-check";

const MIN_NODE_VERSION = "20.0.0";

// The WRANGLER_PRERELEASE_LABEL is provided at esbuild time as a `define` for beta releases.
// Otherwise it is left undefined, which signals that this isn't a prerelease
declare const WRANGLER_PRERELEASE_LABEL: string;

export async function printWranglerBanner(performUpdateCheck = true) {
	if (getWranglerHideBanner()) {
		return;
	}

	let text =
		typeof WRANGLER_PRERELEASE_LABEL === "undefined"
			? ` ⛅️ wrangler ${wranglerVersion}`
			: ` ⛅️ wrangler ${wranglerVersion} (${chalk.blue(WRANGLER_PRERELEASE_LABEL)})`;
	let maybeNewVersion: string | undefined;
	if (performUpdateCheck) {
		maybeNewVersion = await updateCheck();
		if (maybeNewVersion !== undefined) {
			text += ` (update available ${chalk.green(maybeNewVersion)})`;
		}
	}

	logger.log(
		"\n" +
			text +
			"\n" +
			(supportsColor.stdout
				? chalk.hex("#FF8800")(
						"─".repeat(stripVTControlCharacters(text).length)
					)
				: "─".repeat(text.length))
	);

	if (semiver(process.versions.node, MIN_NODE_VERSION) < 0) {
		logger.warn(
			`Wrangler requires at least Node.js v${MIN_NODE_VERSION}. You are using v${process.versions.node}. Please update your version of Node.js.`
		);
	}

	// Log a slightly more noticeable message if this is a major bump
	if (maybeNewVersion !== undefined) {
		const currentMajor = parseInt(wranglerVersion.split(".")[0]);
		const newMajor = parseInt(maybeNewVersion.split(".")[0]);
		if (newMajor > currentMajor) {
			logger.warn(
				`The version of Wrangler you are using is now out-of-date.
Please update to the latest version to prevent critical errors.
Run \`npm install --save-dev wrangler@${newMajor}\` to update to the latest version.
After installation, run Wrangler with \`npx wrangler\`.`
			);
		}
	}
}
