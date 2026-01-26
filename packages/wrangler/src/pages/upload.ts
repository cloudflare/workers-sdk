import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { spinner } from "@cloudflare/cli/interactive";
import {
	APIError,
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	FatalError,
} from "@cloudflare/workers-utils";
import PQueue from "p-queue";
import { fetchResult } from "../cfetch";
import { createCommand } from "../core/create-command";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import {
	BULK_UPLOAD_CONCURRENCY,
	MAX_ASSET_COUNT_DEFAULT,
	MAX_BUCKET_FILE_COUNT,
	MAX_BUCKET_SIZE,
	MAX_CHECK_MISSING_ATTEMPTS,
	MAX_UPLOAD_ATTEMPTS,
	MAX_UPLOAD_GATEWAY_ERRORS,
} from "./constants";
import { ApiErrorCodes } from "./errors";
import { validate } from "./validate";
import type { UploadPayloadFile } from "./types";
import type { FileContainer } from "./validate";

export const pagesProjectUploadCommand = createCommand({
	metadata: {
		description: "Upload files to a project",
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
			description: "The directory of static files to upload",
		},
		"output-manifest-path": {
			type: "string",
			description: "The name of the project you want to deploy to",
		},
		"skip-caching": {
			type: "boolean",
			description: "Skip asset caching which speeds up builds",
		},
	},
	positionalArgs: ["directory"],
	async handler({ directory, outputManifestPath, skipCaching }) {
		if (!directory) {
			throw new FatalError("Must specify a directory.", 1);
		}

		if (!process.env.CF_PAGES_UPLOAD_JWT) {
			throw new FatalError("No JWT given.", 1);
		}

		const fileMap = await validate({
			directory,
			fileCountLimit: maxFileCountAllowedFromClaims(
				process.env.CF_PAGES_UPLOAD_JWT
			),
		});

		const manifest = await upload({
			fileMap,
			jwt: process.env.CF_PAGES_UPLOAD_JWT,
			skipCaching: skipCaching ?? false,
		});

		if (outputManifestPath) {
			await mkdir(dirname(outputManifestPath), { recursive: true });
			await writeFile(outputManifestPath, JSON.stringify(manifest));
		}

		logger.log(`✨ Upload complete!`);
	},
});

