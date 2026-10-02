import assert from "node:assert";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import {
	CF_ASSETS_IGNORE_FILENAME,
	HEADERS_FILENAME,
	MAX_ASSET_SIZE,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import {
	createAssetsIgnoreFunction,
	getContentType,
	maybeGetFile,
	normalizeFilePath,
} from "@cloudflare/workers-shared/utils/helpers";
import {
	APIError,
	FatalError,
	formatTime,
	LOGGER_LEVELS,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import { FormData } from "undici";
import { fetchResult, logger } from "../../shared/context";
import { hashFile } from "./hash";
import { decodeJwtPayload, isJwtExpired } from "./jwt";
import type { SharedDeployVersionsProps } from "../../shared/types";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";
import type {
	AssetsOptions,
	ComplianceConfig,
	Config,
	Logger,
} from "@cloudflare/workers-utils";

export type AssetManifest = { [path: string]: { hash: string; size: number } };

type InitializeAssetsResponse = {
	// string of file hashes per bucket
	buckets: string[][];
	jwt: string;
};

type UploadResponse = {
	jwt?: string;
};

export type AssetUploadStats = {
	assetUploadDurationMs: number;
	assetUploadIsBulk: boolean;
	assetUploadFileCount: number;
	assetUploadTotalBytes: number;
};

export type AssetsUploadResult = {
	jwt: string;
	assetUploadStats: AssetUploadStats;
};

// constants same as Pages for now
const BULK_UPLOAD_CONCURRENCY = 3;
const EDGE_KV_UPLOAD_CONCURRENCY = 50;
const MAX_UPLOAD_ATTEMPTS = 5;
const MAX_UPLOAD_GATEWAY_ERRORS = 5;

const MAX_DIFF_LINES = 100;

/**
 * The logger methods asset uploads report their progress through.
 */
type ProgressLogger = Pick<Logger, "info" | "log">;

/**
 * Choose where asset upload progress goes.
 *
 * @param quiet Whether stdout has to stay machine readable, as it does for
 * `--json` output. Progress then moves to debug level, so it is still
 * available with `WRANGLER_LOG=debug`.
 * @returns The logger methods to report progress through.
 */
function progressLogger(quiet: boolean): ProgressLogger {
	if (!quiet) {
		return logger;
	}
	return {
		info: (...args: unknown[]) => logger.debug(...args),
		log: (...args: unknown[]) => logger.debug(...args),
	};
}

export const syncAssets = async (
	complianceConfig: ComplianceConfig,
	accountId: string | undefined,
	assetDirectory: string,
	scriptName: string,
	{
		dispatchNamespace,
		quiet = false,
	}: { dispatchNamespace?: string; quiet?: boolean } = {}
): Promise<AssetsUploadResult> => {
	assert(accountId, "Missing accountId");
	const progress = progressLogger(quiet);

	// 1. generate asset manifest
	progress.info("🌀 Building list of assets...");
	const manifest = await buildAssetManifest(assetDirectory, progress);

	const url = dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}/assets-upload-session`
		: `/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`;

	// 2. fetch buckets w/ hashes
	progress.info("🌀 Starting asset upload...");
	const initializeAssetsResponse =
		await fetchResult<InitializeAssetsResponse | null>(complianceConfig, url, {
			headers: { "Content-Type": "application/json" },
			method: "POST",
			body: JSON.stringify({ manifest: manifest }),
		});

	// In the past we've seen the endpoint return that incorrectly doesn't contain
	// a null response (see: https://github.com/cloudflare/workers-sdk/issues/9465).
	// So just to be extra sure here we check the object and provide a clear error message to the user
	// if it is falsy.
	if (!initializeAssetsResponse) {
		throw new FatalError(
			"An unexpected response has been received from the Cloudflare API for assets upload. Please try again.",
			{ code: 1, telemetryMessage: "assets upload unexpected api response" }
		);
	}

	const filesToUpload = initializeAssetsResponse.buckets.flat();
	const useSingleAssetUpload = isSingleAssetUploadMode(
		initializeAssetsResponse.jwt
	);

	// if nothing to upload, return
	if (filesToUpload.length === 0) {
		if (!initializeAssetsResponse.jwt) {
			throw new FatalError(
				"Could not find assets information to attach to deployment. Please try again.",
				{ code: 1, telemetryMessage: "assets upload missing completion token" }
			);
		}
		progress.info(
			`No updated asset files to upload. Proceeding with deployment...`
		);
		return {
			jwt: initializeAssetsResponse.jwt,
			assetUploadStats: {
				assetUploadDurationMs: 0,
				assetUploadIsBulk: !useSingleAssetUpload,
				assetUploadFileCount: 0,
				assetUploadTotalBytes: 0,
			},
		};
	}

	// 3. fill buckets and upload assets
	const numberFilesToUpload = filesToUpload.length;
	progress.info(
		`🌀 Found ${numberFilesToUpload} new or modified static asset${
			numberFilesToUpload > 1 ? "s" : ""
		} to upload. Proceeding with upload...`
	);

	// Create the buckets outside of doUpload so we can retry without losing track of potential duplicate files
	// But don't add the actual content until uploading so we don't run out of memory
	const manifestLookup = Object.entries(manifest);
	let assetLogCount = 0;
	const assetBuckets = initializeAssetsResponse.buckets.map((bucket) => {
		return bucket.map((fileHash) => {
			const manifestEntry = manifestLookup.find(
				(file) => file[1].hash === fileHash
			);
			if (manifestEntry === undefined) {
				throw new FatalError(
					`A file was requested that does not appear to exist.`,
					{
						code: 1,
						telemetryMessage:
							"A file was requested that does not appear to exist. (asset manifest upload)",
					}
				);
			}
			// just logging file uploads at the moment...
			// unsure how to log deletion vs unchanged file ignored/if we want to log this
			assetLogCount = logAssetUpload(
				`+ ${manifestEntry[0]}`,
				assetLogCount,
				progress
			);
			return manifestEntry;
		});
	});

	const uploadBuckets = useSingleAssetUpload
		? assetBuckets.flat().map((entry) => [entry])
		: assetBuckets;

	const concurrency = useSingleAssetUpload
		? getEdgeKvUploadConcurrency(initializeAssetsResponse.jwt)
		: BULK_UPLOAD_CONCURRENCY;
	if (useSingleAssetUpload) {
		logger.debug(`Edge KV asset upload concurrency: ${concurrency}`);
	}
	const queue = new PQueue({ concurrency });
	const queuePromises: Array<Promise<void>> = [];
	const start = Date.now();
	let completionJwt = "";
	let uploadedAssetsCount = 0;
	let uploadedBytes = 0;
	let concurrencyThrottleGeneration = 0;

	for (const [bucketIndex, bucket] of uploadBuckets.entries()) {
		let attempts = 0;
		let gatewayErrors = 0;
		const doUpload = async (): Promise<UploadResponse> => {
			const uploadGeneration = concurrencyThrottleGeneration;
			const uploadedFiles: string[] = [];
			for (const manifestEntry of bucket) {
				uploadedFiles.push(manifestEntry[0]);
			}

			try {
				let res: UploadResponse;
				if (useSingleAssetUpload) {
					const manifestEntry = bucket[0];
					const absFilePath = path.join(assetDirectory, manifestEntry[0]);
					const contentType = getContentType(absFilePath);
					res = await fetchResult<UploadResponse>(
						complianceConfig,
						`/accounts/${accountId}/workers/assets/upload/${manifestEntry[1].hash}`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${initializeAssetsResponse.jwt}`,
								"Content-Type": contentType ?? "application/null",
							},
							body: createReadStream(absFilePath),
							duplex: "half",
						}
					);
				} else {
					// Populate the payload only when actually uploading (this is limited to 3 concurrent uploads at 50 MiB per bucket meaning we'd only load in a max of ~150 MiB)
					// This is so we don't run out of memory trying to upload the files.
					const payload = new FormData();
					for (const manifestEntry of bucket) {
						const absFilePath = path.join(assetDirectory, manifestEntry[0]);
						payload.append(
							manifestEntry[1].hash,
							new File(
								[(await readFile(absFilePath)).toString("base64")],
								manifestEntry[1].hash,
								{
									// Most formdata body encoders (incl. undici's) will override with "application/octet-stream" if you use a falsy value here
									// Additionally, it appears that undici doesn't support non-standard main types (e.g. "null")
									// So, to make it easier for any other clients, we'll just parse "application/null" on the API
									// to mean actually null (signal to not send a Content-Type header with the response)
									type: getContentType(absFilePath) ?? "application/null",
								}
							),
							manifestEntry[1].hash
						);
					}
					res = await fetchResult<UploadResponse>(
						complianceConfig,
						`/accounts/${accountId}/workers/assets/upload?base64=true`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${initializeAssetsResponse.jwt}`,
							},
							body: payload,
						}
					);
				}
				// Only requests started after the latest throttle may restore capacity.
				// Otherwise, requests that were already in flight could immediately undo it.
				if (
					queue.concurrency < concurrency &&
					uploadGeneration === concurrencyThrottleGeneration
				) {
					queue.concurrency++;
					logger.debug(
						`Asset upload concurrency recovered to ${queue.concurrency}.`
					);
				}
				uploadedAssetsCount += bucket.length;
				uploadedBytes += bucket.reduce(
					(total, manifestEntry) => total + manifestEntry[1].size,
					0
				);
				logAssetsUploadStatus(
					numberFilesToUpload,
					uploadedAssetsCount,
					uploadedFiles,
					progress
				);
				return res;
			} catch (e) {
				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					progress.info(
						chalk.dim(
							`Asset upload failed. Retrying... ${attempts + 1} of ${MAX_UPLOAD_ATTEMPTS} attempts.\n`
						)
					);
					logger.debug(e);
					// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
					await new Promise((resolvePromise) =>
						setTimeout(resolvePromise, Math.pow(2, attempts) * 1000)
					);
					if (e instanceof APIError && e.isGatewayError()) {
						// Gateway problem, wait for some additional time and set concurrency to 1
						concurrencyThrottleGeneration++;
						queue.concurrency = 1;
						logger.debug(
							"Asset upload concurrency throttled to 1 after a gateway error."
						);
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
						`Upload took too long.\n` +
							`Asset upload took too long on bucket ${bucketIndex + 1}/${
								uploadBuckets.length
							}. Please try again.\n` +
							`Assets already uploaded have been saved, so the next attempt will automatically resume from this point.`,
						{ telemetryMessage: "Asset upload took too long" }
					);
				} else {
					throw e;
				}
			}
		};
		// add to queue and run it if we haven't reached concurrency limit
		queuePromises.push(
			queue.add(() =>
				doUpload().then((res) => {
					completionJwt = res.jwt || completionJwt;
				})
			)
		);
	}
	queue.on("error", (error) => {
		logger.error(error.message);
		throw error;
	});
	// using Promise.all() here instead of queue.onIdle() to ensure
	// we actually throw errors that occur within queued promises.
	await Promise.all(queuePromises);

	// if queue finishes without receiving JWT from asset upload service (AUS)
	// AUS only returns this in the final bucket upload response
	if (!completionJwt) {
		throw new FatalError("Failed to complete asset upload. Please try again.", {
			code: 1,
			telemetryMessage: "assets upload completion failed",
		});
	}

	const uploadMs = Date.now() - start;
	const skipped = Object.keys(manifest).length - numberFilesToUpload;
	const skippedMessage = skipped > 0 ? `(${skipped} already uploaded) ` : "";

	progress.log(
		`✨ Success! Uploaded ${numberFilesToUpload} file${
			numberFilesToUpload > 1 ? "s" : ""
		} ${skippedMessage}${formatTime(uploadMs)}\n`
	);

	return {
		jwt: completionJwt,
		assetUploadStats: {
			assetUploadDurationMs: uploadMs,
			assetUploadIsBulk: !useSingleAssetUpload,
			assetUploadFileCount: uploadedAssetsCount,
			assetUploadTotalBytes: uploadedBytes,
		},
	};
};

function isSingleAssetUploadMode(jwt: string): boolean {
	try {
		return decodeJwtPayload(jwt).wrangler_single_asset_uploads === true;
	} catch {
		return false;
	}
}

export function getEdgeKvUploadConcurrency(jwt: string): number {
	try {
		const value = Number(decodeJwtPayload(jwt).edge_kv_upload_concurrency);
		return value > 0 ? Math.floor(value) : EDGE_KV_UPLOAD_CONCURRENCY;
	} catch {
		return EDGE_KV_UPLOAD_CONCURRENCY;
	}
}

export const buildAssetManifest = async (
	dir: string,
	progress: ProgressLogger = logger
) => {
	const files = await readdir(dir, { recursive: true });
	logReadFilesFromDirectory(dir, files, progress);

	const manifest: AssetManifest = {};

	const { assetsIgnoreFunction, assetsIgnoreFilePresent } =
		await createAssetsIgnoreFunction(dir);

	await Promise.all(
		files.map(async (relativeFilepath) => {
			if (assetsIgnoreFunction(relativeFilepath)) {
				logger.debug("Ignoring asset:", relativeFilepath);
				// This file should not be included in the manifest.
				return;
			}

			const filepath = path.join(dir, relativeFilepath);
			const filestat = await stat(filepath);

			if (filestat.isSymbolicLink() || filestat.isDirectory()) {
				return;
			} else {
				errorOnLegacyPagesWorkerJSAsset(
					relativeFilepath,
					assetsIgnoreFilePresent
				);

				if (filestat.size > MAX_ASSET_SIZE) {
					throw new UserError(
						`Asset too large.\n` +
							`Cloudflare Workers supports assets with sizes of up to ${prettyBytes(
								MAX_ASSET_SIZE,
								{
									binary: true,
								}
							)}. We found a file ${filepath} with a size of ${prettyBytes(
								filestat.size,
								{
									binary: true,
								}
							)}.\n` +
							`Ensure all assets in your assets directory "${dir}" conform with the Workers maximum size requirement.`,
						{ telemetryMessage: "Asset too large" }
					);
				}
				manifest[normalizeFilePath(relativeFilepath)] = {
					hash: hashFile(filepath),
					size: filestat.size,
				};
			}
		})
	);
	return manifest;
};

function logAssetUpload(
	line: string,
	diffCount: number,
	progress: ProgressLogger
) {
	const level = logger.loggerLevel ?? "log";
	if (LOGGER_LEVELS[level] >= LOGGER_LEVELS.debug) {
		// If we're logging as debug level, we want *all* diff lines to be logged
		// at debug level, not just the first MAX_DIFF_LINES
		logger.debug(line);
	} else if (diffCount < MAX_DIFF_LINES) {
		// Otherwise, log  the first MAX_DIFF_LINES diffs at info level...
		progress.info(line);
	} else if (diffCount === MAX_DIFF_LINES) {
		// ...and warn when we start to truncate it
		const msg =
			"   (truncating changed assets log, set `WRANGLER_LOG=debug` environment variable to see full diff)";
		progress.info(chalk.dim(msg));
	}
	return ++diffCount;
}

/**
 * Logs a summary of the assets upload status ("Uploaded <count> of <total> assets"),
 * and the list of uploaded files if in debug log level.
 */
function logAssetsUploadStatus(
	numberFilesToUpload: number,
	uploadedAssetsCount: number,
	uploadedAssetFiles: string[],
	progress: ProgressLogger
) {
	progress.info(
		`Uploaded ${uploadedAssetsCount} of ${numberFilesToUpload} asset${
			numberFilesToUpload === 1 ? "" : "s"
		}`
	);
	uploadedAssetFiles.forEach((file) => logger.debug(`✨ ${file}`));
}

/**
 * Logs a summary of files read from a given directory ("Read <count>
 * files from directory <dir>"), and the list of read files if in
 * debug log level.
 */
function logReadFilesFromDirectory(
	directory: string,
	assetFiles: string[],
	progress: ProgressLogger
) {
	progress.info(
		`✨ Read ${assetFiles.length} file${
			assetFiles.length === 1 ? "" : "s"
		} from the assets directory ${directory}`
	);
	assetFiles.forEach((file) => logger.debug(`/${file}`));
}

const WORKER_JS_FILENAME = "_worker.js";

/**
 * Throws an error if the project has no `.assetsIgnore` file and is uploading
 * _worker.js code as an asset, which could expose server-side code publicly.
 */
function errorOnLegacyPagesWorkerJSAsset(
	file: string,
	hasAssetsIgnoreFile: boolean
) {
	if (!hasAssetsIgnoreFile) {
		const workerJsType: "file" | "directory" | null =
			file === WORKER_JS_FILENAME
				? "file"
				: file.startsWith(WORKER_JS_FILENAME)
					? "directory"
					: null;
		if (workerJsType !== null) {
			throw new UserError(
				`
Uploading a Pages ${WORKER_JS_FILENAME} ${workerJsType} as an asset.
This could expose your private server-side code to the public Internet. Is this intended?
If you do not want to upload this ${workerJsType}, either remove it or add an "${CF_ASSETS_IGNORE_FILENAME}" file, to the root of your asset directory, containing "${WORKER_JS_FILENAME}" to avoid uploading.
If you do want to upload this ${workerJsType}, you can add an empty "${CF_ASSETS_IGNORE_FILENAME}" file, to the root of your asset directory, to hide this error.
		`.trim(),
				{ telemetryMessage: "assets validation legacy pages worker asset" }
			);
		}
	}
}

export function resolveAssetOptions(
	{ assetsDir, main }: Pick<SharedDeployVersionsProps, "assetsDir" | "main">,
	config: Config
): AssetsOptions | undefined {
	if (!assetsDir) {
		return undefined;
	}

	const { directory, binding, directoryExists } = assetsDir;

	const routerConfig: RouterConfig = {
		has_user_worker: main !== undefined,
	};

	if (typeof config.assets?.run_worker_first === "boolean") {
		routerConfig.invoke_user_worker_ahead_of_assets =
			config.assets.run_worker_first;
	} else if (Array.isArray(config.assets?.run_worker_first)) {
		routerConfig.static_routing = parseStaticRouting(
			config.assets.run_worker_first
		);
	}

	// User Worker always ahead of assets, but no assets binding provided
	if (
		routerConfig.invoke_user_worker_ahead_of_assets &&
		!config?.assets?.binding
	) {
		logger.warn(
			"run_worker_first=true set without an assets binding\n" +
				"Setting run_worker_first to true will always invoke your Worker script.\n" +
				"To fetch your assets from your Worker, please set the [assets.binding] key in your configuration file.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#binding"
		);
	}

	// Using run_worker_first but didn't provide a Worker script
	if (
		!routerConfig.has_user_worker &&
		(routerConfig.invoke_user_worker_ahead_of_assets === true ||
			routerConfig.static_routing)
	) {
		throw new UserError(
			"Cannot set run_worker_first without a Worker script.\n" +
				"Please remove run_worker_first from your configuration file, or provide a Worker script in your configuration file (`main`).",
			{ telemetryMessage: "assets router missing worker script" }
		);
	}

	const _redirects = directoryExists
		? maybeGetFile(path.join(directory, REDIRECTS_FILENAME))
		: undefined;
	const _headers = directoryExists
		? maybeGetFile(path.join(directory, HEADERS_FILENAME))
		: undefined;

	// defaults are set in asset worker
	const assetConfig: AssetConfig = {
		html_handling: config.assets?.html_handling,
		not_found_handling: config.assets?.not_found_handling,
		// The _redirects and _headers files are parsed in Miniflare in dev and parsing is not required for deploy
		compatibility_date: config.compatibility_date,
		compatibility_flags: config.compatibility_flags,
	};

	return {
		directory,
		binding,
		routerConfig,
		assetConfig,
		_redirects,
		_headers,
		// raw static routing rules for upload. routerConfig.static_routing contains the rules processed for dev.
		run_worker_first: config.assets?.run_worker_first,
	};
}
