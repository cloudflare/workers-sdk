import { appendFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { readFileSync } from "@cloudflare/workers-utils";
import { brandColor, dim } from "./colors";
import { spinner } from "./interactive";

/**
 * Appends to a file that follows a .gitignore-like structure any missing
 * Wrangler-related entries (`.wrangler`, `.dev.vars*`, `.env*`, and their
 * negated example patterns).
 *
 * Creates the file if it does not already exist.
 *
 * @param filePath Absolute or relative path to the ignore file to update.
 */
export function maybeAppendWranglerToGitIgnoreLikeFile(filePath: string): void {
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
	 */
	const hasDotEnv = existingGitIgnoreContent.match(
		/^\/?\.env\*?(\..*?)?(\s|$)/m
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
