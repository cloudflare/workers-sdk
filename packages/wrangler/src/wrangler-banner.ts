import chalk from "chalk";
import supportsColor from "supports-color";
import { version as wranglerVersion } from "../package.json";
import { logger } from "./logger";
import { updateCheck } from "./update-check";

export async function printWranglerBanner(performUpdateCheck = true) {
	let text = ` ⛅️ wrangler ${wranglerVersion}`;
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
				? chalk.hex("#FF8800")("-".repeat(text.length))
				: "-".repeat(text.length)) +
			"\n"
	);

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
