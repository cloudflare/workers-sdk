import { appendFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { readFileSync } from "@cloudflare/workers-utils";

const directoryExists = (path: string): boolean => {
	try {
		const stat = statSync(path);
		return stat.isDirectory();
	} catch (error) {
		if ((error as { code: string }).code === "ENOENT") {
			return false;
		}
		throw new Error(error as string);
	}
};

export const addWranglerToGitIgnore = (projectPath: string) => {
	const gitIgnorePath = `${projectPath}/.gitignore`;
	const gitIgnorePreExisted = existsSync(gitIgnorePath);

	const gitDirExists = directoryExists(`${projectPath}/.git`);

	if (!gitIgnorePreExisted && !gitDirExists) {
		// if there is no .gitignore file and neither a .git directory
		// then bail as the project is likely not targeting/using git
		return;
	}

	if (!gitIgnorePreExisted) {
		writeFileSync(gitIgnorePath, "");
	}

	const existingGitIgnoreContent = readFileSync(gitIgnorePath);
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
	s.start("Adding Wrangler files to the .gitignore file");

	const linesToAppend = [
		...(gitIgnorePreExisted
			? ["", ...(!existingGitIgnoreContent.match(/\n\s*$/) ? [""] : [])]
			: []),
	];

	if (!hasDotWrangler && wranglerGitIgnoreFilesToAdd.length > 1) {
		linesToAppend.push("# wrangler files");
	}

	wranglerGitIgnoreFilesToAdd.forEach((line) => linesToAppend.push(line));

	linesToAppend.push("");

	appendFileSync(gitIgnorePath, linesToAppend.join("\n"));

	s.stop(
		`${brandColor(gitIgnorePreExisted ? "updated" : "created")} ${dim(
			".gitignore file"
		)}`
	);
};
