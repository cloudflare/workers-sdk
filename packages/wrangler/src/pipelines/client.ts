import assert from "node:assert";
import http from "node:http";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { URLSearchParams } from "node:url";
import {
	getCloudflareApiEnvironmentFromEnv,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import { requireAuth } from "../user";
import type { R2BucketInfo } from "../r2/helpers/bucket";
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
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

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

export interface S3AccessKey {
	accessKeyId: string;
	secretAccessKey: string;
}

/**
 * Generate an R2 service token for the given account ID, bucket name, and pipeline name.
 *
 * This function kicks off its own OAuth process using the Workers Pipelines OAuth client requesting the scope
 * `pipelines:setup`. Once the user confirms, our OAuth callback endpoint will validate the request, exchange the
 * authorization code and return a bucket-scoped R2 token.
 *
 * This OAuth flow is distinct from the one used in `wrangler login` to ensure these tokens are generated server-side
 * and that only the tokens of concern are returned to the user.
 * @param accountId
 * @param bucketName
 * @param pipelineName
 */
export async function generateR2ServiceToken(
	accountId: string,
	bucketName: string,
	pipelineName: string
): Promise<S3AccessKey> {
	// TODO: Refactor into startHttpServerWithTimeout function and update `getOauthToken`
	const controller = new AbortController();
	const signal = controller.signal;

	// Create timeout promise to prevent hanging forever
	const timeoutPromise = setTimeoutPromise(120000, "timeout", { signal });

	// Create server promise to handle the callback and register the cleanup handler on the controller
	const serverPromise = new Promise<S3AccessKey>((resolve, reject) => {
		const server = http.createServer(async (request, response) => {
			assert(request.url, "This request doesn't have a URL"); // This should never happen

			if (request.method !== "GET") {
				response.writeHead(405);
				response.end("Method not allowed.");
				return;
			}

			const { pathname, searchParams } = new URL(
				request.url,
				`http://${request.headers.host}`
			);

			if (pathname !== "/") {
				response.writeHead(404);
				response.end("Not found.");
				return;
			}

			// Retrieve values from the URL parameters
			const accessKeyId = searchParams.get("access-key-id");
			const secretAccessKey = searchParams.get("secret-access-key");

			if (!accessKeyId || !secretAccessKey) {
				reject(new UserError("Missing required URL parameters"));
				return;
			}

			resolve({ accessKeyId, secretAccessKey } as S3AccessKey);
			// Do a final redirect to "clear" the URL of the sensitive URL parameters that were returned.
			response.writeHead(307, {
				Location:
					"https://welcome.developers.workers.dev/wrangler-oauth-consent-granted",
			});
			response.end();
		});

		// Register cleanup handler
		signal.addEventListener("abort", () => {
			server.close();
		});
		server.listen(8976, "localhost");
	});

	const env = getCloudflareApiEnvironmentFromEnv();
	const oauthDomain =
		env === "staging"
			? "oauth.pipelines-staging.cloudflare.com"
			: "oauth.pipelines.cloudflare.com";

	const urlToOpen = `https://${oauthDomain}/oauth/login?accountId=${accountId}&bucketName=${bucketName}&pipelineName=${pipelineName}`;
	logger.log(`Opening a link in your default browser: ${urlToOpen}`);
	await openInBrowser(urlToOpen);

	const result = await Promise.race([timeoutPromise, serverPromise]);
	controller.abort();
	if (result === "timeout") {
		throw new UserError(
			"Timed out waiting for authorization code, please try again."
		);
	}

	return result as S3AccessKey;
}

// Get R2 bucket information from v4 API
export async function getR2Bucket(
	complianceConfig: ComplianceConfig,
	accountId: string,
	name: string
): Promise<R2BucketInfo> {
	return await fetchResult<R2BucketInfo>(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${name}`
	);
}
