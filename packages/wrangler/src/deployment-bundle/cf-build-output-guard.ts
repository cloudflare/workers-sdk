import * as fs from "node:fs";
import * as path from "node:path";
import { BUILD_OUTPUT_ROOT } from "@cloudflare/build-output-utils";
import { UserError } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils";

const CF_DOCS_URL = "https://developers.cloudflare.com/cf/";

/** Wrangler commands that refuse to deploy Cloudflare Build Output. */
export type GuardedCommand = "deploy" | "versions upload" | "preview";

/** The `cf` command that does the same job as each guarded Wrangler command. */
const CF_EQUIVALENT: Record<GuardedCommand, string> = {
	deploy: "cf deploy",
	"versions upload": "cf workers versions create",
	preview: "cf previews deploy",
};

interface ProjectSelection {
	config: Pick<Config, "userConfigPath">;
	/** The `--config` argument, when the user passed one. */
	explicitConfigPath: string | undefined;
	/** The resolved script argument, when the command received one. */
	scriptPath: string | undefined;
}

/**
 * The directories that may hold the project being deployed.
 *
 * A build writes Build Output to its own working directory, so the
 * configuration's location does not find it. Instead this mirrors
 * `resolveWranglerConfigPath`: the project starts at the directory the command
 * selected — `--config`, else the script argument, else the working directory
 * — and its configuration may sit there or in a parent.
 *
 * `userConfigPath` rather than `configPath`, because a config redirect points
 * the latter at a build directory.
 */
function getProjectRoots({
	config,
	explicitConfigPath,
	scriptPath,
}: ProjectSelection): string[] {
	const selected = explicitConfigPath ?? scriptPath;
	const leaf = selected !== undefined ? path.dirname(selected) : ".";

	const leafRoot = path.resolve(leaf);
	const configRoot = path.resolve(path.dirname(config.userConfigPath ?? leaf));

	return leafRoot === configRoot ? [leafRoot] : [leafRoot, configRoot];
}

/**
 * Matches Build Output version directory names such as `v0`, `v1` and `v12`.
 * The `.cloudflare/output/v<N>/` convention is the only part of the Build
 * Output Specification that never changes between versions.
 */
const VERSION_DIRECTORY_PATTERN = /^v(0|[1-9]\d*)$/;

/**
 * Find a Cloudflare Build Output Specification directory in `projectRoot`.
 *
 * Requires a version directory such as `v1` rather than just the `output`
 * directory, so the `.cloudflare/types` directory Wrangler generates itself,
 * or an unrelated `output` folder, is not mistaken for Build Output. Any
 * version counts, so output left by an older or newer `cf` is still found.
 */
export function findCloudflareBuildOutput(
	projectRoot: string
): string | undefined {
	const buildOutputDir = path.resolve(projectRoot, BUILD_OUTPUT_ROOT);
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(buildOutputDir, { withFileTypes: true });
	} catch {
		// Usually just absent. An unreadable path is treated the same way, so a
		// filesystem error cannot block a deployment.
		return undefined;
	}

	// A symlink counts too, matching the Build Output reader, so linked output
	// still stops the deployment.
	return entries.some(
		(entry) =>
			(entry.isDirectory() || entry.isSymbolicLink()) &&
			VERSION_DIRECTORY_PATTERN.test(entry.name)
	)
		? buildOutputDir
		: undefined;
}

/**
 * Stop a deployment started against Cloudflare Build Output, which belongs to
 * the `cf` CLI. Must be called before any remote mutation.
 *
 * @throws {UserError} When Build Output is present.
 */
export function assertNoCloudflareBuildOutput(
	selection: ProjectSelection,
	commandName: GuardedCommand
): void {
	for (const projectRoot of getProjectRoots(selection)) {
		const buildOutputDir = findCloudflareBuildOutput(projectRoot);
		if (buildOutputDir === undefined) {
			continue;
		}

		// Relative to the working directory, so the message names the directory
		// the user can act on. Separators are normalised to read the same on
		// every platform.
		const location =
			path.relative(process.cwd(), buildOutputDir).split(path.sep).join("/") ||
			BUILD_OUTPUT_ROOT;

		throw new UserError(
			`It looks like you've run \`wrangler ${commandName}\` in a project that builds for the Cloudflare CLI (\`cf\`).\n` +
				`Cloudflare Build Output was found at \`${location}\`. Deploying it with Wrangler reads a different configuration, so it may target the wrong Worker.\n` +
				`Please run \`${CF_EQUIVALENT[commandName]}\` instead.\n` +
				`If that directory is left over from an earlier build, delete it and run \`wrangler ${commandName}\` again.\n` +
				`See ${CF_DOCS_URL} for more information.`,
			{
				telemetryMessage: `${commandName} run against cloudflare build output`,
			}
		);
	}
}
