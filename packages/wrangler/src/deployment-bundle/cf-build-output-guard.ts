import * as fs from "node:fs";
import * as path from "node:path";
import {
	BUILD_OUTPUT_ROOT,
	getRootConfigPath,
} from "@cloudflare/build-output-utils";
import { UserError } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

/** Documentation for the `cf` CLI, which owns Build Output deployments. */
const CF_DOCS_URL = "https://developers.cloudflare.com/cf/";

/**
 * The directory holding the project being deployed.
 *
 * This matches the `projectRoot` that `resolveEntryWithMain` derives, so the
 * guard inspects the project the command actually selected: `--config`, or a
 * configuration discovered from a script argument, can point outside the
 * working directory.
 *
 * `userConfigPath` rather than `configPath`, because a config redirect points
 * `configPath` at a build directory while the project — and so any Build
 * Output — stays where the user defined the Worker. With no configuration file
 * at all, `path.dirname(".")` resolves to the working directory.
 *
 * @param config The configuration the command resolved.
 * @returns Absolute path to the project root.
 */
function getProjectRoot(config: Pick<Config, "userConfigPath">): string {
	return path.resolve(path.dirname(config.userConfigPath ?? "."));
}

/**
 * Find a Cloudflare Build Output Specification directory in `projectRoot`.
 *
 * The check is deliberately assertive, mirroring `isOpenNextProject`: it
 * requires the versioned root config (`.cloudflare/output/<version>/config.json`)
 * rather than just a `.cloudflare` or `.cloudflare/output` directory. Wrangler
 * itself writes sibling `.cloudflare` subdirectories such as `.cloudflare/types`,
 * and a project may keep an unrelated `output` folder, so keying on a directory
 * name alone would report false positives.
 *
 * @param projectRoot Directory to inspect.
 * @returns Absolute path to the Build Output directory, or `undefined` when the
 * project does not contain one.
 */
export function findCloudflareBuildOutput(
	projectRoot: string
): string | undefined {
	try {
		if (!fs.statSync(getRootConfigPath(projectRoot)).isFile()) {
			return undefined;
		}
	} catch {
		// A missing path is the common case. An unreadable one (EACCES, ELOOP, a
		// name too long for the platform) is treated the same way: an unrelated
		// filesystem error must never block a deployment.
		return undefined;
	}

	return path.resolve(projectRoot, BUILD_OUTPUT_ROOT);
}

/**
 * Stop a deployment that was started against Cloudflare Build Output.
 *
 * Build Output is produced for deployment through the `cf` CLI. Deploying it
 * with Wrangler reads a different configuration, so it can target the wrong
 * Worker or fail in ways that do not explain themselves. Callers must invoke
 * this before any remote mutation.
 *
 * @param config The configuration the command resolved, used to locate the project.
 * @param commandName The Wrangler command being guarded, e.g. `"deploy"`.
 * @throws {UserError} When Build Output is present.
 */
export function assertNoCloudflareBuildOutput(
	config: Pick<Config, "userConfigPath">,
	commandName: string
): void {
	const buildOutputDir = findCloudflareBuildOutput(getProjectRoot(config));
	if (buildOutputDir === undefined) {
		return;
	}

	// Reported relative to the working directory so the message names the
	// directory the user can act on, which is not `BUILD_OUTPUT_ROOT` when the
	// selected project lives elsewhere. Separators are normalised so the text
	// reads the same on every platform.
	const location =
		path.relative(process.cwd(), buildOutputDir).split(path.sep).join("/") ||
		BUILD_OUTPUT_ROOT;

	throw new UserError(
		`It looks like you've run \`wrangler ${commandName}\` in a project that builds for the Cloudflare CLI (\`cf\`).\n` +
			`Cloudflare Build Output was found at \`${location}\`. Deploying it with Wrangler reads a different configuration, so it may target the wrong Worker.\n` +
			"Please run `cf deploy` instead.\n" +
			`If that directory is left over from an earlier build, delete it and run \`wrangler ${commandName}\` again.\n` +
			`See ${CF_DOCS_URL} for more information.`,
		{
			telemetryMessage: `${commandName} run against cloudflare build output`,
		}
	);
}