export const upload = async (
	args:
		| {
				fileMap: Map<string, FileContainer>;
				jwt: string;
				skipCaching: boolean;
		  }
		| {
				fileMap: Map<string, FileContainer>;
				accountId: string;
				projectName: string;
				skipCaching: boolean;
		  }
) => {
	async function fetchJwt(): Promise<string> {
		if ("jwt" in args) {
			return args.jwt;
		} else {
			return (
				await fetchResult<{ jwt: string }>(
					COMPLIANCE_REGION_CONFIG_PUBLIC,
					`/accounts/${args.accountId}/pages/projects/${args.projectName}/upload-token`
				)
			).jwt;
		}
	}

	const files = [...args.fileMap.values()];

	let jwt = await fetchJwt();

	const start = Date.now();

	let attempts = 0;
	const getMissingHashes = async (skipCaching: boolean): Promise<string[]> => {
		if (skipCaching) {
			logger.debug("Force skipping cache");
			return files.map(({ hash }) => hash);
		}

		try {
			return await fetchResult<string[]>(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/pages/assets/check-missing`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({
						hashes: files.map(({ hash }) => hash),
					}),
				}
			);
		} catch (e) {
			if (attempts < MAX_CHECK_MISSING_ATTEMPTS) {
				// Exponential backoff, 1 second first time, then 2 second, then 4 second etc.
				await new Promise((resolvePromise) =>
					setTimeout(resolvePromise, Math.pow(2, attempts++) * 1000)
				);

				if (
					(e as { code: number }).code === ApiErrorCodes.UNAUTHORIZED ||
					isJwtExpired(jwt)
				) {
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

	let counter = args.fileMap.size - sortedFiles.length;
	const { update, stop } = renderProgress(counter, args.fileMap.size);

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });
	const queuePromises: Array<Promise<void>> = [];

	for (const bucket of buckets) {
		// Don't upload empty buckets (can happen for tiny projects)
		if (bucket.files.length === 0) {
			continue;
		}

		attempts = 0;
		let gatewayErrors = 0;
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
				const res = await fetchResult(
					COMPLIANCE_REGION_CONFIG_PUBLIC,
					`/pages/assets/upload`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify(payload),
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
					} else if (
						(e as { code: number }).code === ApiErrorCodes.UNAUTHORIZED ||
						isJwtExpired(jwt)
					) {
						// Looks like the JWT expired, fetch another one
						jwt = await fetchJwt();
					} else {
						// Only count as a failed attempt if the error _wasn't_ an expired JWT
						attempts++;
					}
					return doUpload();
				} else {
					logger.debug("failed:", e);
					throw e;
				}
			}
		};

		queuePromises.push(
			queue.add(() =>
				doUpload().then(
					() => {
						counter += bucket.files.length;
						update(counter, args.fileMap.size);
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
			)
		);
	}
	// using Promise.all() here instead of queue.onIdle() to ensure
	// we actually throw errors that occur within queued promises.
	await Promise.all(queuePromises);

	stop();

	const uploadMs = Date.now() - start;

	const skipped = args.fileMap.size - missingHashes.length;
	const skippedMessage = skipped > 0 ? `(${skipped} already uploaded) ` : "";

	logger.log(
		`✨ Success! Uploaded ${
			sortedFiles.length
		} files ${skippedMessage}${formatTime(uploadMs)}\n`
	);

	const doUpsertHashes = async (): Promise<void> => {
		try {
			return await fetchResult(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/pages/assets/upsert-hashes`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({
						hashes: files.map(({ hash }) => hash),
					}),
				}
			);
		} catch (e) {
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));

			if (
				(e as { code: number }).code === ApiErrorCodes.UNAUTHORIZED ||
				isJwtExpired(jwt)
			) {
				// Looks like the JWT expired, fetch another one
				jwt = await fetchJwt();
			}

			return await fetchResult(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/pages/assets/upsert-hashes`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify({
						hashes: files.map(({ hash }) => hash),
					}),
				}
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
		[...args.fileMap.entries()].map(([fileName, file]) => [
			`/${fileName}`,
			file.hash,
		])
	);
};

// Decode and check that the current JWT has not expired
export const isJwtExpired = (token: string): boolean | undefined => {
	// During testing we don't use valid JWTs, so don't try and parse them
	if (
		typeof vitest !== "undefined" &&
		(token === "<<funfetti-auth-jwt>>" ||
			token === "<<funfetti-auth-jwt2>>" ||
			token === "<<aus-completion-token>>")
	) {
		return false;
	}
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
};

export const maxFileCountAllowedFromClaims = (token: string): number => {
	// During testing we don't use valid JWTs, so don't try and parse them
	if (
		typeof vitest !== "undefined" &&
		(token === "<<funfetti-auth-jwt>>" ||
			token === "<<funfetti-auth-jwt2>>" ||
			token === "<<aus-completion-token>>")
	) {
		return MAX_ASSET_COUNT_DEFAULT;
	}
	try {
		// Not validating the JWT here, which ordinarily would be a big red flag.
		// However, if the JWT is invalid, no uploads (calls to /pages/assets/upload)
		// will succeed.
		const decodedJwt = JSON.parse(
			Buffer.from(token.split(".")[1], "base64").toString()
		);

		const maxFileCountAllowed = decodedJwt["max_file_count_allowed"];
		if (typeof maxFileCountAllowed == "number") {
			return maxFileCountAllowed;
		}

		return MAX_ASSET_COUNT_DEFAULT;
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(`Invalid token: ${e.message}`);
		}
		return MAX_ASSET_COUNT_DEFAULT;
	}
};

function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

function renderProgress(done: number, total: number) {
	const s = spinner();
	if (isInteractive()) {
		s.start(`Uploading... (${done}/${total})\n`);
		return {
			update: (d: number, t: number) => s.update(`Uploading... (${d}/${t})\n`),
			stop: s.stop,
		};
	} else {
		logger.log(`Uploading... (${done}/${total})`);
		return {
			update: (d: number, t: number) => logger.log(`Uploading... (${d}/${t})`),
			stop: () => {},
		};
	}
}
