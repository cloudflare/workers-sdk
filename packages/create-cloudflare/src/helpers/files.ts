import fs, { existsSync, statSync } from "fs";
import { join } from "path";
import TOML from "@iarna/toml";
import type { JsonMap } from "@iarna/toml";
import type { C3Context } from "types";

export const copyFile = (path: string, dest: string) => {
	try {
		fs.copyFileSync(path, dest);
	} catch (error) {
		throw new Error(error as string);
	}
};

export const writeFile = (path: string, content: string) => {
	try {
		fs.writeFileSync(path, content);
	} catch (error) {
		throw new Error(error as string);
	}
};

export const appendFile = (path: string, content: string) => {
	try {
		fs.appendFileSync(path, content);
	} catch (error) {
		throw new Error(error as string);
	}
};

export const readFile = (path: string) => {
	try {
		return fs.readFileSync(path, "utf-8");
	} catch (error) {
		throw new Error(error as string);
	}
};

export const removeFile = (path: string) => {
	try {
		fs.rmSync(path, { force: true });
	} catch (error) {
		throw new Error(`Remove file failed: ${path}`, { cause: error });
	}
};

export const directoryExists = (path: string): boolean => {
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

export const readJSON = (path: string) => {
	const contents = readFile(path);
	return contents ? JSON.parse(contents) : contents;
};

export const readToml = (path: string) => {
	const contents = readFile(path);
	return contents ? TOML.parse(contents) : {};
};

export const writeJSON = (path: string, object: object, stringifySpace = 2) => {
	writeFile(path, JSON.stringify(object, null, stringifySpace));
};

export const writeToml = (path: string, object: JsonMap) => {
	writeFile(path, TOML.stringify(object));
};

// Probes a list of paths and returns the first one that exists or null if none does
export const probePaths = (paths: string[]) => {
	for (const path of paths) {
		if (existsSync(path)) {
			return path;
		}
	}

	return null;
};

export const usesTypescript = (ctx: C3Context) => {
	return hasTsConfig(ctx.project.path);
};

export const hasTsConfig = (path: string) => {
	return existsSync(join(`${path}`, `tsconfig.json`));
};

const eslintRcExts = ["js", "cjs", "yaml", "yml", "json"] as const;

type EslintRcFileName = `.eslintrc.${(typeof eslintRcExts)[number]}`;

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
export const usesEslint = (ctx: C3Context): EslintUsageInfo => {
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
