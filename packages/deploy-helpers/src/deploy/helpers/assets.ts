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
// Node clamps larger setTimeout delays to 1 ms, so long deadlines use slices.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

const MAX_DIFF_LINES = 100;

export const syncAssets = async (
	complianceConfig: ComplianceConfig,
	accountId: string | undefined,
	assetDirectory: string,
	scriptName: string,
	dispatchNamespace?: string
): Promise<AssetsUploadResult> => {
	assert(accountId, "Missing accountId");

	// 1. generate asset manifest
	logger.info("🌀 Building list of assets...");
	const manifest = await buildAssetManifest(assetDirectory);

	const url = dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}/assets-upload-session`
		: `/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`;

	// 2. fetch buckets w/ hashes
	logger.info("🌀 Starting asset upload...");
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
		logger.info(
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
	logger.info(
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
			assetLogCount = logAssetUpload(`+ ${manifestEntry[0]}`, assetLogCount);
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
	const requestQueue = new PQueue({ concurrency });
	const uploadAbortController = new AbortController();
	const queuePromises: Array<Promise<void>> = [];
	const start = Date.now();
	let completionJwt = "";
	let uploadedAssetsCount = 0;
	let uploadedBytes = 0;
	let uploadCancelled = false;
	const cancelPendingRequests = new Set<(reason?: unknown) => void>();
	type PendingRetrySleep = {
		timeout: ReturnType<typeof setTimeout>;
		resolve: () => void;
	};
	const pendingRetrySleeps = new Set<PendingRetrySleep>();
	let concurrencyThrottleGeneration = 0;
	let retryAfterDeadline = 0;
	let retryAfterPauseGeneration = 0;
	let retryAfterResumeTimeout: ReturnType<typeof setTimeout> | undefined;
	let retryAfterGate = Promise.resolve();
	let resolveRetryAfterGate: (() => void) | undefined;
	const registeredRetryAfterErrors = new WeakMap<
		APIError,
		{ retryAfterMs: number; extendsDeadline: boolean }
	>();

	function getRetryAfterMs(error: unknown): number | undefined {
		if (
			!(error instanceof APIError) ||
			error.retryAfterMs === undefined ||
			!Number.isFinite(error.retryAfterMs) ||
			error.retryAfterMs < 0
		) {
			return undefined;
		}

		return error.retryAfterMs;
	}

	async function queueUploadRequest(
		request: () => Promise<UploadResponse>,
		canRetry: boolean
	): Promise<{ response: UploadResponse; generation: number }> {
		uploadAbortController.signal.throwIfAborted();
		const queuedRequest = requestQueue.add(async () => {
			uploadAbortController.signal.throwIfAborted();
			const generation = concurrencyThrottleGeneration;
			try {
				return { response: await request(), generation };
			} catch (error) {
				// Pause before this task rejects so the limiter cannot release its slot
				// and start another request during the API's Retry-After window.
				const retryAfterMs = getRetryAfterMs(error);
				if (
					!uploadCancelled &&
					canRetry &&
					error instanceof APIError &&
					retryAfterMs !== undefined
				) {
					registeredRetryAfterErrors.set(error, {
						retryAfterMs,
						extendsDeadline: pauseUploadsForRetryAfter(retryAfterMs),
					});
				}
				throw error;
			}
		});

		let rejectCancellation: ((reason?: unknown) => void) | undefined;
		const cancellation = new Promise<never>(
			(_resolvePromise, rejectPromise) => {
				rejectCancellation = rejectPromise;
				cancelPendingRequests.add(rejectPromise);
			}
		);
		try {
			return await Promise.race([queuedRequest, cancellation]);
		} finally {
			if (rejectCancellation !== undefined) {
				cancelPendingRequests.delete(rejectCancellation);
			}
		}
	}

	// A Retry-After response from any bucket pauses the whole upload session.
	// The generation guard prevents an older timer from resuming either queue
	// after a later response has extended the shared deadline.
	function scheduleRetryAfterResume(generation: number): void {
		retryAfterResumeTimeout = setTimeout(
			() => {
				if (uploadCancelled || generation !== retryAfterPauseGeneration) {
					return;
				}

				const remainingMs = retryAfterDeadline - Date.now();
				if (remainingMs > 0) {
					scheduleRetryAfterResume(generation);
					return;
				}

				retryAfterResumeTimeout = undefined;
				const resolveGate = resolveRetryAfterGate;
				resolveRetryAfterGate = undefined;
				resolveGate?.();
				requestQueue.start();
				queue.start();
			},
			Math.min(MAX_TIMER_DELAY_MS, Math.max(0, retryAfterDeadline - Date.now()))
		);
	}

	function pauseUploadsForRetryAfter(retryAfterMs: number): boolean {
		if (uploadCancelled) {
			return false;
		}

		const requestedDeadline = Date.now() + retryAfterMs;
		const extendsDeadline = requestedDeadline > retryAfterDeadline;
		retryAfterDeadline = Math.max(retryAfterDeadline, requestedDeadline);
		requestQueue.pause();
		queue.pause();

		if (resolveRetryAfterGate === undefined) {
			retryAfterGate = new Promise<void>((resolvePromise) => {
				resolveRetryAfterGate = resolvePromise;
			});
		}

		retryAfterPauseGeneration++;
		if (retryAfterResumeTimeout !== undefined) {
			clearTimeout(retryAfterResumeTimeout);
		}
		scheduleRetryAfterResume(retryAfterPauseGeneration);

		return extendsDeadline;
	}

	async function waitBeforeRetry(delayMs: number): Promise<void> {
		await new Promise<void>((resolvePromise) => {
			const pendingRetrySleep: PendingRetrySleep = {
				timeout: setTimeout(() => {
					pendingRetrySleeps.delete(pendingRetrySleep);
					resolvePromise();
				}, delayMs),
				resolve: resolvePromise,
			};
			pendingRetrySleeps.add(pendingRetrySleep);
		});
		uploadAbortController.signal.throwIfAborted();
	}

	function stopRetryAfterPause(): void {
		retryAfterPauseGeneration++;
		if (retryAfterResumeTimeout !== undefined) {
			clearTimeout(retryAfterResumeTimeout);
			retryAfterResumeTimeout = undefined;
		}

		const resolveGate = resolveRetryAfterGate;
		resolveRetryAfterGate = undefined;
		resolveGate?.();
	}

	function cancelUploads(): void {
		if (uploadCancelled) {
			return;
		}

		// Mark the session as cancelled before touching the queues. Active tasks can
		// otherwise observe queue cleanup and schedule new retry timers afterward.
		uploadCancelled = true;
		queue.pause();
		requestQueue.pause();
		queue.clear();
		requestQueue.clear();
		uploadAbortController.abort();
		for (const cancelPendingRequest of cancelPendingRequests) {
			cancelPendingRequest(uploadAbortController.signal.reason);
		}
		cancelPendingRequests.clear();
		for (const pendingRetrySleep of pendingRetrySleeps) {
			clearTimeout(pendingRetrySleep.timeout);
			pendingRetrySleep.resolve();
		}
		pendingRetrySleeps.clear();
		stopRetryAfterPause();
	}

	for (const [bucketIndex, bucket] of uploadBuckets.entries()) {
		let attempts = 0;
		let gatewayErrors = 0;
		const doUpload = async (): Promise<UploadResponse> => {
			uploadAbortController.signal.throwIfAborted();
			while (resolveRetryAfterGate !== undefined) {
				await retryAfterGate;
			}
			uploadAbortController.signal.throwIfAborted();
			const uploadedFiles: string[] = [];
			for (const manifestEntry of bucket) {
				uploadedFiles.push(manifestEntry[0]);
			}

			try {
				let res: UploadResponse;
				let uploadGeneration: number;
				if (useSingleAssetUpload) {
					const manifestEntry = bucket[0];
					const absFilePath = path.join(assetDirectory, manifestEntry[0]);
					const contentType = getContentType(absFilePath);
					const upload = await queueUploadRequest(
						() =>
							fetchResult<UploadResponse>(
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
								},
								undefined,
								uploadAbortController.signal
							),
						attempts < MAX_UPLOAD_ATTEMPTS
					);
					res = upload.response;
					uploadGeneration = upload.generation;
				} else {
					// Populate the payload only when actually uploading (this is limited to 3 concurrent uploads at 50 MiB per bucket meaning we'd only load in a max of ~150 MiB)
					// This is so we don't run out of memory trying to upload the files.
					const payload = new FormData();
					for (const manifestEntry of bucket) {
						uploadAbortController.signal.throwIfAborted();
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
					const upload = await queueUploadRequest(
						() =>
							fetchResult<UploadResponse>(
								complianceConfig,
								`/accounts/${accountId}/workers/assets/upload?base64=true`,
								{
									method: "POST",
									headers: {
										Authorization: `Bearer ${initializeAssetsResponse.jwt}`,
									},
									body: payload,
								},
								undefined,
								uploadAbortController.signal
							),
						attempts < MAX_UPLOAD_ATTEMPTS
					);
					res = upload.response;
					uploadGeneration = upload.generation;
				}
				uploadAbortController.signal.throwIfAborted();
				// Only requests started after the latest throttle may restore capacity.
				// Otherwise, requests that were already in flight could immediately undo it.
				if (
					queue.concurrency < concurrency &&
					uploadGeneration === concurrencyThrottleGeneration
				) {
					const recoveredConcurrency = queue.concurrency + 1;
					requestQueue.concurrency = recoveredConcurrency;
					queue.concurrency = recoveredConcurrency;
					logger.debug(
						`Asset upload concurrency recovered to ${recoveredConcurrency}.`
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
					uploadedFiles
				);
				return res;
			} catch (e) {
				if (uploadCancelled) {
					throw e;
				}

				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					const attemptNumber = attempts + 1;
					const retryDelayMs = Math.pow(2, attempts) * 1000;
					const isGatewayError = e instanceof APIError && e.isGatewayError();
					let gatewayRetryDelayMs = 0;

					if (isGatewayError) {
						// Gateway problem, set concurrency to 1 before waiting.
						concurrencyThrottleGeneration++;
						requestQueue.concurrency = 1;
						queue.concurrency = 1;
						logger.debug(
							"Asset upload concurrency throttled to 1 after a gateway error."
						);
						gatewayRetryDelayMs = Math.pow(2, gatewayErrors) * 5000;
						gatewayErrors++;
						// Only count as a failed attempt after a few initial gateway errors.
						if (gatewayErrors >= MAX_UPLOAD_GATEWAY_ERRORS) {
							attempts++;
						}
					} else {
						attempts++;
					}

					const registeredRetryAfter =
						e instanceof APIError
							? registeredRetryAfterErrors.get(e)
							: undefined;
					if (registeredRetryAfter?.extendsDeadline) {
						logger.info(
							chalk.dim(
								`Received a "Retry-After" header from the Cloudflare API. Waiting ${Math.ceil(registeredRetryAfter.retryAfterMs / 1000)} second(s) before retrying...`
							)
						);
					}
					logger.info(
						chalk.dim(
							`Asset upload failed. Retrying... ${attemptNumber} of ${MAX_UPLOAD_ATTEMPTS} attempts.\n`
						)
					);
					logger.debug(e);
					if (registeredRetryAfter === undefined) {
						// Exponential backoff, 1 second first time, then 2 seconds,
						// then 4 seconds, etc.
						await waitBeforeRetry(retryDelayMs);
						if (isGatewayError) {
							await waitBeforeRetry(gatewayRetryDelayMs);
						}
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
			queue.add(async () => {
				try {
					const res = await doUpload();
					completionJwt = res.jwt || completionJwt;
				} catch (error) {
					// Cancel before PQueue releases this slot, otherwise it can start the
					// next bucket before Promise.all observes the rejection.
					if (!uploadCancelled) {
						logger.error(
							error instanceof Error ? error.message : String(error)
						);
					}
					cancelUploads();
					throw error;
				}
			})
		);
	}
	// using Promise.all() here instead of queue.onIdle() to ensure
	// we actually throw errors that occur within queued promises.
	try {
		await Promise.all(queuePromises);
	} catch (error) {
		cancelUploads();
		throw error;
	} finally {
		stopRetryAfterPause();
	}

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

	logger.log(
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

export const buildAssetManifest = async (dir: string) => {
	const files = await readdir(dir, { recursive: true });
	logReadFilesFromDirectory(dir, files);

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

function logAssetUpload(line: string, diffCount: number) {
	const level = logger.loggerLevel ?? "log";
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
	return ++diffCount;
}

/**
 * Logs a summary of the assets upload status ("Uploaded <count> of <total> assets"),
 * and the list of uploaded files if in debug log level.
 */
function logAssetsUploadStatus(
	numberFilesToUpload: number,
	uploadedAssetsCount: number,
	uploadedAssetFiles: string[]
) {
	logger.info(
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
function logReadFilesFromDirectory(directory: string, assetFiles: string[]) {
	logger.info(
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
