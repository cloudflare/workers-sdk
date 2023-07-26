import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { getType } from "mime";
import { Minimatch } from "minimatch";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import {
	MAX_ASSET_COUNT,
	MAX_ASSET_SIZE,
	BULK_UPLOAD_CONCURRENCY,
	MAX_BUCKET_FILE_COUNT,
	MAX_BUCKET_SIZE,
	MAX_CHECK_MISSING_ATTEMPTS,
	MAX_UPLOAD_ATTEMPTS,
} from "../constants";
import type { UploadPayloadFile } from "../types";

type LogFn = (...args: unknown[]) => void;

interface UploadBaseProps {
	logger: {
		debug: LogFn;
		info: LogFn;
		log: LogFn;
		warn: LogFn;
		error: LogFn;
	};
	hashFile:
		| ((contents: string) => string)
		| ((contents: string) => Promise<string>);
	skipCaching: boolean;
	directory: string;

	checkMissing: (jwt: string, hashes: string[]) => Promise<string[]>;
	upsertHashes: (jwt: string, hashes: string[]) => Promise<unknown>;
	uploadPayload: (
		jwt: string,
		payload: UploadPayloadFile[]
	) => Promise<unknown>;

	/**
	 * Called after a chunk of files has uploaded
	 * @param done How many files have been uploaded
	 * @param total The total files to be uploaded
	 */
	onProgress?: (done: number, total: number) => void;
	/**
	 * Called after all files have been uploaded
	 */
	onUploadComplete?: () => void;
}

type UploadProps =
	| (UploadBaseProps & { jwt: string })
	| (UploadBaseProps & { fetchJwt: () => Promise<string> });

