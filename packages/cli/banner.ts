import { stripVTControlCharacters } from "node:util";
import { getHideBanner } from "@cloudflare/workers-utils";
import chalk from "chalk";
import semiver from "semiver";
import supportsColor from "supports-color";
import { stdout } from "./streams";
import { updateCheck } from "./update-check";

const MIN_NODE_VERSION = "22.0.0";

// Grace period for a cached update-check result to settle. One event loop
// tick is enough for a /tmp readFile (<1 ms on SSD). On cache miss the
// timer fires and the banner prints instantly without blocking on the network.
const UPDATE_CHECK_GRACE_MS = 100;

// The PACKAGE_PRERELEASE_LABEL is provided at esbuild time as a `define` for beta releases.
// Otherwise it is left undefined, which signals that this isn't a prerelease
declare const PACKAGE_PRERELEASE_LABEL: string;

export interface BannerConfig {
	name: string;
	version: string;
	emoji: string;
	skipUpdateCheck?: boolean;
	upgradeInstruction?: (latestMajor: number) => string;
	write?: (msg: string) => void;
}

export async function printBanner(config: BannerConfig): Promise<void> {
	if (getHideBanner()) {
		return;
	}

	const write = config.write ?? ((msg: string) => stdout.write(msg + "\n"));

	let text =
		typeof PACKAGE_PRERELEASE_LABEL === "undefined"
			? ` ${config.emoji} ${config.name} ${config.version}`
			: ` ${config.emoji} ${config.name} ${config.version} (${chalk.blue(PACKAGE_PRERELEASE_LABEL)})`;
	let maybeNewVersion: string | undefined;
	if (!config.skipUpdateCheck) {
		// Race the update check against a short grace period. On a cache
		// hit the library's readFile I/O completes within the first event-
		// loop tick (<1 ms on SSD), so the result is almost always available.
		// On a cache miss or slow network the timer wins and the banner
		// prints immediately — no blocking.
		maybeNewVersion = await Promise.race([
			updateCheck(config.name, config.version),
			new Promise<undefined>((resolve) => {
				const timer = setTimeout(
					() => resolve(undefined),
					UPDATE_CHECK_GRACE_MS
				);
				timer.unref();
			}),
		]);
		if (maybeNewVersion !== undefined) {
			text += ` (update available ${chalk.green(maybeNewVersion)})`;
		}
	}

	write(
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
		write(
			`${config.name} requires at least Node.js v${MIN_NODE_VERSION}. You are using v${process.versions.node}. Please update your version of Node.js.`
		);
	}

	// Log a slightly more noticeable message if this is a major bump
	if (maybeNewVersion !== undefined && config.upgradeInstruction) {
		const currentMajor = parseInt(config.version.split(".")[0]);
		const newMajor = parseInt(maybeNewVersion.split(".")[0]);
		if (newMajor > currentMajor) {
			write(config.upgradeInstruction(newMajor));
		}
	}
}
