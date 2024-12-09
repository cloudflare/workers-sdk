import { readConfig } from "../config";
import { sleep } from "../deploy/deploy";
import { FatalError, UserError } from "../errors";
import { printWranglerBanner } from "../index";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { APIError } from "../parse";
import { requireAuth } from "../user";
import {
	createPipeline,
	deletePipeline,
	generateR2ServiceToken,
	getPipeline,
	getR2Bucket,
	listPipelines,
	sha256,
	updatePipeline,
} from "./client";
import type { CommonYargsArgv, CommonYargsOptions } from "../yargs-types";
import type {
	BindingSource,
	HttpSource,
	PipelineUserConfig,
	Source,
} from "./client";
import type { Argv } from "yargs";

// flag to skip delays for tests
let __testSkipDelaysFlag = false;

async function authorizeR2Bucket(
	name: string,
	accountId: string,
	bucket: string
) {
	try {
		await getR2Bucket(accountId, bucket);
	} catch (err) {
		if (err instanceof APIError) {
			if (err.code == 10006) {
				throw new FatalError(`The R2 bucket [${bucket}] doesn't exist`);
			}
		}
		throw err;
	}

	logger.log(`🌀 Authorizing R2 bucket "${bucket}"`);

	const serviceToken = await generateR2ServiceToken(
		`Service token for Pipeline ${name}`,
		accountId,
		bucket
	);
	const access_key_id = serviceToken.id;
	const secret_access_key = sha256(serviceToken.value);

	// wait for token to settle/propagate
	!__testSkipDelaysFlag && (await sleep(3000));

	return {
		secret_access_key,
		access_key_id,
	};
}

function getAccountR2Endpoint(accountId: string) {
	return `https://${accountId}.r2.cloudflarestorage.com`;
}

function validateName(label: string, name: string) {
	if (!name.match(/^[a-zA-Z0-9-]+$/)) {
		throw new Error(`Must provide a valid ${label}`);
	}
}

// Parse out a transform of the form: <script>[.<entrypoint>]
function parseTransform(spec: string) {
	const [script, entrypoint, ...rest] = spec.split(".");
	if (!script || rest.length > 0) {
		throw new Error(
			"Invalid transform: required syntax <script>[.<entrypoint>]"
		);
	}
	return {
		script,
		entrypoint: entrypoint || "Transform",
	};
}

function addCreateAndUpdateOptions(yargs: Argv<CommonYargsOptions>) {
	return yargs
		.option("secret-access-key", {
			describe: "The R2 service token Access Key to write data",
			type: "string",
			demandOption: false,
		})
		.option("access-key-id", {
			describe: "The R2 service token Secret Key to write data",
			type: "string",
			demandOption: false,
		})
		.option("batch-max-mb", {
			describe:
				"The approximate maximum size of a batch before flush in megabytes \nDefault: 10",
			type: "number",
			demandOption: false,
		})
		.option("batch-max-rows", {
			describe:
				"The approximate maximum size of a batch before flush in rows \nDefault: 10000",
			type: "number",
			demandOption: false,
		})
		.option("batch-max-seconds", {
			describe:
				"The approximate maximum duration of a batch before flush in seconds \nDefault: 15",
			type: "number",
			demandOption: false,
		})
		.option("transform", {
			describe:
				'The worker and entrypoint of the PipelineTransform implementation in the format "worker.entrypoint" \nDefault: No transformation worker',
			type: "string",
			demandOption: false,
		})
		.option("compression", {
			describe: "Sets the compression format of output files \nDefault: gzip",
			type: "string",
			choices: ["none", "gzip", "deflate"],
			demandOption: false,
		})
		.option("filepath", {
			describe:
				"The path to store files in the destination bucket \nDefault: event_date=${date}/hr=${hr}",
			type: "string",
			demandOption: false,
		})
		.option("filename", {
			describe:
				'The name of the file in the bucket. Must contain "${slug}". File extension is optional \nDefault: ${slug}-${hr}.json',
			type: "string",
			demandOption: false,
		})
		.option("binding", {
			describe: "Enable Worker binding to this pipeline",
			type: "boolean",
			default: true,
			demandOption: false,
		})
		.option("http", {
			describe: "Enable HTTPS endpoint to send data to this pipeline",
			type: "boolean",
			default: true,
			demandOption: false,
		})
		.option("authentication", {
			describe:
				"Require authentication (Cloudflare API Token) to send data to the HTTPS endpoint",
			type: "boolean",
			default: false,
			demandOption: false,
		});
}

