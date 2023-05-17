import fs, { existsSync } from "fs";
import { crash } from "./cli";

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

export const writeJSON = (path: string, object: object) => {
	writeFile(path, JSON.stringify(object));
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

// Generate a compatibility date flag
export const compatDateFlag = () => {
	const date = new Date();
	return `--compatibility-date=${date.toISOString().slice(0, 10)}`;
};
