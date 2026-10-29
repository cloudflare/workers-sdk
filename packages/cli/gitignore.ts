import { appendFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { readFileSync } from "@cloudflare/workers-utils";
import { brandColor, dim } from "./colors";
import { spinner } from "./interactive";

/**
 * Entries to add, on top of the Wrangler entries, to an `.assetsignore` file
 * in a project root that is used as the static assets directory.
 *
 * They mirror what a direct Cloudflare Pages upload skips (which the Workers
 * assets uploader does not), so that a project root deployed to Workers does
 * not publish its Pages Functions source, dependencies or git metadata, plus
 * `.npmrc`, which can hold registry credentials. As in Pages, `_worker.js`,
 * `_routes.json` and `functions` are only skipped at the root (so nested paths
 * such as `blog/functions/index.html` are still uploaded), while
 * `node_modules`, `.git` and `.DS_Store` are skipped at any depth.
 * `/_worker.js` must be listed because the presence of any `.assetsignore`
 * disables the error that otherwise stops a Pages `_worker.js` from being
 * uploaded as an asset.
 */
export const PROJECT_ROOT_ASSETS_IGNORE_ENTRIES = [
	"/_worker.js",
	"/_routes.json",
	"/functions",
	"node_modules",
	".git",
	".DS_Store",
	".npmrc",
] as const;

/**
 * Appends to a file that follows a .gitignore-like structure any missing
 * Wrangler-related entries (`.wrangler`, `.dev.vars*`, `.env*`, and their
 * negated example patterns).
 *
 * Creates the file if it does not already exist.
 *
 * @param filePath Absolute or relative path to the ignore file to update.
 * @param options
 * @param options.additionalEntries Further entries to append after the
 * Wrangler ones, each added only if it is not already an exact line in the
 * file or queued to be added.
 * @param options.requireEnvWildcard When `true`, only an existing `.env*` line
 * counts as covering environment files. Narrower patterns such as `.env` or
 * `.env.local` would leave other variants (for example `.env.production`)
 * unmatched, which matters for ignore files that keep files from being
 * published rather than from being committed.
 */
export function maybeAppendWranglerToGitIgnoreLikeFile(
	filePath: string,
	{
		additionalEntries = [],
		requireEnvWildcard = false,
	}: {
		additionalEntries?: readonly string[];
		requireEnvWildcard?: boolean;
	} = {}
): void {
	const filePreExisted = existsSync(filePath);

	if (!filePreExisted) {
		writeFileSync(filePath, "");
	}

	const existingGitIgnoreContent = readFileSync(filePath);
	const wranglerGitIgnoreFilesToAdd: string[] = [];

	const hasDotWrangler = existingGitIgnoreContent.match(
		/^\/?\.wrangler(\/|\s|$)/m
	);
	if (!hasDotWrangler) {
		wranglerGitIgnoreFilesToAdd.push(".wrangler");
	}

	const hasDotDevDotVars = existingGitIgnoreContent.match(
		/^\/?\.dev\.vars\*(\s|$)/m
	);
	if (!hasDotDevDotVars) {
		wranglerGitIgnoreFilesToAdd.push(".dev.vars*");
	}

	const hasDotDevVarsExample = existingGitIgnoreContent.match(
		/^!\/?\.dev\.vars\.example(\s|$)/m
	);
	if (!hasDotDevVarsExample) {
		wranglerGitIgnoreFilesToAdd.push("!.dev.vars.example");
	}

	/**
	 * We check for the following type of occurrences:
	 *
	 * ```
	 * .env
	 * .env*
	 * .env.<local|production|staging|...>
	 * .env*.<local|production|staging|...>
	 * ```
	 *
	 * Any of these may alone on a line or be followed by a space and a trailing comment:
	 *
	 * ```
	 * .env.<local|production|staging> # some trailing comment
	 * ```
	 *
	 * With `requireEnvWildcard`, only an unanchored `.env*` line counts, since
	 * `/.env*` would leave `.env` files in subdirectories unmatched.
	 */
	const hasDotEnv = existingGitIgnoreContent.match(
		requireEnvWildcard ? /^\.env\*(\s|$)/m : /^\/?\.env\*?(\..*?)?(\s|$)/m
	);
	if (!hasDotEnv) {
		wranglerGitIgnoreFilesToAdd.push(".env*");
	}

	const hasDotEnvExample = existingGitIgnoreContent.match(
		/^!\/?\.env\.example(\s|$)/m
	);
	if (!hasDotEnvExample) {
		wranglerGitIgnoreFilesToAdd.push("!.env.example");
	}

	const existingLines = new Set(
		existingGitIgnoreContent.split(/\r?\n/).map((line) => line.trim())
	);
	for (const entry of additionalEntries) {
		if (
			!existingLines.has(entry) &&
			!wranglerGitIgnoreFilesToAdd.includes(entry)
		) {
			wranglerGitIgnoreFilesToAdd.push(entry);
		}
	}

	if (wranglerGitIgnoreFilesToAdd.length === 0) {
		return;
	}

	const s = spinner();
	s.start(`Adding Wrangler files to the ${basename(filePath)} file`);

	const linesToAppend = [
		...(filePreExisted
			? ["", ...(!existingGitIgnoreContent.match(/\n\s*$/) ? [""] : [])]
			: []),
	];

	if (!hasDotWrangler && wranglerGitIgnoreFilesToAdd.length > 1) {
		linesToAppend.push("# wrangler files");
	}

	wranglerGitIgnoreFilesToAdd.forEach((line) => linesToAppend.push(line));

	linesToAppend.push("");

	appendFileSync(filePath, linesToAppend.join("\n"));

	const fileName = basename(filePath);

	s.stop(
		`${brandColor(filePreExisted ? "updated" : "created")} ${dim(
			`${fileName} file`
		)}`
	);
}

/**
 * Appends any missing Wrangler-related entries to the project's `.gitignore` file.
 *
 * Bails out only when *neither* a `.gitignore` file nor a `.git` directory exists,
 * which indicates the project is likely not targeting/using git. If either one is
 * present the entries are appended (creating `.gitignore` if needed).
 *
 * @param projectPath Root directory of the project.
 */
export function maybeAppendWranglerToGitIgnore(projectPath: string): void {
	const gitIgnorePath = `${projectPath}/.gitignore`;
	const gitIgnorePreExisted = existsSync(gitIgnorePath);
	const gitDirExists = directoryExists(`${projectPath}/.git`);

	if (!gitIgnorePreExisted && !gitDirExists) {
		// if there is no .gitignore file and neither a .git directory
		// then bail as the project is likely not targeting/using git
		return;
	}

	maybeAppendWranglerToGitIgnoreLikeFile(gitIgnorePath);
}

/**
 * Checks whether a directory exists at the given path.
 *
 * Returns `false` when the path does not exist (`ENOENT`). Re-throws any
 * other filesystem error.
 *
 * @param path Path to check
 * @returns `true` if a directory exists at `path`, `false` otherwise
 */
function directoryExists(path: string): boolean {
	try {
		const stat = statSync(path);
		return stat.isDirectory();
	} catch (error) {
		if ((error as { code: string }).code === "ENOENT") {
			return false;
		}
		throw new Error(error as string);
	}
}