export const upload = async (args: UploadProps) => {
	const { logger, hashFile } = args;

	async function fetchJwt(): Promise<string> {
		if ("jwt" in args) {
			return args.jwt;
		} else {
			return await args.fetchJwt();
		}
	}

	type FileContainer = {
		path: string;
		contentType: string;
		sizeInBytes: number;
		hash: string;
	};

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
						hash: await Promise.resolve(hashFile(filepath)),
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

	const files = [...fileMap.values()];

	let jwt = await fetchJwt();

	const start = Date.now();

	let attempts = 0;
	const getMissingHashes = async (skipCaching: boolean): Promise<string[]> => {
		if (skipCaching) {
			logger.debug("Force skipping cache");
			return files.map(({ hash }) => hash);
		}

		try {
			return await args.checkMissing(
				jwt,
				files.map(({ hash }) => hash)
			);
		} catch (e) {
			if (attempts < MAX_CHECK_MISSING_ATTEMPTS) {
				// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
				await new Promise((resolvePromise) =>
					setTimeout(resolvePromise, Math.pow(2, attempts++) * 1000)
				);

				if ((e as { code: number }).code === 8000013) {
					// Looks like the JWT expired, fetch another one
					jwt = await fetchJwt();
				}
				return getMissingHashes(skipCaching);
			} else {
				throw e;
			}
		}
	};
	const missingHashes = await getMissingHashes(args.skipCaching);

	const sortedFiles = files
		.filter((file) => missingHashes.includes(file.hash))
		.sort((a, b) => b.sizeInBytes - a.sizeInBytes);

	// Start with a few buckets so small projects still get
	// the benefit of multiple upload streams
	const buckets: {
		files: FileContainer[];
		remainingSize: number;
	}[] = new Array(BULK_UPLOAD_CONCURRENCY).fill(null).map(() => ({
		files: [],
		remainingSize: MAX_BUCKET_SIZE,
	}));

	let bucketOffset = 0;
	for (const file of sortedFiles) {
		let inserted = false;

		for (let i = 0; i < buckets.length; i++) {
			// Start at a different bucket for each new file
			const bucket = buckets[(i + bucketOffset) % buckets.length];
			if (
				bucket.remainingSize >= file.sizeInBytes &&
				bucket.files.length < MAX_BUCKET_FILE_COUNT
			) {
				bucket.files.push(file);
				bucket.remainingSize -= file.sizeInBytes;
				inserted = true;
				break;
			}
		}

		if (!inserted) {
			buckets.push({
				files: [file],
				remainingSize: MAX_BUCKET_SIZE - file.sizeInBytes,
			});
		}
		bucketOffset++;
	}

	let counter = fileMap.size - sortedFiles.length;
	args.onProgress?.(counter, fileMap.size);

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });

	for (const bucket of buckets) {
		// Don't upload empty buckets (can happen for tiny projects)
		if (bucket.files.length === 0) continue;

		attempts = 0;
		const doUpload = async (): Promise<void> => {
			// Populate the payload only when actually uploading (this is limited to 3 concurrent uploads at 50 MiB per bucket meaning we'd only load in a max of ~150 MiB)
			// This is so we don't run out of memory trying to upload the files.
			const payload: UploadPayloadFile[] = await Promise.all(
				bucket.files.map(async (file) => ({
					key: file.hash,
					value: (await readFile(file.path)).toString("base64"),
					metadata: {
						contentType: file.contentType,
					},
					base64: true,
				}))
			);

			try {
				logger.debug("POST /pages/assets/upload");
				const res = await args.uploadPayload(jwt, payload);
				logger.debug("result:", res);
			} catch (e) {
				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					logger.debug("failed:", e, "retrying...");
					// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
					await new Promise((resolvePromise) =>
						setTimeout(resolvePromise, Math.pow(2, attempts++) * 1000)
					);

					if ((e as { code: number }).code === 8000013 || isJwtExpired(jwt)) {
						// Looks like the JWT expired, fetch another one
						jwt = await fetchJwt();
					}
					return doUpload();
				} else {
					logger.debug("failed:", e);
					throw e;
				}
			}
		};

		void queue.add(() =>
			doUpload().then(
				() => {
					counter += bucket.files.length;
					args.onProgress?.(counter, fileMap.size);
				},
				(error) => {
					return Promise.reject(
						new FatalError(
							`Failed to upload files. Please try again. Error: ${JSON.stringify(
								error
							)})`,
							error.code || 1
						)
					);
				}
			)
		);
	}

	await queue.onIdle();
	args.onUploadComplete?.();

	const uploadMs = Date.now() - start;

	const skipped = fileMap.size - missingHashes.length;
	const skippedMessage = skipped > 0 ? `(${skipped} already uploaded) ` : "";

	logger.log(
		`✨ Success! Uploaded ${
			sortedFiles.length
		} files ${skippedMessage}${formatTime(uploadMs)}\n`
	);

	const doUpsertHashes = async (): Promise<unknown> => {
		try {
			return args.upsertHashes(
				jwt,
				files.map(({ hash }) => hash)
			);
		} catch (e) {
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));

			if ((e as { code: number }).code === 8000013 || isJwtExpired(jwt)) {
				// Looks like the JWT expired, fetch another one
				jwt = await fetchJwt();
			}

			return args.upsertHashes(
				jwt,
				files.map(({ hash }) => hash)
			);
		}
	};

	try {
		await doUpsertHashes();
	} catch {
		logger.warn(
			"Failed to update file hashes. Every upload appeared to succeed for this deployment, but you might need to re-upload for future deployments. This shouldn't have any impact other than slowing the upload speed of your next deployment."
		);
	}

	return Object.fromEntries(
		[...fileMap.entries()].map(([fileName, file]) => [
			`/${fileName}`,
			file.hash,
		])
	);
};

// Decode and check that the current JWT has not expired
export function isJwtExpired(token: string): boolean | undefined {
	try {
		const decodedJwt = JSON.parse(
			Buffer.from(token.split(".")[1], "base64").toString()
		);

		const dateNow = new Date().getTime() / 1000;

		return decodedJwt.exp <= dateNow;
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(`Invalid token: ${e.message}`);
		}
	}
}

export function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

class FatalError extends Error {
	constructor(message?: string, readonly code?: number) {
		super(message);
	}
}
