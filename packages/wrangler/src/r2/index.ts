import { Blob } from "node:buffer";
import * as fs from "node:fs";
import * as stream from "node:stream";
import { ReadableStream } from "node:stream/web";
import prettyBytes from "pretty-bytes";
import { readConfig } from "../config";
import { FatalError } from "../errors";
import { CommandLineArgsError, printWranglerBanner } from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { MAX_UPLOAD_SIZE } from "./constants";
import {
	bucketAndKeyFromObjectPath,
	createR2Bucket,
	deleteR2Bucket,
	deleteR2Object,
	getR2Object,
	listR2Buckets,
	putR2Object,
	usingLocalBucket,
} from "./helpers";

import type { CommonYargsArgv } from "../yargs-types";
import type { R2PutOptions } from "@cloudflare/workers-types/experimental";

const CHUNK_SIZE = 1024;
async function createFileReadableStream(filePath: string) {
	// Based off https://streams.spec.whatwg.org/#example-rs-pull
	const handle = await fs.promises.open(filePath, "r");
	let position = 0;
	return new ReadableStream({
		async pull(controller) {
			const buffer = new Uint8Array(CHUNK_SIZE);
			const { bytesRead } = await handle.read(buffer, 0, CHUNK_SIZE, position);
			if (bytesRead === 0) {
				await handle.close();
				controller.close();
			} else {
				position += bytesRead;
				controller.enqueue(buffer.subarray(0, bytesRead));
			}
		},
		cancel() {
			return handle.close();
		},
	});
}

