import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { brandColor, dim } from "@cloudflare/cli/colors";
import { spinner } from "@cloudflare/cli/interactive";
import { readFileSync } from "@cloudflare/workers-utils";

export const addWranglerToAssetsIgnore = (projectPath: string) => {
	const assetsIgnorePath = `${projectPath}/.assetsignore`;
	const assetsIgnorePreExisted = existsSync(assetsIgnorePath);

	if (!assetsIgnorePreExisted) {
		writeFileSync(assetsIgnorePath, "");
	}

	const existingAssetsIgnoreContent = readFileSync(assetsIgnorePath);
	const wranglerAssetsIgnoreFilesToAdd: string[] = [];

	const hasDotWrangler = existingAssetsIgnoreContent.match(
		/^\/?\.wrangler(\/|\s|$)/m
	);
	if (!hasDotWrangler) {
		wranglerAssetsIgnoreFilesToAdd.push(".wrangler");
	}

	const hasDotDevDotVars = existingAssetsIgnoreContent.match(
		/^\/?\.dev\.vars\*(\s|$)/m
	);
	if (!hasDotDevDotVars) {
		wranglerAssetsIgnoreFilesToAdd.push(".dev.vars*");
	}

	const hasDotDevVarsExample = existingAssetsIgnoreContent.match(
		/^!\/?\.dev\.vars\.example(\s|$)/m
	);
	if (!hasDotDevVarsExample) {
		wranglerAssetsIgnoreFilesToAdd.push("!.dev.vars.example");
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
	const hasDotEnv = existingAssetsIgnoreContent.match(
		/^\/?\.env\*?(\..*?)?(\s|$)/m
	);
	if (!hasDotEnv) {
		wranglerAssetsIgnoreFilesToAdd.push(".env*");
	}

	const hasDotEnvExample = existingAssetsIgnoreContent.match(
		/^!\/?\.env\.example(\s|$)/m
	);
	if (!hasDotEnvExample) {
		wranglerAssetsIgnoreFilesToAdd.push("!.env.example");
	}

	if (wranglerAssetsIgnoreFilesToAdd.length === 0) {
		return;
	}

	const s = spinner();
	s.start("Adding Wrangler files to the .assetsignore file");

	const linesToAppend = [
		...(assetsIgnorePreExisted
			? ["", ...(!existingAssetsIgnoreContent.match(/\n\s*$/) ? [""] : [])]
			: []),
	];

	if (!hasDotWrangler && wranglerAssetsIgnoreFilesToAdd.length > 1) {
		linesToAppend.push("# wrangler files");
	}

	wranglerAssetsIgnoreFilesToAdd.forEach((line) => linesToAppend.push(line));

	linesToAppend.push("");

	appendFileSync(assetsIgnorePath, linesToAppend.join("\n"));

	s.stop(
		`${brandColor(assetsIgnorePreExisted ? "updated" : "created")} ${dim(
			".assetsignore file"
		)}`
	);
};
