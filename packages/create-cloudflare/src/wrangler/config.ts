import { existsSync } from "fs";
import { resolve } from "path";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import MagicString from "magic-string";
import type { C3Context } from "types";

/**
 * Update the `wrangler.toml` file for this project by setting the name
 * to the selected project name and adding the latest compatibility date.
 */
export const updateWranglerToml = async (ctx: C3Context) => {
	if (!wranglerTomlExists(ctx)) {
		return;
	}

	const wranglerToml = readWranglerToml(ctx);
	const newToml = new MagicString(wranglerToml);

	const compatDateRe = /^compatibility_date\s*=.*/m;

	if (wranglerToml.match(compatDateRe)) {
		// If the compat date is already a valid one, leave it since it may be there
		// for a specific compat reason
		const validCompatDateRe = /^compatibility_date\s*=\s*"\d{4}-\d{2}-\d{2}"/m;
		if (!wranglerToml.match(validCompatDateRe)) {
			newToml.replace(
				compatDateRe,
				`compatibility_date = "${await getWorkerdCompatibilityDate()}"`,
			);
		}
	} else {
		newToml.prepend(
			`compatibility_date = "${await getWorkerdCompatibilityDate()}"\n`
		);
	}

	const nameRe = /^name\s*=.*/m;
	if (wranglerToml.match(nameRe)) {
		newToml.replace(nameRe, `name = "${ctx.project.name}"`);
	} else {
		newToml.prepend(`name = "${ctx.project.name}"\n`);
	}

	writeWranglerToml(ctx, newToml.toString());
};

const getWranglerTomlPath = (ctx: C3Context) => {
	return resolve(ctx.project.path, "wrangler.toml");
};

export const wranglerTomlExists = (ctx: C3Context) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return existsSync(wranglerTomlPath);
};

export const readWranglerToml = (ctx: C3Context) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return readFile(wranglerTomlPath);
};

export const writeWranglerToml = (ctx: C3Context, contents: string) => {
	const wranglerTomlPath = getWranglerTomlPath(ctx);
	return writeFile(wranglerTomlPath, contents);
};
