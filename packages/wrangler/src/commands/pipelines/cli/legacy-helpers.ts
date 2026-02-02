import { APIError, FatalError, UserError } from "@cloudflare/workers-utils";
import { confirm } from "../../../dialogs";
import { logger } from "../../../logger";
import {
	authorizeR2Bucket,
	BYTES_PER_MB,
	getAccountR2Endpoint,
} from "../index";
import {
	deletePipeline,
	formatPipelinePretty,
	getPipeline,
	listPipelines,
	updatePipeline,
} from "../legacy-client";
import { validateName } from "../validate";
import type { BindingSource, HttpSource, Source } from "../legacy-client";
import type { Config } from "@cloudflare/workers-utils";

export async function listLegacyPipelines(
	config: Config,
	accountId: string
): Promise<void> {
	const list = await listPipelines(config, accountId);

	logger.table(
		list.map((pipeline) => ({
			name: pipeline.name,
			id: pipeline.id,
			endpoint: pipeline.endpoint,
		}))
	);
}

export async function getLegacyPipeline(
	config: Config,
	accountId: string,
	name: string,
	format: "pretty" | "json"
): Promise<void> {
	validateName("pipeline name", name);

	const pipeline = await getPipeline(config, accountId, name);

	switch (format) {
		case "json":
			logger.log(JSON.stringify(pipeline, null, 2));
			break;
		case "pretty":
			logger.warn(
				"⚠️  This is a legacy pipeline. Consider creating a new pipeline by running 'wrangler pipelines setup'."
			);
			logger.log(formatPipelinePretty(pipeline));
			break;
	}
}

interface LegacyUpdateArgs {
	pipeline: string;
	compression?: string;
	batchMaxMb?: number;
	batchMaxSeconds?: number;
	batchMaxRows?: number;
	r2Bucket?: string;
	r2Prefix?: string;
	r2AccessKeyId?: string;
	r2SecretAccessKey?: string;
	source?: (string | number)[] | undefined;
	requireHttpAuth?: boolean;
	shardCount?: number;
	corsOrigins?: string[];
}

export async function tryGetLegacyPipeline(
	config: Config,
	accountId: string,
	name: string,
	format: "pretty" | "json"
): Promise<boolean> {
	try {
		await getLegacyPipeline(config, accountId, name, format);
		return true;
	} catch (error) {
		if (error instanceof APIError && error.code === 1000) {
			return false;
		}
		throw error;
	}
}

export async function tryListLegacyPipelines(
	config: Config,
	accountId: string
): Promise<Array<{ name: string; id: string; endpoint?: string }> | null> {
	try {
		const pipelines = await listPipelines(config, accountId);
		return pipelines;
	} catch {
		return [];
	}
}

export async function tryDeleteLegacyPipeline(
	config: Config,
	accountId: string,
	name: string,
	force: boolean = false
): Promise<boolean> {
	try {
		await getPipeline(config, accountId, name);

		if (!force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the legacy pipeline '${name}'?`
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return true;
			}
		}

		await deletePipeline(config, accountId, name);
		logger.log(`✨ Successfully deleted legacy pipeline '${name}'.`);
		return true;
	} catch (error) {
		if (
			error instanceof APIError &&
			(error.code === 1000 || error.code === 2)
		) {
			// Not found in legacy API
			return false;
		}
		throw error;
	}
}

export async function updateLegacyPipeline(
	config: Config,
	accountId: string,
	args: LegacyUpdateArgs
): Promise<void> {
	const name = args.pipeline;

	const pipelineConfig = await getPipeline(config, accountId, name);

	logger.warn(
		"⚠️  Updating legacy pipeline. Consider recreating with 'wrangler pipelines setup'."
	);

	if (args.compression) {
		pipelineConfig.destination.compression.type = args.compression;
	}
	if (args.batchMaxMb) {
		pipelineConfig.destination.batch.max_bytes = args.batchMaxMb * BYTES_PER_MB; // convert to bytes for the API
	}
	if (args.batchMaxSeconds) {
		pipelineConfig.destination.batch.max_duration_s = args.batchMaxSeconds;
	}
	if (args.batchMaxRows) {
		pipelineConfig.destination.batch.max_rows = args.batchMaxRows;
	}

	const bucket = args.r2Bucket;
	const accessKeyId = args.r2AccessKeyId;
	const secretAccessKey = args.r2SecretAccessKey;
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
				config,
				name,
				accountId,
				destination.path.bucket
			);
			destination.credentials.access_key_id = auth.accessKeyId;
			destination.credentials.secret_access_key = auth.secretAccessKey;
		}
		if (!destination.credentials.access_key_id) {
			throw new FatalError("Requires a r2 access key id");
		}

		if (!destination.credentials.secret_access_key) {
			throw new FatalError("Requires a r2 secret access key");
		}
	}

	if (args.source && args.source.length > 0) {
		const existingSources = pipelineConfig.source;
		pipelineConfig.source = []; // Reset the list

		const sourceHandlers: Record<string, () => Source> = {
			http: (): HttpSource => {
				const existing = existingSources.find((s: Source) => s.type === "http");

				return {
					...existing, // Copy over existing properties for forwards compatibility
					type: "http",
					format: "json",
					...(args.requireHttpAuth && {
						authentication: args.requireHttpAuth,
					}), // Include only if defined
				};
			},
			worker: (): BindingSource => {
				const existing = existingSources.find(
					(s: Source) => s.type === "binding"
				);

				return {
					...existing, // Copy over existing properties for forwards compatibility
					type: "binding",
					format: "json",
				};
			},
		};

		for (const source of args.source) {
			const handler = sourceHandlers[source];
			if (handler) {
				pipelineConfig.source.push(handler());
			}
		}
	}

	if (pipelineConfig.source.length === 0) {
		throw new UserError(
			"No sources have been enabled. At least one source (HTTP or Worker Binding) should be enabled"
		);
	}

	pipelineConfig.transforms = [];

	if (args.r2Prefix) {
		pipelineConfig.destination.path.prefix = args.r2Prefix;
	}

	if (args.shardCount) {
		pipelineConfig.metadata.shards = args.shardCount;
	}

	// This covers the case where `--source` wasn't passed but `--cors-origins` or
	// `--require-http-auth` was.
	const httpSource = pipelineConfig.source.find(
		(s: Source) => s.type === "http"
	);
	if (httpSource) {
		if (args.requireHttpAuth) {
			httpSource.authentication = args.requireHttpAuth;
		}
		if (args.corsOrigins) {
			httpSource.cors = { origins: args.corsOrigins };
		}
	}

	logger.log(`🌀 Updating pipeline "${name}"`);
	const pipeline = await updatePipeline(
		config,
		accountId,
		name,
		pipelineConfig
	);

	logger.log(
		`✨ Successfully updated pipeline "${pipeline.name}" with ID ${pipeline.id}\n`
	);
}