export function pipelines(pipelineYargs: CommonYargsArgv) {
	return pipelineYargs
		.command(
			"create <pipeline>",
			"Create a new pipeline",
			(yargs) => {
				return addCreateAndUpdateOptions(yargs)
					.positional("pipeline", {
						describe: "The name of the new pipeline",
						type: "string",
						demandOption: true,
					})
					.option("r2", {
						type: "string",
						describe: "Destination R2 bucket name",
						demandOption: true,
					});
			},
			async (args) => {
				await printWranglerBanner();

				const config = readConfig(args.config, args);
				const bucket = args.r2;
				const name = args.pipeline;
				const compression =
					args.compression === undefined ? "gzip" : args.compression;

				const batch = {
					max_mb: args["batch-max-mb"],
					max_duration_s: args["batch-max-seconds"],
					max_rows: args["batch-max-rows"],
				};

				if (!bucket) {
					throw new FatalError("Requires a r2 bucket");
				}

				const accountId = await requireAuth(config);

				const pipelineConfig: PipelineUserConfig = {
					name: name,
					metadata: {},
					source: [],
					transforms: [],
					destination: {
						type: "r2",
						format: "json",
						compression: {
							type: compression,
						},
						batch: batch,
						path: {
							bucket: bucket,
						},
						credentials: {
							endpoint: getAccountR2Endpoint(accountId),
							access_key_id: args["access-key-id"] || "",
							secret_access_key: args["secret-access-key"] || "",
						},
					},
				};
				const destination = pipelineConfig.destination;
				if (
					!destination.credentials.access_key_id &&
					!destination.credentials.secret_access_key
				) {
					// auto-generate a service token
					const auth = await authorizeR2Bucket(
						name,
						accountId,
						pipelineConfig.destination.path.bucket
					);
					destination.credentials.access_key_id = auth.access_key_id;
					destination.credentials.secret_access_key = auth.secret_access_key;
				}

				if (!destination.credentials.access_key_id) {
					throw new FatalError("Requires a r2 access key id");
				}

				if (!destination.credentials.secret_access_key) {
					throw new FatalError("Requires a r2 secret access key");
				}

				// add binding source (default to add)
				if (args.binding === undefined || args.binding) {
					pipelineConfig.source.push({
						type: "binding",
						format: "json",
					} satisfies BindingSource);
				}

				// add http source (possibly authenticated), default to add
				if (args.http === undefined || args.http) {
					const source: HttpSource = {
						type: "http",
						format: "json",
					};
					if (args.authentication !== undefined) {
						source.authentication = args.authentication;
					}
					pipelineConfig.source.push(source);
				}
				if (pipelineConfig.source.length < 1) {
					throw new UserError(
						"Too many sources have been disabled.  At least one source (http or binding) should be enabled"
					);
				}

				if (args.transform !== undefined) {
					pipelineConfig.transforms.push(parseTransform(args.transform));
				}

				if (args.filepath) {
					pipelineConfig.destination.path.filepath = args.filepath;
				}
				if (args.filename) {
					pipelineConfig.destination.path.filename = args.filename;
				}

				logger.log(`🌀 Creating pipeline named "${name}"`);
				const pipeline = await createPipeline(accountId, pipelineConfig);
				metrics.sendMetricsEvent("create pipeline", {
					sendMetrics: config.send_metrics,
				});

				logger.log(
					`✅ Successfully created pipeline "${pipeline.name}" with id ${pipeline.id}`
				);
				logger.log("🎉 You can now send data to your pipeline!");
				logger.log(
					`Example: curl "${pipeline.endpoint}" -d '[{"foo": "bar"}]'`
				);
			}
		)
		.command(
			"list",
			"List current pipelines",
			(yargs) => yargs,
			async (args) => {
				const config = readConfig(args.config, args);
				const accountId = await requireAuth(config);

				// TODO: we should show bindings & transforms if they exist for given ids
				const list = await listPipelines(accountId);
				metrics.sendMetricsEvent("list pipelines", {
					sendMetrics: config.send_metrics,
				});

				logger.table(
					list.map((pipeline) => ({
						name: pipeline.name,
						id: pipeline.id,
						endpoint: pipeline.endpoint,
					}))
				);
			}
		)
		.command(
			"show <pipeline>",
			"Show a pipeline configuration",
			(yargs) => {
				return yargs.positional("pipeline", {
					type: "string",
					describe: "The name of the pipeline to show",
					demandOption: true,
				});
			},
			async (args) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);
				const accountId = await requireAuth(config);
				const name = args.pipeline;

				validateName("pipeline name", name);

				logger.log(`Retrieving config for pipeline "${name}".`);
				const pipeline = await getPipeline(accountId, name);
				metrics.sendMetricsEvent("show pipeline", {
					sendMetrics: config.send_metrics,
				});

				logger.log(JSON.stringify(pipeline, null, 2));
			}
		)
		.command(
			"update <pipeline>",
			"Update a pipeline",
			(yargs) => {
				return addCreateAndUpdateOptions(yargs)
					.positional("pipeline", {
						describe: "The name of the pipeline to update",
						type: "string",
						demandOption: true,
					})
					.option("r2", {
						type: "string",
						describe: "Destination R2 bucket name",
						demandOption: false,
					});
			},
			async (args) => {
				await printWranglerBanner();

				const name = args.pipeline;
				// only the fields set will be updated - other fields will use the existing config
				const config = readConfig(args.config, args);
				const accountId = await requireAuth(config);

				const pipelineConfig = await getPipeline(accountId, name);

				if (args.compression) {
					pipelineConfig.destination.compression.type = args.compression;
				}
				if (args["batch-max-mb"]) {
					pipelineConfig.destination.batch.max_mb = args["batch-max-mb"];
				}
				if (args["batch-max-seconds"]) {
					pipelineConfig.destination.batch.max_duration_s =
						args["batch-max-seconds"];
				}
				if (args["batch-max-rows"]) {
					pipelineConfig.destination.batch.max_rows = args["batch-max-rows"];
				}

				const bucket = args.r2;
				const accessKeyId = args["access-key-id"];
				const secretAccessKey = args["secret-access-key"];
				if (bucket || accessKeyId || secretAccessKey) {
					const destination = pipelineConfig.destination;
					if (bucket) {
						pipelineConfig.destination.path.bucket = bucket;
					}
					destination.credentials = {
						endpoint: getAccountR2Endpoint(accountId),
						access_key_id: accessKeyId || "",
						secret_access_key: secretAccessKey || "",
					};
					if (!accessKeyId && !secretAccessKey) {
						const auth = await authorizeR2Bucket(
							name,
							accountId,
							destination.path.bucket
						);
						destination.credentials.access_key_id = auth.access_key_id;
						destination.credentials.secret_access_key = auth.secret_access_key;
					}
					if (!destination.credentials.access_key_id) {
						throw new FatalError("Requires a r2 access key id");
					}

					if (!destination.credentials.secret_access_key) {
						throw new FatalError("Requires a r2 secret access key");
					}
				}

				if (args.binding !== undefined) {
					// strip off old source & keep if necessary
					const source = pipelineConfig.source.find(
						(s: Source) => s.type == "binding"
					);
					pipelineConfig.source = pipelineConfig.source.filter(
						(s: Source) => s.type != "binding"
					);
					if (args.binding) {
						// add back only if specified
						pipelineConfig.source.push({
							type: "binding",
							format: "json",
							...source,
						});
					}
				}

				if (args.http !== undefined) {
					// strip off old source & keep if necessary
					const source = pipelineConfig.source.find(
						(s: Source) => s.type == "http"
					);
					pipelineConfig.source = pipelineConfig.source.filter(
						(s: Source) => s.type != "http"
					);
					if (args.http) {
						// add back if specified
						pipelineConfig.source.push({
							type: "http",
							format: "json",
							...source,
							authentication:
								args.authentication !== undefined
									? // if auth specified, use it
										args.authentication
									: // if auth not specified, use previos value or default(false)
										source?.authentication,
						} satisfies HttpSource);
					}
				}

				if (args.transform !== undefined) {
					pipelineConfig.transforms.push(parseTransform(args.transform));
				}

				if (args.filepath) {
					pipelineConfig.destination.path.filepath = args.filepath;
				}
				if (args.filename) {
					pipelineConfig.destination.path.filename = args.filename;
				}

				logger.log(`🌀 Updating pipeline "${name}"`);
				const pipeline = await updatePipeline(accountId, name, pipelineConfig);
				metrics.sendMetricsEvent("update pipeline", {
					sendMetrics: config.send_metrics,
				});

				logger.log(
					`✅ Successfully updated pipeline "${pipeline.name}" with ID ${pipeline.id}\n`
				);
			}
		)
		.command(
			"delete <pipeline>",
			"Delete a pipeline",
			(yargs) => {
				return yargs.positional("pipeline", {
					type: "string",
					describe: "The name of the pipeline to delete",
					demandOption: true,
				});
			},
			async (args) => {
				await printWranglerBanner();
				const config = readConfig(args.config, args);
				const accountId = await requireAuth(config);
				const name = args.pipeline;

				validateName("pipeline name", name);

				logger.log(`Deleting pipeline ${name}.`);
				await deletePipeline(accountId, name);
				logger.log(`Deleted pipeline ${name}.`);
				metrics.sendMetricsEvent("delete pipeline", {
					sendMetrics: config.send_metrics,
				});
			}
		);
}

// Test exception to remove delays
export function __testSkipDelays() {
	__testSkipDelaysFlag = true;
}
