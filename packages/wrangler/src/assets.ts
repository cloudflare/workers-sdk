import assert from "node:assert";
import { existsSync } from "node:fs";
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
import chalk from "chalk";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import { FormData } from "undici";
import { fetchResult } from "./cfetch";
import { formatTime } from "./deploy/deploy";
import { FatalError, UserError } from "./errors";
import { logger, LOGGER_LEVELS } from "./logger";
import { hashFile } from "./pages/hash";
import { isJwtExpired } from "./pages/upload";
import { APIError } from "./parse";
import { getBasePath } from "./paths";
import { dedent } from "./utils/dedent";
import type { StartDevWorkerOptions } from "./api";
import type { Config } from "./config";
import type { DeployArgs } from "./deploy";
import type { StartDevOptions } from "./dev";
import type { ComplianceConfig } from "./environment-variables/misc-variables";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";

export type AssetManifest = { [path: string]: { hash: string; size: number } };

type InitializeAssetsResponse = {
	// string of file hashes per bucket
	buckets: string[][];
	jwt: string;
};

type UploadResponse = {
	jwt?: string;
};

// constants same as Pages for now
const BULK_UPLOAD_CONCURRENCY = 3;
const MAX_UPLOAD_ATTEMPTS = 5;
const MAX_UPLOAD_GATEWAY_ERRORS = 5;

const MAX_DIFF_LINES = 100;

export const syncAssets = async (
	complianceConfig: ComplianceConfig,
	accountId: string | undefined,
	assetDirectory: string,
	scriptName: string,
	dispatchNamespace?: string
): Promise<string> => {
	assert(accountId, "Missing accountId");

	// 1. generate asset manifest
	logger.info("🌀 Building list of assets...");
	const manifest = await buildAssetManifest(assetDirectory);

	const url = dispatchNamespace
		? `/accounts/${accountId}/workers/dispatch/namespaces/${dispatchNamespace}/scripts/${scriptName}/assets-upload-session`
		: `/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`;

	// 2. fetch buckets w/ hashes
	logger.info("🌀 Starting asset upload...");
	const initializeAssetsResponse = await fetchResult<InitializeAssetsResponse>(
		complianceConfig,
		url,
		{
			headers: { "Content-Type": "application/json" },
			method: "POST",
			body: JSON.stringify({ manifest: manifest }),
		}
	);

	// if nothing to upload, return
	if (initializeAssetsResponse.buckets.flat().length === 0) {
		if (!initializeAssetsResponse.jwt) {
			throw new FatalError(
				"Could not find assets information to attach to deployment. Please try again.",
				1,
				{ telemetryMessage: true }
			);
		}
		logger.info(
			`No updated asset files to upload. Proceeding with deployment...`
		);
		return initializeAssetsResponse.jwt;
	}

	// 3. fill buckets and upload assets
	const numberFilesToUpload = initializeAssetsResponse.buckets.flat().length;
	logger.info(
		`🌀 Found ${numberFilesToUpload} new or modified static asset${numberFilesToUpload > 1 ? "s" : ""} to upload. Proceeding with upload...`
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
					1,
					{
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

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });
	const queuePromises: Array<Promise<void>> = [];
	let attempts = 0;
	const start = Date.now();
	let completionJwt = "";
	let uploadedAssetsCount = 0;

	for (const [bucketIndex, bucket] of assetBuckets.entries()) {
		attempts = 0;
		let gatewayErrors = 0;
		const doUpload = async (): Promise<UploadResponse> => {
			// Populate the payload only when actually uploading (this is limited to 3 concurrent uploads at 50 MiB per bucket meaning we'd only load in a max of ~150 MiB)
			// This is so we don't run out of memory trying to upload the files.
			const payload = new FormData();
			const uploadedFiles: string[] = [];
			for (const manifestEntry of bucket) {
				const absFilePath = path.join(assetDirectory, manifestEntry[0]);
				uploadedFiles.push(manifestEntry[0]);
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

			try {
				const res = await fetchResult<UploadResponse>(
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
				uploadedAssetsCount += bucket.length;
				logAssetsUploadStatus(
					numberFilesToUpload,
					uploadedAssetsCount,
					uploadedFiles
				);
				return res;
			} catch (e) {
				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					logger.info(chalk.dim(`Asset upload failed. Retrying...\n`, e));
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
						`Upload took too long.\n` +
							`Asset upload took too long on bucket ${bucketIndex + 1}/${initializeAssetsResponse.buckets.length}. Please try again.\n` +
							`Assets already uploaded have been saved, so the next attempt will automatically resume from this point.`,
						undefined,
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
		throw new FatalError(
			"Failed to complete asset upload. Please try again.",
			1,
			{ telemetryMessage: true }
		);
	}

	const uploadMs = Date.now() - start;
	const skipped = Object.keys(manifest).length - numberFilesToUpload;
	const skippedMessage = skipped > 0 ? `(${skipped} already uploaded) ` : "";

	logger.log(
		`✨ Success! Uploaded ${numberFilesToUpload} file${numberFilesToUpload > 1 ? "s" : ""} ${skippedMessage}${formatTime(uploadMs)}\n`
	);

	return completionJwt;
};

const buildAssetManifest = async (dir: string) => {
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
		`Uploaded ${uploadedAssetsCount} of ${numberFilesToUpload} assets`
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
		`✨ Read ${assetFiles.length} file${assetFiles.length === 1 ? "" : "s"} from the assets directory ${directory}`
	);
	assetFiles.forEach((file) => logger.debug(`/${file}`));
}

/**
 * Returns the base path of the assets to upload.
 *
 */
function getAssetsBasePath(
	config: Config,
	assetsCommandLineArg: string | undefined
): string {
	return assetsCommandLineArg
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));
}

export type AssetsOptions = {
	directory: string;
	binding?: string;
	routerConfig: RouterConfig;
	assetConfig: AssetConfig;
	_redirects?: string;
	_headers?: string;
	run_worker_first?: boolean | string[];
};

export class NonExistentAssetsDirError extends UserError {}

export function getAssetsOptions(
	args: { assets: string | undefined; script?: string },
	config: Config,
	overrides?: Partial<AssetsOptions>
): AssetsOptions | undefined {
	if (!overrides && !config.assets && !args.assets) {
		return;
	}

	const assets = {
		...config.assets,
		...(args.assets && { directory: args.assets }),
		...overrides,
	};

	if (assets.directory === undefined) {
		throw new UserError(
			"The `assets` property in your configuration is missing the required `directory` property.",
			{ telemetryMessage: true }
		);
	}

	if (assets.directory === "") {
		throw new UserError("`The assets directory cannot be an empty string.", {
			telemetryMessage: true,
		});
	}

	const assetsBasePath = getAssetsBasePath(config, args.assets);
	const directory = path.resolve(assetsBasePath, assets.directory);

	if (!existsSync(directory)) {
		const sourceOfTruthMessage = args.assets
			? '"--assets" command line argument'
			: '"assets.directory" field in your configuration file';

		throw new NonExistentAssetsDirError(
			`The directory specified by the ${sourceOfTruthMessage} does not exist:\n` +
				`${directory}`,

			{
				telemetryMessage: `The assets directory specified does not exist`,
			}
		);
	}

	const routerConfig: RouterConfig = {
		has_user_worker: Boolean(args.script || config.main),
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
			{ telemetryMessage: true }
		);
	}

	const _redirects = maybeGetFile(path.join(directory, REDIRECTS_FILENAME));
	const _headers = maybeGetFile(path.join(directory, HEADERS_FILENAME));

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
		binding: assets.binding,
		routerConfig,
		assetConfig,
		_redirects,
		_headers,
		// raw static routing rules for upload. routerConfig.static_routing contains the rules processed for dev.
		run_worker_first: config.assets?.run_worker_first,
	};
}

