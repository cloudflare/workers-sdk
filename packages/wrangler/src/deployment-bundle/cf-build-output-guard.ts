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
 * The directories that may hold the project being deployed.
 *
 * Build Output is written to the working directory of the build that produced
 * it, independent of where the Wrangler configuration lives, so the
 * configuration alone does not locate it.
 *
 * With an explicit `--config` the user named the project, so only that
 * directory is relevant — unrelated Build Output beside the working directory
 * must not block it. Otherwise the configuration was discovered by searching
 * upwards and can belong to a parent, so both the working directory and the
 * configuration's directory can hold the project.
 *
 * @param config The configuration the command resolved.
 * @param explicitConfigPath The `--config` argument, when the user passed one.
 * @returns Absolute paths to inspect, without duplicates.
 */
function getProjectRoots(
	config: Pick<Config, "userConfigPath">,
	explicitConfigPath: string | undefined
): string[] {
	if (explicitConfigPath !== undefined) {
		return [path.resolve(path.dirname(explicitConfigPath))];
	}

	const workingDirectory = process.cwd();
	// `path.dirname(".")` resolves to the working directory, so a project with
	// no configuration file collapses to a single root.
	const configRoot = path.resolve(path.dirname(config.userConfigPath ?? "."));

	return configRoot === workingDirectory
		? [workingDirectory]
		: [workingDirectory, configRoot];
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
 * @param options.config The configuration the command resolved.
 * @param options.explicitConfigPath The `--config` argument, when the user passed one.
 * @param commandName The Wrangler command being guarded, e.g. `"deploy"`.
 * @throws {UserError} When Build Output is present.
 */
export function assertNoCloudflareBuildOutput(
	{
		config,
		explicitConfigPath,
	}: {
		config: Pick<Config, "userConfigPath">;
		explicitConfigPath: string | undefined;
	},
	commandName: string
): void {
	for (const projectRoot of getProjectRoots(config, explicitConfigPath)) {
		const buildOutputDir = findCloudflareBuildOutput(projectRoot);
		if (buildOutputDir === undefined) {
			continue;
		}

		// Reported relative to the working directory so the message names the
		// directory the user can act on, which is not `BUILD_OUTPUT_ROOT` when the
		// project lives elsewhere. Separators are normalised so the text reads the
		// same on every platform.
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
}
