import { URLSearchParams } from "node:url";
import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";
import type {
	CreatePipelineRequest,
	CreateSinkRequest,
	CreateStreamRequest,
	ListPipelinesParams,
	ListSinksParams,
	ListStreamsParams,
	Pipeline,
	Sink,
	Stream,
	ValidateSqlRequest,
	ValidateSqlResponse,
} from "./types";

export async function listPipelines(
	config: Config,
	params?: ListPipelinesParams
): Promise<Pipeline[]> {
	const accountId = await requireAuth(config);
	const searchParams = new URLSearchParams();

	if (params?.page) {
		searchParams.set("page", params.page.toString());
	}
	if (params?.per_page) {
		searchParams.set("per_page", params.per_page.toString());
	}

	const response = await fetchResult<Pipeline[]>(
		config,
		`/accounts/${accountId}/pipelines/v1/pipelines`,
		{
			method: "GET",
		},
		searchParams
	);

	return response;
}

export async function listStreams(
	config: Config,
	params?: ListStreamsParams
): Promise<Stream[]> {
	const accountId = await requireAuth(config);
	const searchParams = new URLSearchParams();

	if (params?.page) {
		searchParams.set("page", params.page.toString());
	}
	if (params?.per_page) {
		searchParams.set("per_page", params.per_page.toString());
	}
	if (params?.pipeline_id) {
		searchParams.set("pipeline_id", params.pipeline_id);
	}

	const response = await fetchResult<Stream[]>(
		config,
		`/accounts/${accountId}/pipelines/v1/streams`,
		{
			method: "GET",
		},
		searchParams
	);

	return response;
}

export async function listSinks(
	config: Config,
	params?: ListSinksParams
): Promise<Sink[]> {
	const accountId = await requireAuth(config);
	const searchParams = new URLSearchParams();

	if (params?.page) {
		searchParams.set("page", params.page.toString());
	}
	if (params?.per_page) {
		searchParams.set("per_page", params.per_page.toString());
	}
	if (params?.pipeline_id) {
		searchParams.set("pipeline_id", params.pipeline_id);
	}

	const response = await fetchResult<Sink[]>(
		config,
		`/accounts/${accountId}/pipelines/v1/sinks`,
		{
			method: "GET",
		},
		searchParams
	);

	return response;
}

export async function createStream(
	config: Config,
	streamConfig: CreateStreamRequest
): Promise<Stream> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<Stream>(
		config,
		`/accounts/${accountId}/pipelines/v1/streams`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(streamConfig),
		}
	);

	return response;
}

export async function getStream(
	config: Config,
	streamId: string
): Promise<Stream> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<Stream>(
		config,
		`/accounts/${accountId}/pipelines/v1/streams/${streamId}`,
		{
			method: "GET",
		}
	);

	return response;
}

export async function deleteStream(
	config: Config,
	streamId: string
): Promise<void> {
	const accountId = await requireAuth(config);

	await fetchResult<void>(
		config,
		`/accounts/${accountId}/pipelines/v1/streams/${streamId}`,
		{
			method: "DELETE",
		}
	);
}

export async function getSink(config: Config, sinkId: string): Promise<Sink> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<Sink>(
		config,
		`/accounts/${accountId}/pipelines/v1/sinks/${sinkId}`,
		{
			method: "GET",
		}
	);

	return response;
}

export async function deleteSink(
	config: Config,
	sinkId: string
): Promise<void> {
	const accountId = await requireAuth(config);

	await fetchResult<void>(
		config,
		`/accounts/${accountId}/pipelines/v1/sinks/${sinkId}`,
		{
			method: "DELETE",
		}
	);
}

export async function createSink(
	config: Config,
	sinkConfig: CreateSinkRequest
): Promise<Sink> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<Sink>(
		config,
		`/accounts/${accountId}/pipelines/v1/sinks`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(sinkConfig),
		}
	);

	return response;
}

export async function getPipeline(
	config: Config,
	pipelineId: string
): Promise<Pipeline> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<Pipeline>(
		config,
		`/accounts/${accountId}/pipelines/v1/pipelines/${pipelineId}`,
		{
			method: "GET",
		}
	);

	return response;
}

export async function deletePipeline(
	config: Config,
	pipelineId: string
): Promise<void> {
	const accountId = await requireAuth(config);

	await fetchResult<void>(
		config,
		`/accounts/${accountId}/pipelines/v1/pipelines/${pipelineId}`,
		{
			method: "DELETE",
		}
	);
}

export async function createPipeline(
	config: Config,
	pipelineConfig: CreatePipelineRequest
): Promise<Pipeline> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<Pipeline>(
		config,
		`/accounts/${accountId}/pipelines/v1/pipelines`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(pipelineConfig),
		}
	);

	return response;
}

export async function validateSql(
	config: Config,
	sqlRequest: ValidateSqlRequest
): Promise<ValidateSqlResponse["result"]> {
	const accountId = await requireAuth(config);

	const response = await fetchResult<ValidateSqlResponse["result"]>(
		config,
		`/accounts/${accountId}/pipelines/v1/validate_sql`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(sqlRequest),
		}
	);

	return response;
}
