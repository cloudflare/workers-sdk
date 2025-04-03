import { setTimeout } from "node:timers/promises";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { FatalError } from "../errors";
import { logger } from "../logger";
import { APIError } from "../parse";
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

/**
 * Verify the credentials used by the S3Client can access a R2 bucket by performing the
 * HeadBucket operation. It will retry up to 10 times over 10s to handle newly
 * created credentials that might not be active yet (can take a few seconds to propagate).
 *
 * @param r2
 * @param bucketName
 */
async function verifyBucketAccess(r2: S3Client, bucketName: string) {
	const MAX_ATTEMPTS = 10;
	const DELAY_MS = 1000;

	const checkCredentials = async () => {
		logger.debug(`Checking if credentials are active`);
		await r2.send(new HeadBucketCommand({ Bucket: bucketName }));
	};

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			logger.debug(`Attempt ${attempt} of ${MAX_ATTEMPTS}`);
			await checkCredentials();
			return;
		} catch (error) {
			logger.debug("HeadBucket request failed", error);
			if (attempt === MAX_ATTEMPTS) {
				throw error;
			}
			await setTimeout(DELAY_MS);
		}
	}
}

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

	// return immediately if running in a test
	if (__testSkipDelaysFlag) {
		return serviceToken;
	}

	const endpoint = getAccountR2Endpoint(accountId);
	logger.debug(`Using R2 Endpoint ${endpoint}`);
	const r2 = new S3Client({
		region: "auto",
		credentials: {
			accessKeyId: serviceToken.accessKeyId,
			secretAccessKey: serviceToken.secretAccessKey,
		},
		endpoint,
	});

	// Wait for token to settle/propagate, retry up to 10 times, with 2s waits in-between errors
	logger.log(`🌀 Checking access to R2 bucket "${bucketName}"`);
	await verifyBucketAccess(r2, bucketName);

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
			"Create a new Pipeline",
			addCreateOptions,
			createPipelineHandler
		)
		.command(
			"list",
			"List current Pipelines",
			(yargs) => yargs,
			listPipelinesHandler
		)
		.command(
			"show <pipeline>",
			"Show a Pipeline configuration",
			addShowOptions,
			showPipelineHandler
		)
		.command(
			"update <pipeline>",
			"Update a Pipeline",
			addUpdateOptions,
			updatePipelineHandler
		)
		.command(
			"delete <pipeline>",
			"Delete a Pipeline",
			addDeleteOptions,
			deletePipelineHandler
		);
}

// Test exception to remove delays
export function __testSkipDelays() {
	__testSkipDelaysFlag = true;
}
