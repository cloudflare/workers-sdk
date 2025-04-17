import assert from "node:assert";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import {
	getContentType,
	MAX_ASSET_COUNT,
	MAX_ASSET_SIZE,
	normalizeFilePath,
} from "@cloudflare/workers-shared";
import {
	CF_ASSETS_IGNORE_FILENAME,
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import {
	createAssetsIgnoreFunction,
	maybeGetFile,
} from "@cloudflare/workers-shared/utils/helpers";
import chalk from "chalk";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import { File, FormData } from "undici";
import { fetchResult } from "./cfetch";
import { defaultWranglerConfig } from "./config/config";
import { formatTime } from "./deploy/deploy";
import { FatalError, UserError } from "./errors";
import { logger, LOGGER_LEVELS } from "./logger";
import { hashFile } from "./pages/hash";
import { isJwtExpired } from "./pages/upload";
import { APIError } from "./parse";
import { dedent } from "./utils/dedent";
import type { Config } from "./config";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";

const WORKER_JS_FILENAME = "_worker.js";

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
	let counter = 0;

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

				if (counter >= MAX_ASSET_COUNT) {
					throw new UserError(
						`Maximum number of assets exceeded.\n` +
							`Cloudflare Workers supports up to ${MAX_ASSET_COUNT.toLocaleString()} assets in a version. We found ${counter.toLocaleString()} files in the specified assets directory "${dir}".\n` +
							`Ensure your assets directory contains a maximum of ${MAX_ASSET_COUNT.toLocaleString()} files, and that you have specified your assets directory correctly.`,
						{ telemetryMessage: "Maximum number of assets exceeded" }
					);
				}

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
				counter++;
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
	return diffCount++;
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
};

export function getAssetsOptions(
	args: { assets: string | undefined; script?: string },
	config: Config
): AssetsOptions | undefined {
	const assets = args.assets ? { directory: args.assets } : config.assets;

	if (!assets) {
		return;
	}

	const { directory, binding } = assets;

	if (directory === undefined) {
		throw new UserError(
			"The `assets` property in your configuration is missing the required `directory` property.",
			{ telemetryMessage: true }
		);
	}

	if (directory === "") {
		throw new UserError("`The assets directory cannot be an empty string.", {
			telemetryMessage: true,
		});
	}

	const assetsBasePath = getAssetsBasePath(config, args.assets);
	const resolvedAssetsPath = path.resolve(assetsBasePath, directory);

	if (!existsSync(resolvedAssetsPath)) {
		const sourceOfTruthMessage = args.assets
			? '"--assets" command line argument'
			: '"assets.directory" field in your configuration file';

		throw new UserError(
			`The directory specified by the ${sourceOfTruthMessage} does not exist:\n` +
				`${resolvedAssetsPath}`,

			{
				telemetryMessage: `The assets directory specified does not exist`,
			}
		);
	}

	const routerConfig: RouterConfig = {
		has_user_worker: Boolean(args.script || config.main),
		invoke_user_worker_ahead_of_assets: config.assets?.run_worker_first,
	};

	// User Worker ahead of assets, but no assets binding provided
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

	// Using run_worker_first = true but didn't provide a Worker script
	if (
		!routerConfig.has_user_worker &&
		routerConfig.invoke_user_worker_ahead_of_assets === true
	) {
		throw new UserError(
			"Cannot set run_worker_first=true without a Worker script.\n" +
				"Please remove run_worker_first from your configuration file, or provide a Worker script in your configuration file (`main`)."
		);
	}

	const redirects = maybeGetFile(
		path.join(resolvedAssetsPath, REDIRECTS_FILENAME)
	);
	const headers = maybeGetFile(path.join(resolvedAssetsPath, HEADERS_FILENAME));

	// defaults are set in asset worker
	const assetConfig: AssetConfig = {
		html_handling: config.assets?.html_handling,
		not_found_handling: config.assets?.not_found_handling,
		// The _redirects and _headers files are parsed in Miniflare in dev and parsing is not required for deploy
		compatibility_date: config.compatibility_date,
		compatibility_flags: config.compatibility_flags,
	};

	return {
		directory: resolvedAssetsPath,
		binding,
		routerConfig,
		assetConfig,
		_redirects: redirects,
		_headers: headers,
	};
}

/**
 * Validate assets configuration against the following requirements:
 *     - assets cannot be used in combination with a few other select
 *        Workers features, such as: legacy assets, sites and tail consumers
 *     - an asset binding cannot be used in a Worker that only has assets
 *     - a Worker that has only assets can be configured with only a few select
 *       configuration file keys
 * and throw an appropriate error if invalid.
 */
export function validateAssetsArgsAndConfig(
	args: {
		site: string | undefined;
		assets: string | undefined;
		script: string | undefined;
	},
	// args: StartDevOptions | DeployArgs | VersionsUploadArgs,
	config: Config
): void {
	if ((args.assets || config.assets) && (args.site || config.site)) {
		throw new UserError(
			"Cannot use assets and Workers Sites in the same Worker.\n" +
				"Please remove either the `site` or `assets` field from your configuration file."
		);
	}

	if (!(args.script || config.main) && config.assets?.binding) {
		throw new UserError(
			"Cannot use assets with a binding in an assets-only Worker.\n" +
				"Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (`main`).",
			{ telemetryMessage: true }
		);
	}

	// Smart placement turned on when using assets
	if (
		config.placement?.mode === "smart" &&
		config.assets?.run_worker_first === true
	) {
		logger.warn(
			"Turning on Smart Placement in a Worker that is using assets and run_worker_first set to true means that your entire Worker could be moved to run closer to your data source, and all requests will go to that Worker before serving assets.\n" +
				"This could result in poor performance as round trip times could increase when serving assets.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#smart-placement"
		);
	}

	if (
		(args.assets || config.assets?.directory) &&
		!(args.script || config.main)
	) {
		const unsupportedConfigKeys = getConfigKeysUnsupportedByAssetsOnly(config);

		if (unsupportedConfigKeys.length > 0) {
			const keys = unsupportedConfigKeys.map((key) => `⋅ "${key}"`).join("\n");

			throw new UserError(
				`Assets-only Workers do not support the following configuration keys:\n\n` +
					`${keys}\n\n` +
					`Please remove these fields from your configuration file, or configure the "main" field if you are trying to deploy a Worker with assets.`
			);
		}
	}
}

function getConfigKeysUnsupportedByAssetsOnly(config: Config): Array<string> {
	const supportedAssetsOnlyConfigKeys = new Set([
		"name",
		"compatibility_date",
		"compatibility_flags",
		"assets",
		"build",
		"dev",
		"routes",
		// computed fields (see normalizeAndValidateConfig())
		"configPath",
		"userConfigPath",
		"topLevelName",
	]);

	const configKeys = new Set(Object.keys(config) as Array<keyof Config>);
	const unsupportedKeys: Set<string> = new Set();

	for (const key of configKeys) {
		// if this is an unsupported key with a non-default config value,
		// add to `unsupportedKeys`
		if (
			!supportedAssetsOnlyConfigKeys.has(key) &&
			config[key] !== undefined &&
			JSON.stringify(config[key]) !== JSON.stringify(defaultWranglerConfig[key])
		) {
			unsupportedKeys.add(key);
		}
	}

	return Array.from(unsupportedKeys.keys());
}

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
