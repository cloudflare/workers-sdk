import assert from "node:assert";
import { createHash } from "node:crypto";
import http from "node:http";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { fetchResult } from "../cfetch";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import openInBrowser from "../open-in-browser";
import type { R2BucketInfo } from "../r2/helpers";

// ensure this is in sync with:
//   https://bitbucket.cfdata.org/projects/PIPE/repos/superpipe/browse/src/coordinator/types.ts#6
type RecursivePartial<T> = {
	[P in keyof T]?: RecursivePartial<T[P]>;
};
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
};
export type BindingSource = {
	type: "binding";
	format: string;
	schema?: string;
};
export type Source = HttpSource | BindingSource;
export type PipelineUserConfig = {
	name: string;
	metadata: { [x: string]: string };
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

export type PermissionGroup = {
	id: string;
	name: string;
	description: string;
	scopes: string[];
};

interface S3AccessKey {
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
	accountId: string,
	name: string
): Promise<R2BucketInfo> {
	return await fetchResult<R2BucketInfo>(
		`/accounts/${accountId}/r2/buckets/${name}`
	);
}

// v4 API to Create new Pipeline
export async function createPipeline(
	accountId: string,
	config: PipelineUserConfig
): Promise<Pipeline> {
	return await fetchResult<Pipeline>(`/accounts/${accountId}/pipelines`, {
		method: "POST",
		headers: API_HEADERS,
		body: JSON.stringify(config),
	});
}

// v4 API to Get Pipeline Details
export async function getPipeline(
	accountId: string,
	name: string
): Promise<Pipeline> {
	return await fetchResult<Pipeline>(
		`/accounts/${accountId}/pipelines/${name}`,
		{
			method: "GET",
		}
	);
}

// v4 API to Update Pipeline Configuration
export async function updatePipeline(
	accountId: string,
	name: string,
	config: PartialExcept<PipelineUserConfig, "name">
): Promise<Pipeline> {
	return await fetchResult<Pipeline>(
		`/accounts/${accountId}/pipelines/${name}`,
		{
			method: "PUT",
			headers: API_HEADERS,
			body: JSON.stringify(config),
		}
	);
}

// v4 API to List Available Pipelines
export async function listPipelines(
	accountId: string
): Promise<PipelineEntry[]> {
	return await fetchResult<PipelineEntry[]>(
		`/accounts/${accountId}/pipelines`,
		{
			method: "GET",
		}
	);
}

// v4 API to Delete Pipeline
export async function deletePipeline(
	accountId: string,
	name: string
): Promise<void> {
	return await fetchResult<void>(`/accounts/${accountId}/pipelines/${name}`, {
		method: "DELETE",
		headers: API_HEADERS,
	});
}
