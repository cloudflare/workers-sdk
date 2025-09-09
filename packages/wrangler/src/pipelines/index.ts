import { setTimeout } from "node:timers/promises";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import prettyBytes from "pretty-bytes";
import { createNamespace } from "../core/create-command";
import { getCloudflareApiEnvironmentFromEnv } from "../environment-variables/misc-variables";
import { FatalError } from "../errors";
import { logger } from "../logger";
import { APIError } from "../parse";
import formatLabelledValues from "../utils/render-labelled-values";
import { generateR2ServiceToken, getR2Bucket } from "./legacy-client";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { Pipeline } from "./legacy-client";

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
	complianceConfig: ComplianceConfig,
	pipelineName: string,
	accountId: string,
	bucketName: string
) {
	try {
		await getR2Bucket(complianceConfig, accountId, bucketName);
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

export const pipelinesNamespace = createNamespace({
	metadata: {
		description: "🚰 Manage Cloudflare Pipelines",
		owner: "Product: Pipelines",
		status: "open-beta",
	},
});

// Test exception to remove delays
export function __testSkipDelays() {
	__testSkipDelaysFlag = true;
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
