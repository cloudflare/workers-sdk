import { Blob } from "node:buffer";
import * as fs from "node:fs";
import * as path from "node:path";
import * as stream from "node:stream";
import {
	CommandLineArgsError,
	FatalError,
	UserError,
} from "@cloudflare/workers-utils";
import prettyBytes from "pretty-bytes";
import { readConfig } from "../config";
import { createCommand, createNamespace } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { isLocal } from "../utils/is-local";
import { MAX_UPLOAD_SIZE } from "./constants";
import {
	bucketAndKeyFromObjectPath,
	createFileReadableStream,
	deleteR2Object,
	getR2Object,
	putR2Object,
	usingLocalBucket,
} from "./helpers";
import type { R2PutOptions } from "@cloudflare/workers-types/experimental";

export const r2ObjectNamespace = createNamespace({
	metadata: {
		description: `Manage R2 objects`,
		status: "stable",
		owner: "Product: R2",
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
		const { bucket, key } = bucketAndKeyFromObjectPath(objectPath);
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
	},
	behaviour: {
		printResourceLocation(args) {
			return !args?.pipe;
		},
	},
	async handler(objectPutYargs, { config }) {
		const {
			objectPath,
			file,
			pipe,
			persistTo,
			jurisdiction,
			storageClass,
			...options
		} = objectPutYargs;
		const localMode = isLocal(objectPutYargs);
		const { bucket, key } = bucketAndKeyFromObjectPath(objectPath);
		if (!file && !pipe) {
			throw new CommandLineArgsError(
				"Either the --file or --pipe options are required."
			);
		}
		let object: ReadableStream;
		let objectSize: number;
		if (file) {
			object = await createFileReadableStream(file);
			const stats = fs.statSync(file);
			objectSize = stats.size;
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
			object = blob.stream();
			objectSize = blob.size;
		}

		if (objectSize > MAX_UPLOAD_SIZE && !localMode) {
			throw new FatalError(
				`Error: Wrangler only supports uploading files up to ${prettyBytes(
					MAX_UPLOAD_SIZE,
					{ binary: true }
				)} in size\n${key} is ${prettyBytes(objectSize, {
					binary: true,
				})} in size`,
				1
			);
		}

		let fullBucketName = bucket;
		if (jurisdiction !== undefined) {
			fullBucketName += ` (${jurisdiction})`;
		}

		let storageClassLog = ``;
		if (storageClass !== undefined) {
			storageClassLog = ` with ${storageClass} storage class`;
		}
		logger.log(
			`Creating object "${key}"${storageClassLog} in bucket "${fullBucketName}".`
		);

		if (localMode) {
			await usingLocalBucket(
				persistTo,
				config,
				bucket,
				async (r2Bucket, mf) => {
					const putOptions: R2PutOptions = {
						httpMetadata: {
							contentType: options.contentType,
							contentDisposition: options.contentDisposition,
							contentEncoding: options.contentEncoding,
							contentLanguage: options.contentLanguage,
							cacheControl: options.cacheControl,
							// @ts-expect-error `@cloudflare/workers-types` is wrong
							//  here, `number`'s are allowed for `Date`s
							// TODO(now): fix
							cacheExpiry:
								options.expires === undefined
									? undefined
									: parseInt(options.expires),
						},
						customMetadata: undefined,
						sha1: undefined,
						sha256: undefined,
						onlyIf: undefined,
						md5: undefined,
						sha384: undefined,
						sha512: undefined,
					};
					// We can't use `r2Bucket.put()` here as `R2Bucket#put()`
					// requires a known length stream, and Miniflare's magic proxy
					// currently doesn't support sending these. Instead,
					// `usingLocalBucket()` provides a single `PUT` endpoint
					// for writing to a local bucket.
					await mf.dispatchFetch(`http://localhost/${key}`, {
						method: "PUT",
						body: object,
						duplex: "half",
						headers: {
							"Content-Length": objectSize.toString(),
							"Wrangler-R2-Put-Options": JSON.stringify(putOptions),
						},
					});
				}
			);
		} else {
			const accountId = await requireAuth(config);
			await putR2Object(
				config,
				accountId,
				bucket,
				key,
				object,
				{
					...options,
					"content-length": `${objectSize}`,
				},
				jurisdiction,
				storageClass
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
		const { bucket, key } = bucketAndKeyFromObjectPath(objectPath);
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
