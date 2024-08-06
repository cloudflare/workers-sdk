import assert from "node:assert";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";
import { getType } from "mime";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import { fetchResult } from "./cfetch";
import { formatTime } from "./deploy/deploy";
import { FatalError, UserError } from "./errors";
import { logger, LOGGER_LEVELS } from "./logger";
import { hashFile } from "./pages/hash";
import { isJwtExpired } from "./pages/upload";
import { APIError } from "./parse";
import { urlSafe } from "./sites";
import type { Config } from "./config";

export type AssetManifest = { [path: string]: { hash: string; size: number } };

type InitializeAssetsResponse = {
	// string of file hashes per bucket
	buckets: string[][];
	jwt: string;
};

export type UploadPayloadFile = {
	name: string;
	hash: string;
	contents: string;
	metadata: {
		contentType: string;
	};
};

type UploadResponse = {
	jwt?: string;
};

// constants same as Pages for now
const BULK_UPLOAD_CONCURRENCY = 3;
const MAX_ASSET_COUNT = 20_000;
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const MAX_UPLOAD_ATTEMPTS = 5;
const MAX_UPLOAD_GATEWAY_ERRORS = 5;

export const syncExperimentalAssets = async (
	accountId: string | undefined,
	scriptName: string,
	assetDirectory: string | undefined,
	dryRun: boolean | undefined
): Promise<string | undefined> => {
	if (assetDirectory === undefined) {
		return;
	}
	if (dryRun) {
		logger.log("(Note: doing a dry run, not uploading or deleting anything.)");
		return;
	}
	assert(accountId, "Missing accountId");

	// 1. generate asset manifest
	logger.info("🌀 Building list of assets...");
	const manifest = await walk(assetDirectory, {});

	// 2. fetch buckets w/ hashes
	logger.info("🌀 Uploading asset manifest...");
	const initializeAssetsResponse = await fetchResult<InitializeAssetsResponse>(
		`/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`,
		{
			headers: { "Content-Type": "application/json" },
			method: "POST",
			body: JSON.stringify({ manifest: manifest }),
		}
	);

	// if nothing to upload, return
	if (initializeAssetsResponse.buckets.flat().length === 0) {
		logger.info(`✨ Success! (No files to upload)`);
		return initializeAssetsResponse.jwt;
	}

	// 3. fill buckets and upload assets
	const numberFilesToUpload = initializeAssetsResponse.buckets.flat().length;
	logger.info(`🌀 Uploading ${numberFilesToUpload} file(s)...`);

	// Create the buckets outside of doUpload so we can retry without losing track of potential duplicate files
	// But don't add the actual content until uploading so we don't run out of memory
	const manifestLookup = Object.entries(manifest);
	let assetLogCount = 0;
	const bucketSkeletons = initializeAssetsResponse.buckets.map((bucket) => {
		return bucket.map((fileHash) => {
			const manifestEntryIndex = manifestLookup.findIndex(
				(file) => file[1].hash === fileHash
			);
			if (manifestEntryIndex === -1) {
				throw new FatalError(
					`A file was requested that does not appear to exist.`,
					1
				);
			}
			const manifestEntry = manifestLookup.splice(manifestEntryIndex, 1)[0];
			// just logging file uploads at the moment...
			// unsure how to log deletion vs unchanged file ignored/if we want to log this
			assetLogCount = logAssetUpload(`+ ${manifestEntry[0]}`, assetLogCount);
			return manifestEntry;
		});
	});

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });
	let attempts = 0;
	const start = Date.now();
	let bucketUploadCount = 0;
	let completionJwt = "";

	for (const [bucketIndex, bucketSkeleton] of bucketSkeletons.entries()) {
		attempts = 0;
		let gatewayErrors = 0;
		const doUpload = async (): Promise<UploadResponse> => {
			// Populate the payload only when actually uploading (this is limited to 3 concurrent uploads at 50 MiB per bucket meaning we'd only load in a max of ~150 MiB)
			// This is so we don't run out of memory trying to upload the files.
			const payload: UploadPayloadFile[] = await Promise.all(
				bucketSkeleton.map(async (manifestEntry) => {
					const absFilePath = path.join(assetDirectory, manifestEntry[0]);
					return {
						name: manifestEntry[0],
						hash: manifestEntry[1].hash,
						contents: (await readFile(absFilePath)).toString("base64"),
						metadata: {
							contentType: getType(absFilePath) || "application/octet-stream",
						},
					};
				})
			);

			try {
				const res = await fetchResult<UploadResponse>(
					`/accounts/${accountId}/workers/assets/upload`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-ndjson",
							Authorization: `Bearer ${initializeAssetsResponse.jwt}`,
						},
						body: payload.map((x) => JSON.stringify(x)).join("\n"),
					}
				);
				logger.info(
					`Uploaded bucket ${bucketIndex + 1}/${initializeAssetsResponse.buckets.length}`
				);
				return res;
			} catch (e) {
				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					logger.info(
						chalk.dim(
							`Bucket ${bucketIndex + 1}/${initializeAssetsResponse.buckets.length} upload failed. Retrying...\n`,
							e
						)
					);
					// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
					await new Promise((resolvePromise) =>
						setTimeout(resolvePromise, Math.pow(2, attempts) * 1000)
					);
					if (e instanceof APIError && e.isGatewayError()) {
						// Gateway problem, wait for some additional time and set concurrency to 1
						queue.concurrency = 1;
						await new Promise((resolvePromise) =>
							setTimeout(resolvePromise, Math.pow(2, gatewayErrors) * 5000)
						);
						gatewayErrors++;
						// only count as a failed attempt after a few initial gateway errors
						if (gatewayErrors >= MAX_UPLOAD_GATEWAY_ERRORS) {
							attempts++;
						}
					} else {
						attempts++;
					}
					return doUpload();
				} else if (isJwtExpired(initializeAssetsResponse.jwt)) {
					throw new FatalError(
						`Asset upload took too long on bucket ${bucketIndex + 1}/${initializeAssetsResponse.buckets.length}. Please try again.`
					);
				} else {
					throw e;
				}
			}
		};
		// add to queue and run it if we haven't reached concurrency limit
		void queue.add(() =>
			doUpload().then(
				(res) => {
					bucketUploadCount++;
					completionJwt = res.jwt || completionJwt;
				},
				(error) => {
					throw error;
				}
			)
		);
	}
	queue.on("error", (error) => {
		logger.error(error.message);
		throw error;
	});
	await queue.onIdle();

	// if queue finishes without receiving JWT from asset upload service (AUS)
	// AUS only returns this in the final bucket upload response
	if (!completionJwt) {
		throw new FatalError(
			"Failed to receive completion signal for file upload. Please try again.",
			1
		);
	} else if (bucketUploadCount !== initializeAssetsResponse.buckets.length) {
		throw new FatalError(
			"Upload completion signal received unexpectedly early - we cannot confirm if all files were successfully uploaded. Please try again.",
			1
		);
	}

	const uploadMs = Date.now() - start;
	const skipped = Object.keys(manifest).length - numberFilesToUpload;
	const skippedMessage = skipped > 0 ? `(${skipped} already uploaded) ` : "";

	logger.log(
		`✨ Success! Uploaded ${numberFilesToUpload} file(s) ${skippedMessage}${formatTime(uploadMs)}\n`
	);

	return completionJwt;
};

