import { APIError, UserError } from "@cloudflare/workers-utils";
import {
	getPipeline,
	getSink,
	getStream,
	listPipelines,
	listSinks,
	listStreams,
} from "../client";
import type { Pipeline, Sink, Stream } from "../types";
import type { Config } from "@cloudflare/workers-utils";

const PER_PAGE = 100;

const LOOKUP_ERROR_CODES = new Set([
	2, // generic pipelines not found response
	1000, // pipeline_not_exist (used by the API for missing resources)
	1015, // sink_not_exist
	1016, // stream_not_exist
]);

function isLookupCandidate(error: unknown): error is APIError {
	return (
		error instanceof APIError &&
		(error.status === 404 ||
			(error.code !== undefined && LOOKUP_ERROR_CODES.has(error.code)))
	);
}

async function fetchAllStreams(
	config: Config,
	options: { name?: string } = {}
): Promise<Stream[]> {
	const streams: Stream[] = [];
	let page = 1;
	while (true) {
		const pageItems = await listStreams(config, {
			page,
			per_page: PER_PAGE,
			name: options.name,
		});
		if (pageItems.length === 0) {
			break;
		}
		streams.push(...pageItems);
		page++;
	}
	return streams;
}

async function fetchAllSinks(
	config: Config,
	options: { name?: string } = {}
): Promise<Sink[]> {
	const sinks: Sink[] = [];
	let page = 1;
	while (true) {
		const pageItems = await listSinks(config, {
			page,
			per_page: PER_PAGE,
			name: options.name,
		});
		if (pageItems.length === 0) {
			break;
		}
		sinks.push(...pageItems);
		page++;
	}
	return sinks;
}

async function fetchAllPipelines(
	config: Config,
	options: { name?: string } = {}
): Promise<Pipeline[]> {
	const pipelines: Pipeline[] = [];
	let page = 1;
	while (true) {
		const pageItems = await listPipelines(config, {
			page,
			per_page: PER_PAGE,
			name: options.name,
		});
		if (pageItems.length === 0) {
			break;
		}
		pipelines.push(...pageItems);
		page++;
	}
	return pipelines;
}

export async function resolveStream(
	config: Config,
	identifier: string
): Promise<Stream> {
	try {
		return await getStream(config, identifier);
	} catch (error) {
		if (!isLookupCandidate(error)) {
			throw error;
		}
	}

	const streams = await fetchAllStreams(config, { name: identifier });
	const matches = streams.filter((stream) => stream.name === identifier);

	if (matches.length === 0) {
		throw new UserError(`Stream "${identifier}" not found.`, {
			telemetryMessage: "pipelines stream resolve not found",
		});
	}

	if (matches.length > 1) {
		// Names are enforced to be unique by the Pipelines API, so hitting this
		// branch should only happen if the backend regresses. Fail loudly instead
		// of quietly choosing one to avoid unpredictable behaviour.
		throw new UserError(
			`Found multiple streams named "${identifier}". Please use the stream ID instead.`,
			{ telemetryMessage: "pipelines stream resolve multiple matches" }
		);
	}

	return await getStream(config, matches[0].id);
}

export async function resolveSink(
	config: Config,
	identifier: string
): Promise<Sink> {
	try {
		return await getSink(config, identifier);
	} catch (error) {
		if (!isLookupCandidate(error)) {
			throw error;
		}
	}

	const sinks = await fetchAllSinks(config, { name: identifier });
	const matches = sinks.filter((sink) => sink.name === identifier);

	if (matches.length === 0) {
		throw new UserError(`Sink "${identifier}" not found.`, {
			telemetryMessage: "pipelines sink resolve not found",
		});
	}

	if (matches.length > 1) {
		// Names are enforced to be unique by the Pipelines API, so hitting this
		// branch should only happen if the backend regresses. Fail loudly instead
		// of quietly choosing one to avoid unpredictable behaviour.
		throw new UserError(
			`Found multiple sinks named "${identifier}". Please use the sink ID instead.`,
			{ telemetryMessage: "pipelines sink resolve multiple matches" }
		);
	}

	return await getSink(config, matches[0].id);
}

export async function findPipelineByName(
	config: Config,
	name: string
): Promise<Pipeline | null> {
	const pipelines = await fetchAllPipelines(config, { name });
	const matches = pipelines.filter((pipeline) => pipeline.name === name);

	if (matches.length === 0) {
		return null;
	}

	if (matches.length > 1) {
		// Names are enforced to be unique by the Pipelines API, so hitting this
		// branch should only happen if the backend regresses. Fail loudly instead
		// of quietly choosing one to avoid unpredictable behaviour.
		throw new UserError(
			`Found multiple pipelines named "${name}". Please use the pipeline ID instead.`,
			{ telemetryMessage: "pipelines pipeline resolve multiple matches" }
		);
	}

	return await getPipeline(config, matches[0].id);
}

export async function resolvePipeline(
	config: Config,
	identifier: string
): Promise<Pipeline | null> {
	try {
		return await getPipeline(config, identifier);
	} catch (error) {
		if (!isLookupCandidate(error)) {
			throw error;
		}
	}

	return await findPipelineByName(config, identifier);
}
