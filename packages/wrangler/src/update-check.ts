import chalk from "chalk";
import supportsColor from "supports-color";
import checkForUpdate from "update-check";
import {
	name as wranglerName,
	version as wranglerVersion,
} from "../package.json";
import { logger } from "./logger";
import type { Result } from "update-check";

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

async function doUpdateCheck(): Promise<string | undefined> {
	let update: Result | null = null;
	// `check-update` only requires the name and version to check. This way we
	// don't have to bundle the entire `package.json` in the final build.
	const pkg = { name: wranglerName, version: wranglerVersion };
	try {
		// default cache for update check is 1 day
		update = await checkForUpdate(pkg, {
			distTag: pkg.version.startsWith("0.0.0") ? "beta" : "latest",
		});
	} catch (err) {
		// ignore error
	}
	return update?.latest;
}

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<string | undefined>;
export function updateCheck(): Promise<string | undefined> {
	return (updateCheckPromise ??= doUpdateCheck());
}