// modified from /pages/validate.tsx
const walk = async (
	dir: string,
	manifest: AssetManifest,
	startingDir: string = dir
) => {
	const files = await readdir(dir);

	let counter = 0;
	await Promise.all(
		files.map(async (file) => {
			const filepath = path.join(dir, file);
			const relativeFilepath = path.relative(startingDir, filepath);
			const filestat = await stat(filepath);

			if (filestat.isSymbolicLink()) {
				return;
			}

			if (filestat.isDirectory()) {
				manifest = await walk(filepath, manifest, startingDir);
			} else {
				if (counter >= MAX_ASSET_COUNT) {
					throw new UserError(
						`Max asset count exceeded: ${counter.toLocaleString()} files found.
						You cannot have more than ${MAX_ASSET_COUNT.toLocaleString()} files in a deployment.
						Ensure you have specified your build output directory correctly (currently set as ${startingDir}).`
					);
				}

				const name = urlSafe(relativeFilepath);
				if (filestat.size > MAX_ASSET_SIZE) {
					throw new UserError(
						`File too large.
						Max file size is ${prettyBytes(MAX_ASSET_SIZE, {
							binary: true,
						})}\n${name} is ${prettyBytes(filestat.size, {
							binary: true,
						})} in size`
					);
				}
				manifest[urlSafe(path.join("/", name))] = {
					hash: hashFile(filepath),
					size: filestat.size,
				};
				counter++;
			}
		})
	);
	return manifest;
};

const MAX_DIFF_LINES = 100;

function logAssetUpload(line: string, diffCount: number) {
	const level = logger.loggerLevel;
	if (LOGGER_LEVELS[level] >= LOGGER_LEVELS.debug) {
		// If we're logging as debug level, we want *all* diff lines to be logged
		// at debug level, not just the first MAX_DIFF_LINES
		logger.debug(line);
	} else if (diffCount < MAX_DIFF_LINES) {
		// Otherwise, log  the first MAX_DIFF_LINES diffs at info level...
		logger.info(line);
	} else if (diffCount === MAX_DIFF_LINES) {
		// ...and warn when we start to truncate it
		const msg =
			"   (truncating changed assets log, set `WRANGLER_LOG=debug` environment variable to see full diff)";
		logger.info(chalk.dim(msg));
	}
	return diffCount++;
}

/**
 * Returns the base path of the experimental assets to upload.
 *
 */
export function getExperimentalAssetsBasePath(
	config: Config,
	experimentalAssetsCommandLineArg: string | undefined
): string {
	return experimentalAssetsCommandLineArg
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));
}

export function processExperimentalAssetsArg(
	args: { experimentalAssets: string | undefined },
	config: Config
) {
	const experimentalAssets = args.experimentalAssets
		? { directory: args.experimentalAssets }
		: config.experimental_assets;
	if (experimentalAssets) {
		const experimentalAssetsBasePath = getExperimentalAssetsBasePath(
			config,
			args.experimentalAssets
		);
		const resolvedExperimentalAssetsPath = path.resolve(
			experimentalAssetsBasePath,
			experimentalAssets.directory
		);

		if (!existsSync(resolvedExperimentalAssetsPath)) {
			const sourceOfTruthMessage = args.experimentalAssets
				? '"--experimental-assets" command line argument'
				: '"experimental_assets.directory" field in your configuration file';

			throw new UserError(
				`The directory specified by the ${sourceOfTruthMessage} does not exist:\n` +
					`${resolvedExperimentalAssetsPath}`
			);
		}

		experimentalAssets.directory = resolvedExperimentalAssetsPath;
	}

	return experimentalAssets;
}
