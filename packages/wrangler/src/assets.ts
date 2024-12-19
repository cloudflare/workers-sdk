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
import chalk from "chalk";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import { File, FormData } from "undici";
import { fetchResult } from "./cfetch";
import { formatTime } from "./deploy/deploy";
import { FatalError, UserError } from "./errors";
import { logger, LOGGER_LEVELS } from "./logger";
import { hashFile } from "./pages/hash";
import { isJwtExpired } from "./pages/upload";
import { APIError } from "./parse";
import { getBasePath } from "./paths";
import { dedent } from "./utils/dedent";
import { createPatternMatcher } from "./utils/filesystem";
import type { StartDevWorkerOptions } from "./api";
import type { Config } from "./config";
import type { DeployArgs } from "./deploy";
import type { StartDevOptions } from "./dev";
import type { AssetConfig, RoutingConfig } from "@cloudflare/workers-shared";

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
				1
			);
		}
		logger.info(`No files to upload. Proceeding with deployment...`);
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
					1
				);
			}
			// just logging file uploads at the moment...
			// unsure how to log deletion vs unchanged file ignored/if we want to log this
			assetLogCount = logAssetUpload(`+ ${manifestEntry[0]}`, assetLogCount);
			return manifestEntry;
		});
	});

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });
	let attempts = 0;
	const start = Date.now();
	let completionJwt = "";
	let assetUploadCount = 0;

	for (const [bucketIndex, bucket] of assetBuckets.entries()) {
		attempts = 0;
		let gatewayErrors = 0;
		const doUpload = async (): Promise<UploadResponse> => {
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
							type: getContentType(absFilePath),
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
				assetUploadCount += bucket.length;
				logger.info(
					`Uploaded ${assetUploadCount} of ${numberFilesToUpload} assets`
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
							`Assets already uploaded have been saved, so the next attempt will automatically resume from this point.`
					);
				} else {
					throw e;
				}
			}
		};
		// add to queue and run it if we haven't reached concurrency limit
		void queue.add(() =>
			doUpload().then((res) => {
				completionJwt = res.jwt || completionJwt;
			})
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
			"Failed to complete asset upload. Please try again.",
			1
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
	const manifest: AssetManifest = {};
	let counter = 0;

	const ignoreFn = await createAssetIgnoreFunction(dir);

	await Promise.all(
		files.map(async (relativeFilepath) => {
			if (ignoreFn?.(relativeFilepath)) {
				logger.debug("Ignoring asset:", relativeFilepath);
				// This file should not be included in the manifest.
				return;
			}

			const filepath = path.join(dir, relativeFilepath);
			const filestat = await stat(filepath);

			if (filestat.isSymbolicLink() || filestat.isDirectory()) {
				return;
			} else {
				errorOnLegacyPagesWorkerJSAsset(relativeFilepath, !!ignoreFn);

				if (counter >= MAX_ASSET_COUNT) {
					throw new UserError(
						`Maximum number of assets exceeded.\n` +
							`Cloudflare Workers supports up to ${MAX_ASSET_COUNT.toLocaleString()} assets in a version. We found ${counter.toLocaleString()} files in the specified assets directory "${dir}".\n` +
							`Ensure your assets directory contains a maximum of ${MAX_ASSET_COUNT.toLocaleString()} files, and that you have specified your assets directory correctly.`
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
							`Ensure all assets in your assets directory "${dir}" conform with the Workers maximum size requirement.`
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
	routingConfig: RoutingConfig;
	assetConfig: AssetConfig;
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
			"The `assets` property in your configuration is missing the required `directory` property."
		);
	}

	if (directory === "") {
		throw new UserError("`The assets directory cannot be an empty string.");
	}

	const assetsBasePath = getAssetsBasePath(config, args.assets);
	const resolvedAssetsPath = path.resolve(assetsBasePath, directory);

	if (!existsSync(resolvedAssetsPath)) {
		const sourceOfTruthMessage = args.assets
			? '"--assets" command line argument'
			: '"assets.directory" field in your configuration file';

		throw new UserError(
			`The directory specified by the ${sourceOfTruthMessage} does not exist:\n` +
				`${resolvedAssetsPath}`
		);
	}

	const routingConfig = {
		has_user_worker: Boolean(args.script || config.main),
		invoke_user_worker_ahead_of_assets: !(
			config.assets?.experimental_serve_directly ?? true
		),
	};
	// defaults are set in asset worker
	const assetConfig = {
		html_handling: config.assets?.html_handling,
		not_found_handling: config.assets?.not_found_handling,
		serve_directly: config.assets?.experimental_serve_directly,
	};

	return {
		directory: resolvedAssetsPath,
		binding,
		routingConfig,
		assetConfig,
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
		| Pick<StartDevOptions, "legacyAssets" | "site" | "assets" | "script">
		| Pick<DeployArgs, "legacyAssets" | "site" | "assets" | "script">,
	config: Config
): void;
export function validateAssetsArgsAndConfig(
	args:
		| Pick<StartDevOptions, "legacyAssets" | "site" | "assets" | "script">
		| Pick<DeployArgs, "legacyAssets" | "site" | "assets" | "script">
		| Pick<StartDevWorkerOptions, "legacy" | "assets" | "entrypoint">,
	config?: Config
): void {
	/*
	 * - `config.legacy_assets` conflates `legacy_assets` and `assets`
	 * - `args.legacyAssets` conflates `legacy-assets` and `assets`
	 */
	if (
		"legacy" in args
			? args.assets && args.legacy.legacyAssets
			: (args.assets || config?.assets) &&
				(args?.legacyAssets || config?.legacy_assets)
	) {
		throw new UserError(
			"Cannot use assets and legacy assets in the same Worker.\n" +
				"Please remove either the `legacy_assets` or `assets` field from your configuration file."
		);
	}

	if (
		"legacy" in args
			? args.assets && args.legacy.site
			: (args.assets || config?.assets) && (args.site || config?.site)
	) {
		throw new UserError(
			"Cannot use assets and Workers Sites in the same Worker.\n" +
				"Please remove either the `site` or `assets` field from your configuration file."
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
				"Please remove the asset binding from your configuration file, or provide a Worker script in your configuration file (`main`)."
		);
	}

	// Smart placement turned on when using assets
	if (
		config?.placement?.mode === "smart" &&
		config?.assets?.experimental_serve_directly === false
	) {
		logger.warn(
			"Turning on Smart Placement in a Worker that is using assets and serve_directly set to false means that your entire Worker could be moved to run closer to your data source, and all requests will go to that Worker before serving assets.\n" +
				"This could result in poor performance as round trip times could increase when serving assets.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#smart-placement"
		);
	}

	// User Worker ahead of assets, but no assets binding provided
	if (
		"legacy" in args
			? args.assets?.assetConfig?.serve_directly === false &&
				!args.assets?.binding
			: config?.assets?.experimental_serve_directly === false &&
				!config?.assets?.binding
	) {
		logger.warn(
			"experimental_serve_directly=false set without an assets binding\n" +
				"Setting experimental_serve_directly to false will always invoke your Worker script.\n" +
				"To fetch your assets from your Worker, please set the [assets.binding] key in your configuration file.\n\n" +
				"Read more: https://developers.cloudflare.com/workers/static-assets/binding/#binding"
		);
	}

	// Using serve_directly=false, but didn't provide a Worker script
	if (
		"legacy" in args
			? args.entrypoint === noOpEntrypoint &&
				args.assets?.assetConfig?.serve_directly === false
			: !config?.main && config?.assets?.experimental_serve_directly === false
	) {
		throw new UserError(
			"Cannot set experimental_serve_directly=false without a Worker script.\n" +
				"Please remove experimental_serve_directly from your configuration file, or provide a Worker script in your configuration file (`main`)."
		);
	}
}

const CF_ASSETS_IGNORE_FILENAME = ".assetsignore";

/**
 * Create a function for filtering out ignored assets.
 *
 * The generated function takes an asset path, relative to the asset directory,
 * and returns true if the asset should not be ignored.
 */
async function createAssetIgnoreFunction(dir: string) {
	const cfAssetIgnorePath = path.resolve(dir, CF_ASSETS_IGNORE_FILENAME);

	if (!existsSync(cfAssetIgnorePath)) {
		return null;
	}

	const ignorePatterns = (
		await readFile(cfAssetIgnorePath, { encoding: "utf8" })
	).split("\n");

	// Always ignore the `.assetsignore` file.
	ignorePatterns.push(CF_ASSETS_IGNORE_FILENAME);

	return createPatternMatcher(ignorePatterns, true);
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
			file === "_worker.js"
				? "file"
				: file.startsWith("_worker.js")
					? "directory"
					: null;
		if (workerJsType !== null) {
			throw new UserError(dedent`
			Uploading a Pages _worker.js ${workerJsType} as an asset.
			This could expose your private server-side code to the public Internet. Is this intended?
			If you do not want to upload this ${workerJsType}, either remove it or add an "${CF_ASSETS_IGNORE_FILENAME}" file, to the root of your asset directory, containing "_worker.js" to avoid uploading.
			If you do want to upload this ${workerJsType}, you can add an empty "${CF_ASSETS_IGNORE_FILENAME}" file, to the root of your asset directory, to hide this error.
		`);
		}
	}
}
