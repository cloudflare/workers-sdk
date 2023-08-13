import fs, { existsSync } from "fs";
import { crash } from "./cli";
import type { PagesGeneratorContext } from "types";

export const writeFile = (path: string, content: string) => {
	try {
		fs.writeFileSync(path, content);
	} catch (error) {
		crash(error as string);
	}
};

export const readFile = (path: string) => {
	try {
		return fs.readFileSync(path, "utf-8");
	} catch (error) {
		return crash(error as string);
	}
};

export const readJSON = (path: string) => {
	const contents = readFile(path);
	return contents ? JSON.parse(contents) : contents;
};

export const writeJSON = (
	path: string,
	object: object,
	stringifySpace?: number | string
) => {
	writeFile(path, JSON.stringify(object, null, stringifySpace));
};

// Probes a list of paths and returns the first one that exists
// If one isn't found, throws an error with the given message
export const probePaths = (
	paths: string[],
	errorMsg = "Failed to find required file."
) => {
	for (const path of paths) {
		if (existsSync(path)) {
			return path;
		}
	}

	crash(errorMsg);
	process.exit(1); // hack to make typescript happy
};

export const usesTypescript = (projectRoot = ".") => {
	return existsSync(`${projectRoot}/tsconfig.json`);
};

const eslintRcExts = ["js", "cjs", "yaml", "yml", "json"] as const;

type EslintRcFileName = `.eslintrc.${typeof eslintRcExts[number]}`;

type EslintUsageInfo =
	| {
			used: true;
			configType: EslintRcFileName | "eslint.config.js" | "package.json";
	  }
	| {
			used: false;
	  };

/*
	checks if eslint is used and if so returns the configuration type
	(for the various configuration types see:
		- https://eslint.org/docs/latest/use/configure/configuration-files#configuration-file-formats
		- https://eslint.org/docs/latest/use/configure/configuration-files-new )
*/
export const usesEslint = (ctx: PagesGeneratorContext): EslintUsageInfo => {
	for (const ext of eslintRcExts) {
		const eslintRcFilename = `.eslintrc.${ext}` as EslintRcFileName;
		if (existsSync(`${ctx.project.path}/${eslintRcFilename}`)) {
			return {
				used: true,
				configType: eslintRcFilename,
			};
		}
	}

	if (existsSync(`${ctx.project.path}/eslint.config.js`)) {
		return {
			used: true,
			configType: "eslint.config.js",
		};
	}

	try {
		const pkgJson = readJSON(`${ctx.project.path}/package.json`);
		if (pkgJson.eslintConfig) {
			return {
				used: true,
				configType: "package.json",
			};
		}
	} catch {}

	return { used: false };
};

// Generate a compatibility date flag
export const compatDateFlag = () => {
	const date = new Date();
	return `--compatibility-date=${date.toISOString().slice(0, 10)}`;
};
