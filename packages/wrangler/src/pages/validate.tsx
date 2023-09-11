import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { getType } from "mime";
import { Minimatch } from "minimatch";
import prettyBytes from "pretty-bytes";
import { FatalError } from "../errors";
import { MAX_ASSET_COUNT, MAX_ASSET_SIZE } from "./constants";
import { hashFile } from "./hash";

import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

type UploadArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
	return yargs.positional("directory", {
		type: "string",
		demandOption: true,
		description: "The directory of static files to validate",
	});
}

export const Handler = async ({ directory }: UploadArgs) => {
	if (!directory) {
		throw new FatalError("Must specify a directory.", 1);
	}

	await validate(directory);
};

export type FileContainer = {
	path: string;
	contentType: string;
	sizeInBytes: number;
	hash: string;
};

export const validate = async (
	directory: string
): Promise<Map<string, FileContainer>> => {
	const IGNORE_LIST = [
		"_worker.js",
		"_redirects",
		"_headers",
		"_routes.json",
		"functions",
		"**/.DS_Store",
		"**/node_modules",
		"**/.git",
	].map((pattern) => new Minimatch(pattern));

	// TODO(future): Use this to more efficiently load files in and speed up uploading
	// Limit memory to 1 GB unless more is specified
	// let maxMemory = 1_000_000_000;
	// if (process.env.NODE_OPTIONS && (process.env.NODE_OPTIONS.includes('--max-old-space-size=') || process.env.NODE_OPTIONS.includes('--max_old_space_size='))) {
	// 	const parsed = parser(process.env.NODE_OPTIONS);
	// 	maxMemory = (parsed['max-old-space-size'] ? parsed['max-old-space-size'] : parsed['max_old_space_size']) * 1000 * 1000; // Turn MB into bytes
	// }

	const walk = async (
		dir: string,
		fileMap: Map<string, FileContainer> = new Map(),
		startingDir: string = dir
	) => {
		const files = await readdir(dir);

		await Promise.all(
			files.map(async (file) => {
				const filepath = join(dir, file);
				const relativeFilepath = relative(startingDir, filepath);
				const filestat = await stat(filepath);

				for (const minimatch of IGNORE_LIST) {
					if (minimatch.match(relativeFilepath)) {
						return;
					}
				}

				if (filestat.isSymbolicLink()) {
					return;
				}

				if (filestat.isDirectory()) {
					fileMap = await walk(filepath, fileMap, startingDir);
				} else {
					const name = relativeFilepath.split(sep).join("/");

					if (filestat.size > MAX_ASSET_SIZE) {
						throw new FatalError(
							`Error: Pages only supports files up to ${prettyBytes(
								MAX_ASSET_SIZE
							)} in size\n${name} is ${prettyBytes(filestat.size)} in size`,
							1
						);
					}

					// We don't want to hold the content in memory. We instead only want to read it when it's needed
					fileMap.set(name, {
						path: filepath,
						contentType: getType(name) || "application/octet-stream",
						sizeInBytes: filestat.size,
						hash: hashFile(filepath),
					});
				}
			})
		);

		return fileMap;
	};

	const fileMap = await walk(directory);

	if (fileMap.size > MAX_ASSET_COUNT) {
		throw new FatalError(
			`Error: Pages only supports up to ${MAX_ASSET_COUNT.toLocaleString()} files in a deployment. Ensure you have specified your build output directory correctly.`,
			1
		);
	}

	return fileMap;
};
