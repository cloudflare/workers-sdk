import { printBanner } from "@cloudflare/cli-shared-helpers/banner";
import { name as wranglerName, version as wranglerVersion } from "../package.json";
import { logger } from "./logger";

export async function printWranglerBanner(performUpdateCheck = true) {
	await printBanner({
		name: wranglerName,
		version: wranglerVersion,
		emoji: "⛅️",
		skipUpdateCheck: !performUpdateCheck,
		// Route through wrangler's logger (which calls `console.log`)
		// so the banner is captured by snapshot tests that mock
		// `console.log` via `mockConsoleMethods`.
		write: (msg) => logger.log(msg),
		upgradeInstruction: (newMajor) =>
			`The version of Wrangler you are using is now out-of-date.
Please update to the latest version to prevent critical errors.
Run \`npm install --save-dev wrangler@${newMajor}\` to update to the latest version.
After installation, run Wrangler with \`npx wrangler\`.`,
	});
}
