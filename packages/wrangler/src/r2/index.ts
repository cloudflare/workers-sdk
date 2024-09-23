import { Blob } from "node:buffer";
import * as fs from "node:fs";
import * as path from "node:path";
import * as stream from "node:stream";
import { ReadableStream } from "node:stream/web";
import prettyBytes from "pretty-bytes";
import { readConfig } from "../config";
import { FatalError, UserError } from "../errors";
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
	isValidR2BucketName,
	listR2Buckets,
	putR2Object,
	updateR2BucketStorageClass,
	usingLocalBucket,
} from "./helpers";
import * as Notification from "./notification";
import * as Sippy from "./sippy";
import type { CommonYargsArgv, SubHelp } from "../yargs-types";
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

export function r2(r2Yargs: CommonYargsArgv, subHelp: SubHelp) {
	return r2Yargs
		.command(subHelp)
		.command("object", "Manage R2 objects", (r2ObjectYargs) => {
			return r2ObjectYargs
				.demandCommand()
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

						let output: stream.Writable;
						if (file) {
							fs.mkdirSync(path.dirname(file), { recursive: true });
							output = fs.createWriteStream(file);
						} else {
							output = process.stdout;
						}
						if (objectGetYargs.local) {
							await usingLocalBucket(
								objectGetYargs.persistTo,
								config.configPath,
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
							})
							.option("storage-class", {
								describe: "The storage class of the object to be created",
								alias: "s",
								requiresArg: false,
								type: "string",
							});
					},
					async (objectPutYargs) => {
						await printWranglerBanner();

						const config = readConfig(objectPutYargs.config, objectPutYargs);
						const {
							objectPath,
							file,
							pipe,
							local,
							persistTo,
							jurisdiction,
							storageClass,
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

						if (objectSize > MAX_UPLOAD_SIZE && !local) {
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
							const accountId = await requireAuth(config);
							await putR2Object(
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
							const accountId = await requireAuth(config);
							await deleteR2Object(accountId, bucket, key, jurisdiction);
						}

						logger.log("Delete complete.");
					}
				);
		})

		.command("bucket", "Manage R2 buckets", (r2BucketYargs) => {
			r2BucketYargs.demandCommand();
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
						})
						.option("storage-class", {
							describe:
								"The default storage class for objects uploaded to this bucket",
							alias: "s",
							requiresArg: false,
							type: "string",
						});
				},
				async (args) => {
					await printWranglerBanner();

					if (!isValidR2BucketName(args.name)) {
						throw new CommandLineArgsError(
							`The bucket name "${args.name}" is invalid. Bucket names can only have alphanumeric and - characters.`
						);
					}

					const config = readConfig(args.config, args);

					const accountId = await requireAuth(config);

					let fullBucketName = `${args.name}`;
					if (args.jurisdiction !== undefined) {
						fullBucketName += ` (${args.jurisdiction})`;
					}

					let defaultStorageClass = ` with default storage class set to `;
					if (args.storageClass !== undefined) {
						defaultStorageClass += args.storageClass;
					} else {
						defaultStorageClass += "Standard";
					}

					logger.log(
						`Creating bucket ${fullBucketName}${defaultStorageClass}.`
					);
					await createR2Bucket(
						accountId,
						args.name,
						args.jurisdiction,
						args.storageClass
					);
					logger.log(`Created bucket ${fullBucketName}${defaultStorageClass}.`);
					await metrics.sendMetricsEvent("create r2 bucket", {
						sendMetrics: config.send_metrics,
					});
				}
			);

			r2BucketYargs.command("update", "Update bucket state", (updateYargs) => {
				updateYargs.command(
					"storage-class <name>",
					"Update the default storage class of an existing R2 bucket",
					(yargs) => {
						return yargs
							.positional("name", {
								describe: "The name of the existing bucket",
								type: "string",
								demandOption: true,
							})
							.option("jurisdiction", {
								describe: "The jurisdiction of the bucket to be updated",
								alias: "J",
								requiresArg: true,
								type: "string",
							})
							.option("storage-class", {
								describe: "The new default storage class for this bucket",
								alias: "s",
								demandOption: true,
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
						logger.log(
							`Updating bucket ${fullBucketName} to ${args.storageClass} default storage class.`
						);
						await updateR2BucketStorageClass(
							accountId,
							args.name,
							args.storageClass,
							args.jurisdiction
						);
						logger.log(
							`Updated bucket ${fullBucketName} to ${args.storageClass} default storage class.`
						);
					}
				);
			});

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

			r2BucketYargs.command(
				"sippy",
				"Manage Sippy incremental migration on an R2 bucket",
				(sippyYargs) => {
					return sippyYargs
						.command(
							"enable <name>",
							"Enable Sippy on an R2 bucket",
							Sippy.EnableOptions,
							Sippy.EnableHandler
						)
						.command(
							"disable <name>",
							"Disable Sippy on an R2 bucket",
							Sippy.DisableOptions,
							Sippy.DisableHandler
						)
						.command(
							"get <name>",
							"Check the status of Sippy on an R2 bucket",
							Sippy.GetOptions,
							Sippy.GetHandler
						);
				}
			);

			r2BucketYargs.command(
				"notification",
				"Manage event notification rules for an R2 bucket",
				(r2EvNotifyYargs) => {
					return r2EvNotifyYargs
						.command(
							["list <bucket>", "get <bucket>"],
							"List event notification rules for a bucket",
							Notification.ListOptions,
							Notification.ListHandler
						)
						.command(
							"create <bucket>",
							"Create an event notification rule for an R2 bucket",
							Notification.CreateOptions,
							Notification.CreateHandler
						)
						.command(
							"delete <bucket>",
							"Delete an event notification rule from an R2 bucket",
							Notification.DeleteOptions,
							Notification.DeleteHandler
						);
				}
			);
			return r2BucketYargs;
		});
}
