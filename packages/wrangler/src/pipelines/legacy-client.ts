import { createHash } from "node:crypto";
import prettyBytes from "pretty-bytes";
import { fetchResult } from "../cfetch";
import formatLabelledValues from "../utils/render-labelled-values";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

// ensure this is in sync with:
//   https://bitbucket.cfdata.org/projects/PIPE/repos/superpipe/browse/src/coordinator/types.ts#6
type RecursivePartial<T> = T extends object
	? {
			[P in keyof T]?: RecursivePartial<T[P]>;
		}
	: T;

export type PartialExcept<T, K extends keyof T> = RecursivePartial<T> &
	Pick<T, K>;

export type TransformConfig = {
	script: string;
	entrypoint: string;
};

export type HttpSource = {
	type: "http";
	format: string;
	schema?: string;
	authentication?: boolean;
	cors?: {
		origins: ["*"] | string[];
	};
};

export type BindingSource = {
	type: "binding";
	format: string;
	schema?: string;
};

export type Metadata = {
	shards?: number;
	[x: string]: unknown;
};

export type Source = HttpSource | BindingSource;

export type PipelineUserConfig = {
	name: string;
	metadata: Metadata;
	source: Source[];
	transforms: TransformConfig[];
	destination: {
		type: string;
		format: string;
		compression: {
			type: string;
		};
		batch: {
			max_duration_s?: number;
			max_bytes?: number;
			max_rows?: number;
		};
		path: {
			bucket: string;
			prefix?: string;
			filepath?: string;
			filename?: string;
		};
		credentials: {
			endpoint: string;
			secret_access_key: string;
			access_key_id: string;
		};
	};
};

// Pipeline from v4 API
export type Pipeline = Omit<PipelineUserConfig, "destination"> & {
	id: string;
	version: number;
	endpoint: string;
	destination: Omit<PipelineUserConfig["destination"], "credentials"> & {
		credentials?: PipelineUserConfig["destination"]["credentials"];
	};
};

// abbreviated Pipeline from Pipeline list call
export type PipelineEntry = {
	id: string;
	name: string;
	endpoint: string;
};

// Payload for Service Tokens
export type ServiceToken = {
	id: string;
	name: string;
	value: string;
};

// standard headers for update calls to v4 API
const API_HEADERS = {
	"Content-Type": "application/json",
};

export function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

// v4 API to Create new Pipeline
export async function createPipeline(
	complianceConfig: ComplianceConfig,
	accountId: string,
	pipelineConfig: PipelineUserConfig
): Promise<Pipeline> {
	return await fetchResult<Pipeline>(
		complianceConfig,
		`/accounts/${accountId}/pipelines`,
		{
			method: "POST",
			headers: API_HEADERS,
			body: JSON.stringify(pipelineConfig),
		}
	);
}

// v4 API to Get Pipeline Details
export async function getPipeline(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
): Promise<Pipeline> {
	return await fetchResult<Pipeline>(
		complianceConfig,
		`/accounts/${accountId}/pipelines/${name}`,
		{
			method: "GET",
		}
	);
}

// v4 API to Update Pipeline Configuration
export async function updatePipeline(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string,
	pipelineConfig: PartialExcept<PipelineUserConfig, "name">
): Promise<Pipeline> {
	return await fetchResult<Pipeline>(
		complianceConfig,
		`/accounts/${accountId}/pipelines/${name}`,
		{
			method: "PUT",
			headers: API_HEADERS,
			body: JSON.stringify(pipelineConfig),
		}
	);
}

// v4 API to List Available Pipelines
export async function listPipelines(
	complianceConfig: ComplianceConfig,
	accountId: string
): Promise<PipelineEntry[]> {
	return await fetchResult<PipelineEntry[]>(
		complianceConfig,
		`/accounts/${accountId}/pipelines`,
		{
			method: "GET",
		}
	);
}

// v4 API to Delete Pipeline
export async function deletePipeline(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
): Promise<void> {
	return await fetchResult<void>(
		complianceConfig,
		`/accounts/${accountId}/pipelines/${name}`,
		{
			method: "DELETE",
			headers: API_HEADERS,
		}
	);
}

/*

 */
export function formatPipelinePretty(pipeline: Pipeline) {
	let buffer = "";

	const formatTypeLabels: Record<string, string> = {
		json: "JSON",
	};

	buffer += `${formatLabelledValues({
		Id: pipeline.id,
		Name: pipeline.name,
	})}\n`;

	buffer += "Sources:\n";
	const httpSource = pipeline.source.find((s) => s.type === "http");
	if (httpSource) {
		const httpInfo = {
			Endpoint: pipeline.endpoint,
			Authentication: httpSource.authentication === true ? "on" : "off",
			...(httpSource?.cors?.origins && {
				"CORS Origins": httpSource.cors.origins.join(", "),
			}),
			Format: formatTypeLabels[httpSource.format],
		};
		buffer += "  HTTP:\n";
		buffer += `${formatLabelledValues(httpInfo, { indentationCount: 4 })}\n`;
	}

	const bindingSource = pipeline.source.find((s) => s.type === "binding");
	if (bindingSource) {
		const bindingInfo = {
			Format: formatTypeLabels[bindingSource.format],
		};
		buffer += "  Worker:\n";
		buffer += `${formatLabelledValues(bindingInfo, { indentationCount: 4 })}\n`;
	}

	const destinationInfo = {
		Type: pipeline.destination.type.toUpperCase(),
		Bucket: pipeline.destination.path.bucket,
		Format: "newline-delimited JSON", // TODO: Make dynamic once we support more output formats
		...(pipeline.destination.path.prefix && {
			Prefix: pipeline.destination.path.prefix,
		}),
		...(pipeline.destination.compression.type && {
			Compression: pipeline.destination.compression.type.toUpperCase(),
		}),
	};
	buffer += "Destination:\n";
	buffer += `${formatLabelledValues(destinationInfo, { indentationCount: 2 })}\n`;

	const batchHints = {
		...(pipeline.destination.batch.max_bytes && {
			"Max bytes": prettyBytes(pipeline.destination.batch.max_bytes),
		}),
		...(pipeline.destination.batch.max_duration_s && {
			"Max duration": `${pipeline.destination.batch.max_duration_s?.toLocaleString()} seconds`,
		}),
		...(pipeline.destination.batch.max_rows && {
			"Max records": pipeline.destination.batch.max_rows?.toLocaleString(),
		}),
	};

	if (Object.keys(batchHints).length > 0) {
		buffer += "  Batch hints:\n";
		buffer += `${formatLabelledValues(batchHints, { indentationCount: 4 })}\n`;
	}

	return buffer;
}
