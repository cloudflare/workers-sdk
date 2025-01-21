import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { FatalError } from "../errors";
import { logger } from "../logger";
import { APIError } from "../parse";
import { retryOnAPIFailure } from "../utils/retry";
import { addCreateOptions, createPipelineHandler } from "./cli/create";
import { addDeleteOptions, deletePipelineHandler } from "./cli/delete";
import { listPipelinesHandler } from "./cli/list";
import { addShowOptions, showPipelineHandler } from "./cli/show";
import { addUpdateOptions, updatePipelineHandler } from "./cli/update";
import { generateR2ServiceToken, getR2Bucket } from "./client";
import type { CommonYargsArgv } from "../yargs-types";

export const BYTES_PER_MB = 1000 * 1000;

// flag to skip delays for tests
let __testSkipDelaysFlag = false;

export async function authorizeR2Bucket(
	pipelineName: string,
	accountId: string,
	bucketName: string
) {
	try {
		await getR2Bucket(accountId, bucketName);
	} catch (err) {
		if (err instanceof APIError) {
			if (err.code == 10006) {
				throw new FatalError(`The R2 bucket [${bucketName}] doesn't exist`);
			}
		}
		throw err;
	}

	logger.log(`🌀 Authorizing R2 bucket "${bucketName}"`);

	const serviceToken = await generateR2ServiceToken(
		accountId,
		bucketName,
		pipelineName
	);

	const r2 = new S3Client({
		region: "auto",
		credentials: {
			accessKeyId: serviceToken.accessKeyId,
			secretAccessKey: serviceToken.secretAccessKey,
		},
		endpoint: getAccountR2Endpoint(accountId),
	});

	// Wait for token to settle/propagate, retry up to 10 times, with 2s waits in-between errors
	!__testSkipDelaysFlag &&
		(await retryOnAPIFailure(
			async () => {
				await r2.send(
					new HeadBucketCommand({
						Bucket: bucketName,
					})
				);
			},
			2000,
			10
		));

	return serviceToken;
}

export function getAccountR2Endpoint(accountId: string) {
	const env = getCloudflareApiEnvironmentFromEnv();
	if (env === "staging") {
		return `https://${accountId}.r2-staging.cloudflarestorage.com`;
	}
	return `https://${accountId}.r2.cloudflarestorage.com`;
}

// Parse out a transform of the form: <script>[.<entrypoint>]
export function parseTransform(spec: string) {
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

export function pipelines(pipelineYargs: CommonYargsArgv) {
	return pipelineYargs
		.command(
			"create <pipeline>",
			"Create a new pipeline",
			addCreateOptions,
			createPipelineHandler
		)
		.command(
			"list",
			"List current pipelines",
			(yargs) => yargs,
			listPipelinesHandler
		)
		.command(
			"show <pipeline>",
			"Show a pipeline configuration",
			addShowOptions,
			showPipelineHandler
		)
		.command(
			"update <pipeline>",
			"Update a pipeline",
			addUpdateOptions,
			updatePipelineHandler
		)
		.command(
			"delete <pipeline>",
			"Delete a pipeline",
			addDeleteOptions,
			deletePipelineHandler
		);
}

// Test exception to remove delays
export function __testSkipDelays() {
	__testSkipDelaysFlag = true;
}
