import { Blob } from "node:buffer";
import * as fs from "node:fs";
import * as path from "node:path";
import * as stream from "node:stream";
import {
	bucketFormatMessage,
	CommandLineArgsError,
	FatalError,
	isValidR2BucketName,
	UserError,
} from "@cloudflare/workers-utils";
import PQueue from "p-queue";
import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { isLocal } from "../utils/is-local";
import { logBulkProgress, validateBulkPutFile } from "./helpers/bulk";
import {
	deleteR2Object,
	getR2Object,
	putRemoteObject,
	usingLocalBucket,
	validateAndReturnBucketAndKey,
	validateUploadSize,
} from "./helpers/object";
import type { R2PutOptions } from "@cloudflare/workers-types/experimental";

export const r2ObjectNamespace = createNamespace({
	metadata: {
		description: `Manage R2 objects`,
		status: "stable",
		owner: "Product: R2",
	},
});

export const r2BulkNamespace = createNamespace({
	metadata: {
		description: `Interact with multiple R2 objects at once`,
		status: "experimental",
		owner: "Product: R2",
		hidden: true,
	},
});

export const r2ObjectGetCommand = createCommand({
	metadata: {
		description: "Fetch an object from an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	args: {
		objectPath: {
			describe: "The source object path in the form of {bucket}/{key}",
			type: "string",
			demandOption: true,
		},
		file: {
			describe: "The destination file to create",
			alias: "f",
			conflicts: "pipe",
			requiresArg: true,
			type: "string",
		},
		pipe: {
			describe:
				"Enables the file to be piped to a destination, rather than specified with the --file option",
			alias: "p",
			conflicts: "file",
			type: "boolean",
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		remote: {
			type: "boolean",
			describe: "Interact with remote storage",
			conflicts: "local",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
		jurisdiction: {
			describe: "The jurisdiction where the object exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	behaviour: {
		printBanner({ pipe }) {
			return !pipe;
		},
		printResourceLocation(args) {
			return !args?.pipe;
		},
	},
	positionalArgs: ["objectPath"],
	async handler(objectGetYargs, { config }) {
		const localMode = isLocal(objectGetYargs);
		const { objectPath, pipe, jurisdiction } = objectGetYargs;
		const { bucket, key } = validateAndReturnBucketAndKey(objectPath);
		let fullBucketName = bucket;
		if (jurisdiction !== undefined) {
			fullBucketName += ` (${jurisdiction})`;
		}

		let file = objectGetYargs.file;
		if (!file && !pipe) {
			file = key;
		}
		if (!pipe) {
			logger.log(`Downloading "${key}" from "${fullBucketName}".`);
		}

		let output: stream.Writable;
		if (file) {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			output = fs.createWriteStream(file);
		} else {
			output = process.stdout;
		}
		if (localMode) {
			await usingLocalBucket(
				objectGetYargs.persistTo,
				config,
				bucket,
				async (r2Bucket) => {
					const object = await r2Bucket.get(key);
					if (object === null) {
						throw new UserError("The specified key does not exist.");
					}
					// Note `object.body` is only valid inside this closure
					await stream.promises.pipeline(object.body, output);
				}
			);
		} else {
			const accountId = await requireAuth(config);
			const input = await getR2Object(
				config,
				accountId,
				bucket,
				key,
				jurisdiction
			);
			if (input === null) {
				throw new UserError("The specified key does not exist.");
			}
			await stream.promises.pipeline(input, output);
		}
		if (!pipe) {
			logger.log("Download complete.");
		}
	},
});

/**
 * Common arguments for R2 object put commands (single & bulk).
 */
const commonPutArguments = {
	"content-type": {
		describe: "A standard MIME type describing the format of the object data",
		alias: "ct",
		requiresArg: true,
		type: "string",
	},
	"content-disposition": {
		describe: "Specifies presentational information for the object",
		alias: "cd",
		requiresArg: true,
		type: "string",
	},
	"content-encoding": {
		describe:
			"Specifies what content encodings have been applied to the object and thus what decoding mechanisms must be applied to obtain the media-type referenced by the Content-Type header field",
		alias: "ce",
		requiresArg: true,
		type: "string",
	},
	"content-language": {
		describe: "The language the content is in",
		alias: "cl",
		requiresArg: true,
		type: "string",
	},
	"cache-control": {
		describe: "Specifies caching behavior along the request/reply chain",
		alias: "cc",
		requiresArg: true,
		type: "string",
	},
	expires: {
		describe: "The date and time at which the object is no longer cacheable",
		requiresArg: true,
		type: "string",
	},
	local: {
		type: "boolean",
		describe: "Interact with local storage",
	},
	remote: {
		type: "boolean",
		describe: "Interact with remote storage",
		conflicts: "local",
	},
	"persist-to": {
		type: "string",
		describe: "Directory for local persistence",
	},
	jurisdiction: {
		describe: "The jurisdiction where the object will be created",
		alias: "J",
		requiresArg: true,
		type: "string",
	},
	"storage-class": {
		describe: "The storage class of the object to be created",
		alias: "s",
		requiresArg: false,
		type: "string",
	},
} as const;

export const r2ObjectPutCommand = createCommand({
	metadata: {
		description: "Create an object in an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["objectPath"],
	args: {
		objectPath: {
			describe: "The destination object path in the form of {bucket}/{key}",
			type: "string",
			demandOption: true,
		},
		...commonPutArguments,
		file: {
			describe: "The path of the file to upload",
			alias: "f",
			conflicts: "pipe",
			requiresArg: true,
			type: "string",
		},
		pipe: {
			describe:
				"Enables the file to be piped in, rather than specified with the --file option",
			alias: "p",
			conflicts: "file",
			type: "boolean",
		},
	},
	behaviour: {
		printResourceLocation(args) {
			return !args?.pipe;
		},
	},
	async handler(yArgs, { config }) {
		const { file, pipe } = yArgs;
		if (!file && !pipe) {
			throw new CommandLineArgsError(
				"Either the --file or --pipe options are required."
			);
		}

		const { bucket, key } = validateAndReturnBucketAndKey(yArgs.objectPath);

		let objectStream: ReadableStream;
		let sizeBytes: number;
		if (file) {
			try {
				const stats = fs.statSync(file, { throwIfNoEntry: false });
				if (!stats) {
					throw new UserError(`The file "${file}" does not exist.`);
				}
				sizeBytes = stats.size;

				objectStream = stream.Readable.toWeb(fs.createReadStream(file));
			} catch (err) {
				if (err instanceof UserError) {
					throw err;
				}
				throw new UserError(
					`An error occurred while trying to read the file "${file}": ${
						(err as Error).message
					}`,
					{ cause: err }
				);
			}
		} else {
			const buffer = await new Promise<Buffer>((resolve, reject) => {
				const stdin = process.stdin;
				const chunks = Array<Buffer>();
				stdin.on("data", (chunk) => chunks.push(chunk));
				stdin.on("end", () => resolve(Buffer.concat(chunks)));
				stdin.on("error", (err) =>
					reject(
						new CommandLineArgsError(`Could not pipe. Reason: "${err.message}"`)
					)
				);
			});
			const blob = new Blob([buffer]);
			objectStream = blob.stream();
			sizeBytes = blob.size;
		}

		let fullBucketName = bucket;
		if (yArgs.jurisdiction !== undefined) {
			fullBucketName += ` (${yArgs.jurisdiction})`;
		}

		let storageClassLog = ``;
		if (yArgs.storageClass !== undefined) {
			storageClassLog = ` with ${yArgs.storageClass} storage class`;
		}

		logger.log(
			`Creating object "${key}"${storageClassLog} in bucket "${fullBucketName}".`
		);

		const isLocalMode = isLocal(yArgs);

		if (isLocalMode) {
			await usingLocalBucket(
				yArgs.persistTo,
				config,
				bucket,
				async (_bucket, mf) => {
					const putOptions: R2PutOptions = {
						httpMetadata: {
							contentType: yArgs.contentType,
							contentDisposition: yArgs.contentDisposition,
							contentEncoding: yArgs.contentEncoding,
							contentLanguage: yArgs.contentLanguage,
							cacheControl: yArgs.cacheControl,
							// @ts-expect-error `@cloudflare/workers-types` is wrong
							//  here, `number`'s are allowed for `Date`s
							// TODO(now): fix
							cacheExpiry:
								yArgs.expires === undefined
									? undefined
									: parseInt(yArgs.expires),
						},
					};
					// We can't use `r2Bucket.put()` here as `R2Bucket#put()`
					// requires a known length stream, and Miniflare's magic proxy
					// currently doesn't support sending these. Instead,
					// `usingLocalBucket()` provides a single `PUT` endpoint
					// for writing to a local bucket.
					await mf.dispatchFetch(`http://localhost/${key}`, {
						method: "PUT",
						body: objectStream,
						duplex: "half",
						headers: {
							"Content-Length": String(sizeBytes),
							"Wrangler-R2-Put-Options": JSON.stringify(putOptions),
						},
					});
				}
			);
		} else {
			validateUploadSize(key, sizeBytes);

			await putRemoteObject(
				config,
				await requireAuth(config),
				bucket,
				key,
				objectStream,
				{
					"content-type": yArgs.contentType,
					"content-disposition": yArgs.contentDisposition,
					"content-encoding": yArgs.contentEncoding,
					"content-language": yArgs.contentLanguage,
					"cache-control": yArgs.cacheControl,
					"content-length": String(sizeBytes),
					expires: yArgs.expires,
				},
				yArgs.jurisdiction,
				yArgs.storageClass
			);
		}

		logger.log("Upload complete.");
	},
});

export const r2ObjectDeleteCommand = createCommand({
	metadata: {
		description: "Delete an object in an R2 bucket",
		status: "stable",
		owner: "Product: R2",
	},
	positionalArgs: ["objectPath"],
	args: {
		objectPath: {
			describe: "The destination object path in the form of {bucket}/{key}",
			type: "string",
			demandOption: true,
		},
		local: {
			type: "boolean",
			describe: "Interact with local storage",
		},
		remote: {
			type: "boolean",
			describe: "Interact with remote storage",
			conflicts: "local",
		},
		"persist-to": {
			type: "string",
			describe: "Directory for local persistence",
		},
		jurisdiction: {
			describe: "The jurisdiction where the object exists",
			alias: "J",
			requiresArg: true,
			type: "string",
		},
	},
	behaviour: {
		printResourceLocation: true,
	},
	async handler(args) {
		const localMode = isLocal(args);

		const { objectPath, jurisdiction } = args;
		const config = readConfig(args);
		const { bucket, key } = validateAndReturnBucketAndKey(objectPath);
		let fullBucketName = bucket;
		if (jurisdiction !== undefined) {
			fullBucketName += ` (${jurisdiction})`;
		}

		logger.log(`Deleting object "${key}" from bucket "${fullBucketName}".`);

		if (localMode) {
			await usingLocalBucket(args.persistTo, config, bucket, (r2Bucket) =>
				r2Bucket.delete(key)
			);
		} else {
			const accountId = await requireAuth(config);
			await deleteR2Object(config, accountId, bucket, key, jurisdiction);
		}

		logger.log("Delete complete.");
	},
});

// Bulk operations

export const r2BulkPutCommand = createCommand({
	metadata: {
		description: "Create objects in an R2 bucket",
		status: "experimental",
		owner: "Product: R2",
		hidden: true,
	},
	positionalArgs: ["bucket"],
	args: {
		bucket: {
			describe: "The name of the new bucket",
			type: "string",
			demandOption: true,
		},
		...commonPutArguments,
		// TODO: add a mutually exclusive option to specify a directory to upload
		filename: {
			describe: "The file containing the key/file pairs to write",
			alias: "f",
			requiresArg: true,
			type: "string",
		},
		concurrency: {
			describe: "The number of concurrent uploads to perform",
			type: "number",
			default: 20,
		},
	},
	behaviour: {
		printResourceLocation: true,
	},
	async handler(yArgs, { config }) {
		if (!isValidR2BucketName(yArgs.bucket)) {
			throw new UserError(
				`The bucket name "${yArgs.bucket}" is invalid. ${bucketFormatMessage}`
			);
		}

		if (!yArgs.filename) {
			throw new UserError(
				"The --filename argument is required for bulk put operations."
			);
		}

		const entries = validateBulkPutFile(yArgs.filename);

		const isLocalMode = isLocal(yArgs);

		let fullBucketName = yArgs.bucket;
		if (yArgs.jurisdiction !== undefined) {
			fullBucketName += ` (${yArgs.jurisdiction})`;
		}

		let storageClassLog = ``;
		if (yArgs.storageClass !== undefined) {
			storageClassLog = ` with ${yArgs.storageClass} storage class`;
		}

		const concurrency = Math.max(1, yArgs.concurrency);

		logger.log(
			`Starting bulk upload of ${entries.length} objects to bucket ${fullBucketName}${storageClassLog} using a concurrency of ${concurrency}`
		);

		if (isLocalMode) {
			await usingLocalBucket(
				yArgs.persistTo,
				config,
				yArgs.bucket,
				async (_bucket, mf) => {
					const putOptions: R2PutOptions = {
						httpMetadata: {
							contentType: yArgs.contentType,
							contentDisposition: yArgs.contentDisposition,
							contentEncoding: yArgs.contentEncoding,
							contentLanguage: yArgs.contentLanguage,
							cacheControl: yArgs.cacheControl,
							// @ts-expect-error `@cloudflare/workers-types` is wrong
							//  here, `number`'s are allowed for `Date`s
							// TODO(now): fix
							cacheExpiry:
								yArgs.expires === undefined
									? undefined
									: parseInt(yArgs.expires),
						},
					};

					const queue = new PQueue({ concurrency });
					const jsonPutOptions = JSON.stringify(putOptions);

					await queue.addAll(
						entries.map((entry, index) => async () => {
							if ((index + 1) % 100 === 0 || index + 1 === entries.length) {
								logBulkProgress("Uploaded", index + 1, entries.length);
							}
							// We can't use `r2Bucket.put()` here as `R2Bucket#put()`
							// requires a known length stream, and Miniflare's magic proxy
							// currently doesn't support sending these. Instead,
							// `usingLocalBucket()` provides a single `PUT` endpoint
							// for writing to a local bucket.
							await mf.dispatchFetch(`http://localhost/${entry.key}`, {
								method: "PUT",
								body: stream.Readable.toWeb(fs.createReadStream(entry.file)),
								duplex: "half",
								headers: {
									"Content-Length": String(entry.size),
									"Wrangler-R2-Put-Options": jsonPutOptions,
								},
							});
						})
					);

					try {
						await Promise.race([queue.onError(), queue.onIdle()]);
					} catch (error) {
						queue.pause();
						throw new FatalError(`R2 bulk upload failed\n${error}`);
					}
				}
			);
		} else {
			// Cloudflare API rate limits
			// 1200 requests per 5 minutes
			// We add some headroom (100 requests) for other API usage
			// ref: https://developers.cloudflare.com/fundamentals/api/reference/limits/
			const API_RATE_LIMIT_WINDOWS_MS = 5 * 60 * 1_000; // 5 minutes
			const API_RATE_LIMIT_REQUESTS = 1_200 - 100;

			const accountId = await requireAuth(config);

			const queue = new PQueue({
				concurrency,
				interval: API_RATE_LIMIT_WINDOWS_MS,
				intervalCap: API_RATE_LIMIT_REQUESTS,
			});

			await queue.addAll(
				entries.map((entry, index) => async () => {
					try {
						if ((index + 1) % 10 === 0 || index + 1 === entries.length) {
							logBulkProgress("Uploaded", index + 1, entries.length);
						}
						await putRemoteObject(
							config,
							accountId,
							yArgs.bucket,
							entry.key,
							stream.Readable.toWeb(fs.createReadStream(entry.file)),
							{
								"cache-control": yArgs.cacheControl,
								"content-disposition": yArgs.contentDisposition,
								"content-encoding": yArgs.contentEncoding,
								"content-language": yArgs.contentLanguage,
								"content-type": yArgs.contentType,
								"content-length": String(entry.size),
								expires: yArgs.expires,
							},
							yArgs.jurisdiction,
							yArgs.storageClass
						);
					} catch (e) {
						throw new FatalError(`Error uploading "${entry.file}"\n${e}`);
					}
				})
			);

			try {
				await Promise.race([queue.onError(), queue.onIdle()]);
			} catch (error) {
				queue.pause();
				throw new FatalError(`R2 bulk upload failed\n${error}`);
			}
		}
	},
});
