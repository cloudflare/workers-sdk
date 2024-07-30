import assert from "node:assert";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { getType } from "mime";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import { fetchResult } from "./cfetch";
import { FatalError, UserError } from "./errors";
import { logger } from "./logger";
import {
	BULK_UPLOAD_CONCURRENCY,
	MAX_ASSET_COUNT,
	MAX_ASSET_SIZE,
	MAX_UPLOAD_ATTEMPTS,
	MAX_UPLOAD_GATEWAY_ERRORS,
} from "./pages/constants";
import { hashFile } from "./pages/hash";
import { APIError } from "./parse";

type AssetManifest = Map<string, { hash: string; size: number }>;
type InitializeAssetsResponse = {
	// string of file hashes per bucket
	buckets: string[][];
	jwt: string;
};

type UploadPayloadFile = {
	name: string;
	hash: string;
	contents: string;
	metadata: {
		contentType: string;
	};
};

export const syncAssets = async (
	accountId: string | undefined,
	scriptName: string,
	assetDirectory: string | undefined,
	dryRun: boolean | undefined
): Promise<{ manifest: AssetManifest | undefined }> => {
	if (assetDirectory === undefined) {
		return { manifest: undefined };
	}
	if (dryRun) {
		logger.log("(Note: doing a dry run, not uploading or deleting anything.)");
		return { manifest: undefined };
	}
	assert(accountId, "Missing accountId");

	const directory = path.resolve(assetDirectory);

	// 1. generate asset manifest
	const manifest = await walk(directory, new Map());

	// 2. fetch buckets w/ hashes
	let initializeAssetsResponse = await fetchResult<InitializeAssetsResponse>(
		`/accounts/${accountId}/workers/scripts/${scriptName}/initialize-assets-upload`,
		{
			method: "POST",
			body: JSON.stringify({ manifest: manifest }),
		}
	);

	// nothing to upload
	if (initializeAssetsResponse.buckets.flat().length === 0) {
		return { manifest };
	}

	const initializeAssetsResponseMock = {
		buckets: [[...manifest.values()].map((x) => x.hash)],
		jwt: "jwt",
	};
	initializeAssetsResponse = initializeAssetsResponseMock;

	// 3. fill buckets and upload assets
	const includedHashes = initializeAssetsResponse.buckets.flat();
	const filteredFiles = [...manifest.entries()].filter((file) =>
		includedHashes.includes(file[1].hash)
	);

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });

	let attempts = 0;
	for (const bucket of initializeAssetsResponse.buckets) {
		attempts = 0;
		let gatewayErrors = 0;
		const doUpload = async (): Promise<void> => {
			// Populate the payload only when actually uploading (this is limited to 3 concurrent uploads at 50 MiB per bucket meaning we'd only load in a max of ~150 MiB)
			// This is so we don't run out of memory trying to upload the files.
			const payload: UploadPayloadFile[] = await Promise.all(
				bucket.map(async (fileHash) => {
					const manifestEntry = filteredFiles.find(
						(file) => file[1].hash === fileHash
					);
					if (manifestEntry === undefined) {
						throw new UserError(
							`A file was requested that does not appear to exist?`
						);
					}
					const absFilePath = path.join(assetDirectory, manifestEntry[0]);

					return {
						name: manifestEntry[0],
						hash: fileHash,
						contents: (await readFile(absFilePath)).toString("base64"),
						metadata: {
							contentType: getType(absFilePath) || "application/octet-stream",
						},
					};
				})
			);

			try {
				logger.debug("...uploading assets");
				const res = await fetchResult(
					`/accounts/${accountId}/workers/assets/upload`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-ndjson",
							Authorization: `Bearer ${initializeAssetsResponse.jwt}`,
						},
						body: JSON.stringify(payload.join("\n")),
					}
				);
				logger.debug("result:", res);
			} catch (e) {
				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					logger.debug("failed:", e, "retrying...");
					// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
					await new Promise((resolvePromise) =>
						setTimeout(resolvePromise, Math.pow(2, attempts) * 1000)
					);
					// need to actually handle errors here... jwt exp etc.
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
				} else {
					logger.debug("failed:", e);
					throw e;
				}
			}
		};
		void queue.add(() =>
			doUpload().then(
				() => {},
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
	return { manifest };
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
						`You cannot have more than ${MAX_ASSET_COUNT.toLocaleString()} files in a deployment. Ensure you have specified your build output directory correctly.`
					);
				}

				const name = urlSafe(relativeFilepath);
				if (filestat.size > MAX_ASSET_SIZE) {
					throw new FatalError(
						`Max file size is ${prettyBytes(MAX_ASSET_SIZE, {
							binary: true,
						})}\n${name} is ${prettyBytes(filestat.size, {
							binary: true,
						})} in size`,
						1
					);
				}
				manifest.set(name, {
					hash: hashFile(filepath),
					size: filestat.size,
				});
				counter++;
			}
		})
	);
	return manifest;
};

/**
 * Convert a filePath to be safe to use as a relative URL.
 *
 * Primarily this involves converting Windows backslashes to forward slashes.
 */
function urlSafe(filePath: string): string {
	return filePath.replace(/\\/g, "/");
}
