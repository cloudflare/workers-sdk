import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { FatalError } from "@cloudflare/workers-utils";
import { getType } from "mime";
import { Minimatch } from "minimatch";
import prettyBytes from "pretty-bytes";
import { createCommand } from "../core/create-command";
import { MAX_ASSET_COUNT_DEFAULT, MAX_ASSET_SIZE } from "./constants";
import { hashFile } from "./hash";
import { maxFileCountAllowedFromClaims } from "./upload";

export const pagesProjectValidateCommand = createCommand({
	metadata: {
		description: "Validate a Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hidden: true,
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		directory: {
			type: "string",
			demandOption: true,
			description: "The directory of static files to validate",
		},
	},
	positionalArgs: ["directory"],
	async handler({ directory }) {
		if (!directory) {
			throw new FatalError("Must specify a directory.", 1);
		}

		const fileCountLimit = process.env.CF_PAGES_UPLOAD_JWT
			? maxFileCountAllowedFromClaims(process.env.CF_PAGES_UPLOAD_JWT)
			: undefined;

		await validate({
			directory,
			fileCountLimit,
		});
	},
});

export type FileContainer = {
	path: string;
	contentType: string;
	sizeInBytes: number;
	hash: string;
};

export const validate = async (args: {
	directory: string;
	fileCountLimit?: number;
}): Promise<Map<string, FileContainer>> => {
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

	const directory = resolve(args.directory);

	// TODO(future): Use this to more efficiently load files in and speed up uploading
	// Limit memory to 1 GB unless more is specified
	// let maxMemory = 1_000_000_000;
	// if (process.env.NODE_OPTIONS && (process.env.NODE_OPTIONS.includes('--max-old-space-size=') || process.env.NODE_OPTIONS.includes('--max_old_space_size='))) {
	// 	const parsed = parser(process.env.NODE_OPTIONS);
	// 	maxMemory = (parsed['max-old-space-size'] ? parsed['max-old-space-size'] : parsed['max_old_space_size']) * 1000 * 1000; // Turn MB into bytes
	// }

	const fileCountLimit = args.fileCountLimit ?? MAX_ASSET_COUNT_DEFAULT;

	const walk = async (
		dir: string,
		fileMap: Map<string, FileContainer> = new Map(),
		startingDir: string = dir
	) => {
		let files: string[];
		try {
			files = await readdir(dir);
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "ENOENT") {
				// File not found exeptions should be marked as user error
				throw new FatalError((e as NodeJS.ErrnoException).message);
			}
			throw e;
		}

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
								MAX_ASSET_SIZE,
								{ binary: true }
							)} in size\n${name} is ${prettyBytes(filestat.size, {
								binary: true,
							})} in size`,
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

	if (fileMap.size > fileCountLimit) {
		throw new FatalError(
			`Error: Pages only supports up to ${fileCountLimit.toLocaleString()} files in a deployment for your current plan. Ensure you have specified your build output directory correctly.`,
			1
		);
	}

	return fileMap;
};
