import assert from "node:assert";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { createPatternMatcher } from "@cloudflare/workers-shared";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import xxhash from "xxhash-wasm";
import {
	BATCH_KEY_MAX,
	createKVNamespace,
	deleteKVBulkKeyValue,
	formatNumber,
	getKVKeyValue,
	listKVNamespaceKeys,
	listKVNamespaces,
	putKVBulkKeyValue,
	putKVKeyValue,
} from "./kv/helpers";
import { logger, LOGGER_LEVELS } from "./logger";
import type { KeyValue } from "./kv/helpers";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";
import type { XXHashAPI } from "xxhash-wasm";

/** Paths to always ignore. */
const ALWAYS_IGNORE = new Set(["node_modules"]);
const HIDDEN_FILES_TO_INCLUDE = new Set([
	".well-known", // See https://datatracker.ietf.org/doc/html/rfc8615
]);

async function* getFilesInFolder(dirPath: string): AsyncIterable<string> {
	const files = await readdir(dirPath, { withFileTypes: true });
	for (const file of files) {
		// Skip files that we never want to process.
		if (ALWAYS_IGNORE.has(file.name)) {
			continue;
		}
		// Skip hidden files (starting with .) except for some special ones
		if (file.name.startsWith(".") && !HIDDEN_FILES_TO_INCLUDE.has(file.name)) {
			continue;
		}
		// TODO: follow symlinks??
		if (file.isDirectory()) {
			yield* await getFilesInFolder(path.join(dirPath, file.name));
		} else {
			yield path.join(dirPath, file.name);
		}
	}
}

/**
 * Create a hash key for the given content using the xxhash algorithm.
 *
 * Note we only return the first 10 characters, since we will also include the file name in the asset manifest key
 * the most important thing here is to detect changes of a single file to invalidate the cache and
 * it's impossible to serve two different files with the same name
 */
function hashFileContent(hasher: XXHashAPI, content: string): string {
	return hasher.h64ToString(content).substring(0, 10);
}

/**
 * Create a hashed asset key for the given asset.
 *
 * The key will change if the file path or content of the asset changes.
 * The algorithm used here matches that of Wrangler v1.
 */
function hashAsset(
	hasher: XXHashAPI,
	filePath: string,
	content: string
): string {
	const extName = path.extname(filePath) || "";
	const baseName = path.basename(filePath, extName);
	const directory = path.dirname(filePath);
	const hash = hashFileContent(hasher, content);
	return urlSafe(path.join(directory, `${baseName}.${hash}${extName}`));
}

async function createKVNamespaceIfNotAlreadyExisting(
	complianceConfig: ComplianceConfig,
	title: string,
	accountId: string
) {
	// check if it already exists
	// TODO: this is super inefficient, should be made better
	const namespaces = await listKVNamespaces(complianceConfig, accountId);
	const found = namespaces.find((ns) => ns.title === title);
	if (found) {
		return { created: false, id: found.id };
	}

	// else we make the namespace
	const id = await createKVNamespace(complianceConfig, accountId, title);
	logger.log(`🌀 Created namespace for Workers Site "${title}"`);

	return {
		created: true,
		id,
	};
}

const MAX_DIFF_LINES = 100;
const MAX_BUCKET_SIZE = 98 * 1000 * 1000;
const MAX_BUCKET_KEYS = BATCH_KEY_MAX;
const MAX_BATCH_OPERATIONS = 5;

function pluralise(count: number) {
	return count === 1 ? "" : "s";
}

/**
 * Upload the assets found within the `dirPath` directory to the sites assets KV namespace for
 * the worker given by `scriptName`.
 *
 * @param accountId the account to upload to.
 * @param scriptName the name of the worker whose assets we are uploading.
 * @param siteAssets an objects describing what assets to upload, or undefined if there are no assets to upload.
 * @param preview if true then upload to a "preview" KV namespace.
 * @returns a promise for an object mapping the relative paths of the assets to the key of that
 * asset in the KV namespace.
 */