export function r2(r2Yargs: CommonYargsArgv) {
	return r2Yargs
		.command("object", "Manage R2 objects", (r2ObjectYargs) => {
			return r2ObjectYargs
				.command(
					"get <objectPath>",
					"Fetch an object from an R2 bucket",
					(objectArgs) => {
						return objectArgs
							.positional("objectPath", {
								describe:
									"The source object path in the form of {bucket}/{key}",
								type: "string",
							})
							.option("file", {
								describe: "The destination file to create",
								alias: "f",
								conflicts: "pipe",
								requiresArg: true,
								type: "string",
							})
							.option("pipe", {
								describe:
									"Enables the file to be piped to a destination, rather than specified with the --file option",
								alias: "p",
								conflicts: "file",
								type: "boolean",
							})
							.option("local", {
								type: "boolean",
								describe: "Interact with local storage",
							})
							.option("persist-to", {
								type: "string",
								describe: "Directory for local persistence",
							})
							.option("jurisdiction", {
								describe: "The jurisdiction where the object exists",
								alias: "J",
								requiresArg: true,
								type: "string",
							});
					},
					async (objectGetYargs) => {
						const config = readConfig(objectGetYargs.config, objectGetYargs);
						const accountId = await requireAuth(config);
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
							await printWranglerBanner();
							logger.log(`Downloading "${key}" from "${fullBucketName}".`);
						}

						const output = file ? fs.createWriteStream(file) : process.stdout;
						if (objectGetYargs.local) {
							await usingLocalBucket(
								objectGetYargs.persistTo,
								config.configPath,
								bucket,
								async (r2Bucket) => {
									const object = await r2Bucket.get(key);
									if (object === null) {
										throw new Error("The specified key does not exist.");
									}
									// Note `object.body` is only valid inside this closure
									await stream.promises.pipeline(object.body, output);
								}
							);
						} else {
							const input = await getR2Object(
								accountId,
								bucket,
								key,
								jurisdiction
							);
							await stream.promises.pipeline(input, output);
						}
						if (!pipe) logger.log("Download complete.");
					}
				)
				.command(
					"put <objectPath>",
					"Create an object in an R2 bucket",
					(Objectyargs) => {
						return Objectyargs.positional("objectPath", {
							describe:
								"The destination object path in the form of {bucket}/{key}",
							type: "string",
						})
							.option("file", {
								describe: "The path of the file to upload",
								alias: "f",
								conflicts: "pipe",
								requiresArg: true,
								type: "string",
							})
							.option("pipe", {
								describe:
									"Enables the file to be piped in, rather than specified with the --file option",
								alias: "p",
								conflicts: "file",
								type: "boolean",
							})
							.option("content-type", {
								describe:
									"A standard MIME type describing the format of the object data",
								alias: "ct",
								requiresArg: true,
								type: "string",
							})
							.option("content-disposition", {
								describe: "Specifies presentational information for the object",
								alias: "cd",
								requiresArg: true,
								type: "string",
							})
							.option("content-encoding", {
								describe:
									"Specifies what content encodings have been applied to the object and thus what decoding mechanisms must be applied to obtain the media-type referenced by the Content-Type header field",
								alias: "ce",
								requiresArg: true,
								type: "string",
							})
							.option("content-language", {
								describe: "The language the content is in",
								alias: "cl",
								requiresArg: true,
								type: "string",
							})
							.option("cache-control", {
								describe:
									"Specifies caching behavior along the request/reply chain",
								alias: "cc",
								requiresArg: true,
								type: "string",
							})
							.option("expires", {
								describe:
									"The date and time at which the object is no longer cacheable",
								alias: "e",
								requiresArg: true,
								type: "string",
							})
							.option("local", {
								type: "boolean",
								describe: "Interact with local storage",
							})
							.option("persist-to", {
								type: "string",
								describe: "Directory for local persistence",
							})
							.option("jurisdiction", {
								describe: "The jurisdiction where the object will be created",
								alias: "J",
								requiresArg: true,
								type: "string",
							});
					},
					async (objectPutYargs) => {
						await printWranglerBanner();

						const config = readConfig(objectPutYargs.config, objectPutYargs);
						const accountId = await requireAuth(config);
						const {
							objectPath,
							file,
							pipe,
							local,
							persistTo,
							jurisdiction,
							...options
						} = objectPutYargs;
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
										new CommandLineArgsError(
											`Could not pipe. Reason: "${err.message}"`
										)
									)
								);
							});
							const blob = new Blob([buffer]);
							object = blob.stream();
							objectSize = blob.size;
						}

						if (objectSize > MAX_UPLOAD_SIZE) {
							throw new FatalError(
								`Error: Wrangler only supports uploading files up to ${prettyBytes(
									MAX_UPLOAD_SIZE
								)} in size\n${key} is ${prettyBytes(objectSize)} in size`,
								1
							);
						}

						let fullBucketName = bucket;
						if (jurisdiction !== undefined) {
							fullBucketName += ` (${jurisdiction})`;
						}

						logger.log(
							`Creating object "${key}" in bucket "${fullBucketName}".`
						);

						if (local) {
							await usingLocalBucket(
								persistTo,
								config.configPath,
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
							await putR2Object(
								accountId,
								bucket,
								key,
								object,
								{
									...options,
									"content-length": `${objectSize}`,
								},
								jurisdiction
							);
						}

						logger.log("Upload complete.");
					}
				)
				.command(
					"delete <objectPath>",
					"Delete an object in an R2 bucket",
					(objectDeleteYargs) => {
						return objectDeleteYargs
							.positional("objectPath", {
								describe:
									"The destination object path in the form of {bucket}/{key}",
								type: "string",
							})
							.option("local", {
								type: "boolean",
								describe: "Interact with local storage",
							})
							.option("persist-to", {
								type: "string",
								describe: "Directory for local persistence",
							})
							.option("jurisdiction", {
								describe: "The jurisdiction where the object exists",
								alias: "J",
								requiresArg: true,
								type: "string",
							});
					},
					async (args) => {
						const { objectPath, jurisdiction } = args;
						await printWranglerBanner();

						const config = readConfig(args.config, args);
						const accountId = await requireAuth(config);
						const { bucket, key } = bucketAndKeyFromObjectPath(objectPath);
						let fullBucketName = bucket;
						if (jurisdiction !== undefined) {
							fullBucketName += ` (${jurisdiction})`;
						}

						logger.log(
							`Deleting object "${key}" from bucket "${fullBucketName}".`
						);

						if (args.local) {
							await usingLocalBucket(
								args.persistTo,
								config.configPath,
								bucket,
								(r2Bucket) => r2Bucket.delete(key)
							);
						} else {
							await deleteR2Object(accountId, bucket, key, jurisdiction);
						}

						logger.log("Delete complete.");
					}
				);
		})

		.command("bucket", "Manage R2 buckets", (r2BucketYargs) => {
			r2BucketYargs.command(
				"create <name>",
				"Create a new R2 bucket",
				(yargs) => {
					return yargs
						.positional("name", {
							describe: "The name of the new bucket",
							type: "string",
							demandOption: true,
						})
						.option("jurisdiction", {
							describe: "The jurisdiction where the new bucket will be created",
							alias: "J",
							requiresArg: true,
							type: "string",
						});
				},
				async (args) => {
					await printWranglerBanner();

					const config = readConfig(args.config, args);

					const accountId = await requireAuth(config);

					let fullBucketName = `${args.name}`;
					if (args.jurisdiction !== undefined) {
						fullBucketName += ` (${args.jurisdiction})`;
					}
					logger.log(`Creating bucket ${fullBucketName}.`);
					await createR2Bucket(accountId, args.name, args.jurisdiction);
					logger.log(`Created bucket ${fullBucketName}.`);
					await metrics.sendMetricsEvent("create r2 bucket", {
						sendMetrics: config.send_metrics,
					});
				}
			);

			r2BucketYargs.command(
				"list",
				"List R2 buckets",
				(listArgs) => {
					return listArgs.option("jurisdiction", {
						describe: "The jurisdiction to list",
						alias: "J",
						requiresArg: true,
						type: "string",
					});
				},
				async (args) => {
					const config = readConfig(args.config, args);
					const { jurisdiction } = args;

					const accountId = await requireAuth(config);

					logger.log(
						JSON.stringify(
							await listR2Buckets(accountId, jurisdiction),
							null,
							2
						)
					);
					await metrics.sendMetricsEvent("list r2 buckets", {
						sendMetrics: config.send_metrics,
					});
				}
			);

			r2BucketYargs.command(
				"delete <name>",
				"Delete an R2 bucket",
				(yargs) => {
					return yargs
						.positional("name", {
							describe: "The name of the bucket to delete",
							type: "string",
							demandOption: true,
						})
						.option("jurisdiction", {
							describe: "The jurisdiction where the bucket exists",
							alias: "J",
							requiresArg: true,
							type: "string",
						});
				},
				async (args) => {
					await printWranglerBanner();

					const config = readConfig(args.config, args);

					const accountId = await requireAuth(config);

					let fullBucketName = `${args.name}`;
					if (args.jurisdiction !== undefined) {
						fullBucketName += ` (${args.jurisdiction})`;
					}
					logger.log(`Deleting bucket ${fullBucketName}.`);
					await deleteR2Bucket(accountId, args.name, args.jurisdiction);
					logger.log(`Deleted bucket ${fullBucketName}.`);
					await metrics.sendMetricsEvent("delete r2 bucket", {
						sendMetrics: config.send_metrics,
					});
				}
			);
			return r2BucketYargs;
		});
}
