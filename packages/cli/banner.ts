/**
 * Banner module — slim "name + version + underline" banner shared
 * across Cloudflare CLIs.
 *
 *     ⛅️ wrangler 4.86.0
 *     ──────────────────  (in Cloudflare Tangerine)
 *
 * Generalised from wrangler's original printWranglerBanner. Each CLI
 * supplies its own display name, version, and emoji glyph; the helper
 * handles update-check, prerelease label injection, the
 * `CLOUDFLARE_HIDE_BANNER` env var, and the Node-version warning.
 */

import { stripVTControlCharacters } from "node:util";
import { getHideBanner } from "@cloudflare/workers-utils";
import chalk from "chalk";
import semiver from "semiver";
import { brandColor, brandColorHex } from "./colors";
import { stdout } from "./streams";
import { updateCheck } from "./update-check";

const MIN_NODE_VERSION = "22.0.0";

// Grace period for a cached update-check result to settle. One event
// loop tick is enough for a /tmp readFile (<1ms on SSD). On cache miss
// the timer fires and the banner prints instantly without blocking on
// the network.
const UPDATE_CHECK_GRACE_MS = 100;

// Esbuild `define` globals for prerelease labels. Either may be
// substituted at the consumer's bundle time:
//
//   - `PACKAGE_PRERELEASE_LABEL` — preferred for any new CLI built
//     on cli-shared-helpers.
//   - `WRANGLER_PRERELEASE_LABEL` — supported as a back-compat alias
//     because wrangler's existing build pipeline already injects it.
//
// `typeof X === "undefined"` checks below handle the case where the
// consumer doesn't define one — the banner just omits the prerelease
// suffix in that case.
declare const PACKAGE_PRERELEASE_LABEL: string | undefined;
declare const WRANGLER_PRERELEASE_LABEL: string | undefined;

function resolvePrereleaseLabel(): string | undefined {
	if (typeof PACKAGE_PRERELEASE_LABEL !== "undefined") {
		return PACKAGE_PRERELEASE_LABEL;
	}
	if (typeof WRANGLER_PRERELEASE_LABEL !== "undefined") {
		return WRANGLER_PRERELEASE_LABEL;
	}
	return undefined;
}

export interface BannerConfig {
	/**
	 * Display name AND npm package name (used for update-check).
	 * E.g. "wrangler", "create-cloudflare".
	 */
	name: string;
	/** The current version string (typically read from the consumer's package.json). */
	version: string;
	/** Emoji or glyph shown before the name (e.g. "⛅️" for wrangler). */
	emoji: string;
	/**
	 * Optional template for the major-version-out-of-date warning.
	 * Receives the latest major version number; should return the full
	 * multi-line warning text. If omitted, no major-bump warning is shown.
	 */
	upgradeInstruction?: (latestMajor: number) => string;
	/**
	 * Disable the npm update check entirely (skip the network roundtrip
	 * and don't show "update available" or major-bump warnings).
	 */
	skipUpdateCheck?: boolean;
	/**
	 * Custom output sink. Defaults to writing through the
	 * cli-shared-helpers `stdout` stream (process.stdout in production).
	 * Wrangler routes through its `logger.log` so the banner is
	 * captured by tests that mock `console.log` (the long-standing
	 * test convention in wrangler).
	 */
	write?: (msg: string) => void;
}

/**
 * Print the CLI banner to stdout. Honours `CLOUDFLARE_HIDE_BANNER` /
 * `WRANGLER_HIDE_BANNER`. Optionally races an npm update check against
 * a 100ms grace period so a cache hit shows "update available" inline
 * but a cache miss never blocks the first paint.
 */
export async function printBanner(config: BannerConfig): Promise<void> {
	if (getHideBanner()) {
		return;
	}

	// Default to writing through the streams module so production
	// usage is unchanged. Consumers (wrangler) can pass `logger.log`
	// to keep the banner on the same channel as their other logger
	// output, which matters for snapshot tests that mock `console.log`.
	const write = config.write ?? ((msg: string) => stdout.write(msg + "\n"));

	const prereleaseLabel = resolvePrereleaseLabel();
	// Render order:
	//   ` <emoji> <bold-brand-name> <dim ·> <dim vX.Y.Z>`
	const name = brandColor.bold(config.name);
	const dot = chalk.dim("·");
	const ver = chalk.dim(`v${config.version}`);
	const prerelease =
		prereleaseLabel !== undefined ? ` (${chalk.blue(prereleaseLabel)})` : "";
	// No leading whitespace — the underline below starts at column 0 and
	// downstream gutter helpers (`▎ ...`, `◇ ...`) also start at column 0
	// so banner / heading / prompts share a left edge.
	let text = `${config.emoji} ${name} ${dot} ${ver}${prerelease}`;

	let maybeNewVersion: string | undefined;
	if (!config.skipUpdateCheck) {
		// Race the update check against a short grace period. On a cache
		// hit the library's readFile I/O completes within the first
		// event-loop tick (<1ms on SSD), so the result is almost always
		// available. On a cache miss or slow network the timer wins and
		// the banner prints immediately — no blocking.
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

	const colored = chalk.level > 0;
	const underline = colored
		? chalk.hex(brandColorHex)(
				"─".repeat(stripVTControlCharacters(text).length)
			)
		: "─".repeat(stripVTControlCharacters(text).length);

	write("\n" + text + "\n" + underline);

	if (semiver(process.versions.node, MIN_NODE_VERSION) < 0) {
		write(
			`${config.name} requires at least Node.js v${MIN_NODE_VERSION}. You are using v${process.versions.node}. Please update your version of Node.js.`
		);
	}

	// Slightly more noticeable warning on a major-version drift.
	if (
		maybeNewVersion !== undefined &&
		typeof config.upgradeInstruction === "function"
	) {
		const currentMajor = parseInt(config.version.split(".")[0]);
		const newMajor = parseInt(maybeNewVersion.split(".")[0]);
		if (newMajor > currentMajor) {
			write(config.upgradeInstruction(newMajor));
		}
	}
}