export async function syncWorkersSite(
	complianceConfig: ComplianceConfig,
	accountId: string | undefined,
	scriptName: string,
	siteAssets: LegacyAssetPaths | undefined,
	preview: boolean,
	dryRun: boolean | undefined,
	oldAssetTTL: number | undefined
): Promise<{
	manifest: { [filePath: string]: string } | undefined;
	namespace: string | undefined;
}> {
	if (siteAssets === undefined) {
		return { manifest: undefined, namespace: undefined };
	}
	if (dryRun) {
		logger.log("(Note: doing a dry run, not uploading or deleting anything.)");
		return { manifest: undefined, namespace: undefined };
	}
	assert(accountId, "Missing accountId");

	// Create assets namespace if it doesn't exist
	const title = `__${scriptName}-workers_sites_assets${
		preview ? "_preview" : ""
	}`;

	const { id: namespace } = await createKVNamespaceIfNotAlreadyExisting(
		complianceConfig,
		title,
		accountId
	);
	// Get all existing keys in asset namespace
	logger.info("Fetching list of already uploaded assets...");
	const namespaceKeysResponse = await listKVNamespaceKeys(
		complianceConfig,
		accountId,
		namespace
	);
	const namespaceKeyInfoMap = new Map<
		string,
		(typeof namespaceKeysResponse)[0]
	>(namespaceKeysResponse.map((x) => [x.name, x]));
	const namespaceKeys = new Set(namespaceKeysResponse.map((x) => x.name));

	const assetDirectory = path.join(
		siteAssets.baseDirectory,
		siteAssets.assetDirectory
	);
	const include = createPatternMatcher(siteAssets.includePatterns, false);
	const exclude = createPatternMatcher(siteAssets.excludePatterns, true);
	const hasher = await xxhash();

	// Find and validate all assets before we make any changes (can't store base64
	// contents in memory for upload as users may have *lots* of files, and we
	// don't want to OOM: https://github.com/cloudflare/workers-sdk/issues/2223)

	const manifest: Record<string, string> = {};
	type PathKey = [path: string, key: string];
	// A batch of uploads where each bucket has to be less than 100 MiB and
	// contain less than 10,000 keys (although we limit to 98 MB and 5000 keys)
	const uploadBuckets: PathKey[][] = [];
	// The "live" bucket we'll keep filling until it's just below the size limit
	let uploadBucket: PathKey[] = [];
	// Current size of the live bucket in bytes (just base64 encoded values)
	let uploadBucketSize = 0;

	let uploadCount = 0;
	let skipCount = 0;

	// Always log the first MAX_DIFF_LINES lines, then require the debug log level
	let diffCount = 0;
	function logDiff(line: string) {
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
		diffCount++;
	}

	logger.info("Building list of assets to upload...");
	for await (const absAssetFile of getFilesInFolder(assetDirectory)) {
		const assetFile = path.relative(assetDirectory, absAssetFile);
		if (!include(assetFile) || exclude(assetFile)) {
			continue;
		}

		const content = await readFile(absAssetFile, "base64");
		// While KV accepts files that are 25 MiB **before** b64 encoding
		// the overall bucket size must be below 100 MB **after** b64 encoding
		const assetSize = Buffer.byteLength(content);
		await validateAssetSize(absAssetFile, assetFile);
		const assetKey = hashAsset(hasher, assetFile, content);
		validateAssetKey(assetKey);

		if (!namespaceKeys.has(assetKey)) {
			logDiff(
				chalk.green(` + ${assetKey} (uploading new version of ${assetFile})`)
			);

			// Check if adding this asset to the bucket would push it over the KV
			// bulk API limits
			if (
				uploadBucketSize + assetSize > MAX_BUCKET_SIZE ||
				uploadBucket.length + 1 > MAX_BUCKET_KEYS
			) {
				// If so, record the current bucket and reset it
				uploadBuckets.push(uploadBucket);
				uploadBucketSize = 0;
				uploadBucket = [];
			}

			// Update the bucket and the size counter
			uploadBucketSize += assetSize;
			uploadBucket.push([absAssetFile, assetKey]);
			uploadCount++;
		} else {
			logDiff(chalk.dim(` = ${assetKey} (already uploaded ${assetFile})`));
			skipCount++;
		}

		// Remove the key from the set so we know what we've already uploaded
		namespaceKeys.delete(assetKey);

		// Prevent different manifest keys on windows
		const manifestKey = urlSafe(path.relative(assetDirectory, absAssetFile));
		manifest[manifestKey] = assetKey;
	}
	// Add the last (potentially only or empty) bucket to the batch
	if (uploadBucket.length > 0) {
		uploadBuckets.push(uploadBucket);
	}

	for (const key of namespaceKeys) {
		logDiff(
			chalk.red(` - ${key} (${oldAssetTTL ? "expiring" : "removing"} as stale)`)
		);
	}

	// Upload new assets, with 5 concurrent uploaders
	if (uploadCount > 0) {
		const s = pluralise(uploadCount);
		logger.info(`Uploading ${formatNumber(uploadCount)} new asset${s}...`);
	}
	if (skipCount > 0) {
		const s = pluralise(skipCount);
		logger.info(
			`Skipped uploading ${formatNumber(skipCount)} existing asset${s}.`
		);
	}
	let uploadedCount = 0;
	const controller = new AbortController();
	const uploaders = Array.from(Array(MAX_BATCH_OPERATIONS)).map(async () => {
		while (!controller.signal.aborted) {
			// Get the next bucket to upload. If there is none, stop this uploader.
			// JavaScript is single(ish)-threaded, so we don't need to worry about
			// parallel access here.
			const nextBucket = uploadBuckets.shift();
			if (nextBucket === undefined) {
				break;
			}

			// Read all files in the bucket as base64
			// TODO(perf): consider streaming the bulk upload body, rather than
			//  buffering all base64 contents then JSON-stringifying. This probably
			//  doesn't matter *too* much: we know buckets will be about 100MB, so
			//  with 5 uploaders, we could load about 500MB into memory (+ extra
			//  object keys/tags/copies/etc).
			const bucket: KeyValue[] = [];
			for (const [absAssetFile, assetKey] of nextBucket) {
				bucket.push({
					key: assetKey,
					value: await readFile(absAssetFile, "base64"),
					base64: true,
				});
				if (controller.signal.aborted) {
					break;
				}
			}

			// Upload the bucket to the KV namespace, suppressing logs, we do our own
			try {
				await putKVBulkKeyValue(
					complianceConfig,
					accountId,
					namespace,
					bucket,
					/* quiet */ true,
					controller.signal
				);
			} catch (e) {
				// https://developer.mozilla.org/en-US/docs/Web/API/DOMException#error_names
				// https://github.com/nodejs/undici/blob/a3efc9814447001a43a976f1c64adc41995df7e3/lib/core/errors.js#L89
				if (
					typeof e === "object" &&
					e !== null &&
					"name" in e &&
					(e as { name: string }).name === "AbortError"
				) {
					break;
				}
				throw e;
			}
			if (controller.signal.aborted) {
				break;
			}
			uploadedCount += nextBucket.length;
			const percent = Math.floor((100 * uploadedCount) / uploadCount);
			logger.info(
				`Uploaded ${percent}% [${formatNumber(
					uploadedCount
				)} out of ${formatNumber(uploadCount)}]`
			);
		}
	});
	try {
		// Wait for all uploaders to complete, or one to fail
		await Promise.all(uploaders);
	} catch (e) {
		// If any uploader fails, abort the others
		logger.info(`Upload failed, aborting...`);
		controller.abort();
		throw e;
	}

	// Delete stale assets
	const deleteCount = namespaceKeys.size;

	if (deleteCount > 0) {
		const s = pluralise(deleteCount);
		logger.info(
			`${oldAssetTTL ? "Expiring" : "Removing"} ${formatNumber(
				deleteCount
			)} stale asset${s}...`
		);

		if (!oldAssetTTL) {
			await deleteKVBulkKeyValue(
				complianceConfig,
				accountId,
				namespace,
				Array.from(namespaceKeys)
			);
		} else {
			for (const namespaceKey of namespaceKeys) {
				const expiration = namespaceKeyInfoMap.get(namespaceKey)?.expiration;

				logger.info(
					` - ${namespaceKey} ${
						expiration ? `(already expiring at ${expiration})` : ""
					}`
				);

				if (expiration) {
					continue;
				}

				const currentValue = await getKVKeyValue(
					complianceConfig,
					accountId,
					namespace,
					namespaceKey
				);
				await putKVKeyValue(complianceConfig, accountId, namespace, {
					key: namespaceKey,
					value: Buffer.from(currentValue),
					expiration_ttl: oldAssetTTL,
				});
			}
		}
	}
	logger.log("↗️  Done syncing assets");

	return { manifest, namespace };
}

