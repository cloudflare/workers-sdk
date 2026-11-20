import { printBanner } from "@cloudflare/cli-shared-helpers/banner";
import { getHideBanner } from "@cloudflare/workers-utils";
import chalk from "chalk";
import {
	name as wranglerName,
	version as wranglerVersion,
} from "../package.json";
import { logger } from "./logger";
import { getActiveProfile, getAuthFromEnv } from "./user";

declare const WRANGLER_PRERELEASE_LABEL: string;

export async function printWranglerBanner(
	performUpdateCheck = true,
	showActiveProfile = true
) {
	if (getHideBanner()) {
		return;
	}
	await printBanner({
		name: wranglerName,
		version: wranglerVersion,
		emoji: "⛅️",
		prereleaseLabel:
			typeof WRANGLER_PRERELEASE_LABEL === "undefined"
				? undefined
				: WRANGLER_PRERELEASE_LABEL,
		skipUpdateCheck: !performUpdateCheck,
		// Route through wrangler's logger (which calls `console.log`)
		// so the banner is captured by snapshot tests that mock
		// `console.log` via `mockConsoleMethods`.
		write: (msg) => logger.log(msg),
		warn: (msg) => logger.warn(msg),
		upgradeInstruction: (newMajor) =>
			`The version of Wrangler you are using is now out-of-date.
Please update to the latest version to prevent critical errors.
Run \`npm install --save-dev wrangler@${newMajor}\` to update to the latest version.
After installation, run Wrangler with \`npx wrangler\`.`,
	});
	if (showActiveProfile && getAuthFromEnv() === undefined) {
		const profile = getActiveProfile();
		if (profile !== "default") {
			logger.log(`Active profile: ${chalk.blue(profile)}`);
		}
	}
}