/**
 * Validate assets configuration against the following requirements:
 *     - assets cannot be used in combination with a few other select
 *        Workers features, such as: legacy assets, sites and tail consumers
 *     - an asset binding cannot be used in a Worker that only has assets
 * and throw an appropriate error if invalid.
 */
export function validateAssetsArgsAndConfig(
	args: Pick<StartDevWorkerOptions, "legacy" | "assets" | "entrypoint">
): void;
export function validateAssetsArgsAndConfig(
	args:
		| Pick<StartDevOptions, "site" | "assets" | "script">
		| Pick<DeployArgs, "site" | "assets" | "script">,
	config: Config
): void;
export function validateAssetsArgsAndConfig(
	args:
		| Pick<StartDevOptions, "site" | "assets" | "script">
		| Pick<DeployArgs, "site" | "assets" | "script">
		| Pick<StartDevWorkerOptions, "legacy" | "assets" | "entrypoint">,
	config?: Config
): void {
	if (
		"legacy" in args
			? args.assets && args.legacy.site
			: (args.assets || config?.assets) && (args.site || config?.site)
	) {
		throw new UserError(
			"Cannot use assets and Workers Sites in the same Worker.\n" +
				"Please remove either the `site` or `assets` field from your configuration file.",
			{ telemetryMessage: true }
		);
	}

	const noOpEntrypoint = path.resolve(
		getBasePath(),
		"templates/no-op-worker.js"
	);

	if (
		"legacy" in args
			? args.entrypoint === noOpEntrypoint && args.assets?.binding
			: !(args.script || config?.main) && config?.assets?.binding
	) {
		throw new UserError(
			"Cannot use assets with a binding in an assets-only Worker.\n" +
				"Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (`main`).",
			{ telemetryMessage: true }
		);
	}

	// Smart placement turned on when using assets
	if (
		config?.placement?.mode === "smart" &&
		config?.assets?.run_worker_first === true
	) {
		logger.warn(
			"Turning on Smart Placement in a Worker that is using assets and run_worker_first set to true means that your entire Worker could be moved to run closer to your data source, and all requests will go to that Worker before serving assets.\n" +
				"This could result in poor performance as round trip times could increase when serving assets.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#smart-placement"
		);
	}
}

const WORKER_JS_FILENAME = "_worker.js";

/**
 * Creates a function that logs a warning (only once) if the project has no `.assetsIgnore` file and is uploading _worker.js code as an asset.
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
				dedent`
			Uploading a Pages ${WORKER_JS_FILENAME} ${workerJsType} as an asset.
			This could expose your private server-side code to the public Internet. Is this intended?
			If you do not want to upload this ${workerJsType}, either remove it or add an "${CF_ASSETS_IGNORE_FILENAME}" file, to the root of your asset directory, containing "${WORKER_JS_FILENAME}" to avoid uploading.
			If you do want to upload this ${workerJsType}, you can add an empty "${CF_ASSETS_IGNORE_FILENAME}" file, to the root of your asset directory, to hide this error.
		`,
				{ telemetryMessage: true }
			);
		}
	}
}