/**
 * validate that the passed-in file is below 25 MiB
 * **PRIOR** to base64 encoding. 25 MiB is a KV limit
 * @param absFilePath
 * @param relativeFilePath
 */
async function validateAssetSize(
	absFilePath: string,
	relativeFilePath: string
): Promise<void> {
	const { size } = await stat(absFilePath);
	if (size > 25 * 1024 * 1024) {
		throw new UserError(
			`File ${relativeFilePath} is too big, it should be under 25 MiB. See https://developers.cloudflare.com/workers/platform/limits#kv-limits`
		);
	}
}

function validateAssetKey(assetKey: string) {
	if (assetKey.length > 512) {
		throw new UserError(
			`The asset path key "${assetKey}" exceeds the maximum key size limit of 512. See https://developers.cloudflare.com/workers/platform/limits#kv-limits",`
		);
	}
}

/**
 * Convert a filePath to be safe to use as a relative URL.
 *
 * Primarily this involves converting Windows backslashes to forward slashes.
 */
function urlSafe(filePath: string): string {
	return filePath.replace(/\\/g, "/");
}

/**
 * Information about the assets that should be uploaded
 */
export interface LegacyAssetPaths {
	/**
	 * Absolute path to the root of the project.
	 *
	 * This is the directory containing wrangler.toml or cwd if no config.
	 */
	baseDirectory: string;
	/**
	 * The path to the assets directory, relative to the `baseDirectory`.
	 */
	assetDirectory: string;
	/**
	 * An array of patterns that match files that should be uploaded.
	 */
	includePatterns: string[];
	/**
	 * An array of patterns that match files that should not be uploaded.
	 */
	excludePatterns: string[];
}

/**
 * Get an object that describes what site assets to upload, if any.
 *
 * Uses the args (passed from the command line) if available,
 * falling back to those defined in the config.
 *
 * (This function corresponds to --site/config.site)
 *
 */
export function getSiteAssetPaths(
	config: Config,
	assetDirectory?: string,
	includePatterns = config.site?.include ?? [],
	excludePatterns = config.site?.exclude ?? []
): LegacyAssetPaths | undefined {
	const baseDirectory = assetDirectory
		? process.cwd()
		: path.resolve(path.dirname(config.configPath ?? "wrangler.toml"));

	assetDirectory ??= config.site?.bucket;

	if (assetDirectory) {
		return {
			baseDirectory,
			assetDirectory,
			includePatterns,
			excludePatterns,
		};
	} else {
		return undefined;
	}
}
