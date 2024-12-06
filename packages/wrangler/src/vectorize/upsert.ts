import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { File, FormData } from "undici";
import { readConfig } from "../config";
import { logger } from "../logger";
import { upsertIntoIndex } from "./client";
import {
	getBatchFromFile,
	VECTORIZE_MAX_BATCH_SIZE,
	VECTORIZE_MAX_UPSERT_VECTOR_RECORDS,
	vectorizeGABanner,
} from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		})
		.options({
			file: {
				describe:
					"A file containing line separated json (ndjson) vector objects.",
				demandOption: true,
				type: "string",
			},
			"batch-size": {
				describe:
					"Number of vector records to include in a single upsert batch when sending to the Cloudflare API.",
				type: "number",
				default: VECTORIZE_MAX_BATCH_SIZE,
			},
			json: {
				describe: "return output as clean JSON",
				type: "boolean",
				default: false,
			},
		})
		.epilogue(vectorizeGABanner);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig({ configPath: args.config, args });
	const rl = createInterface({ input: createReadStream(args.file) });

	if (Number(args.batchSize) > VECTORIZE_MAX_BATCH_SIZE) {
		logger.error(
			`🚨 The global rate limit for the Cloudflare API is 1200 requests per five minutes. Vectorize indexes currently limit upload batches to ${VECTORIZE_MAX_BATCH_SIZE} records at a time to stay within the service limits`
		);
		return;
	}

	let vectorUpsertCount = 0;
	for await (const batch of getBatchFromFile(rl, args.batchSize)) {
		const formData = new FormData();
		formData.append(
			"vectors",
			new File([batch.join(`\n`)], "vectors.ndjson", {
				type: "application/x-ndjson",
			})
		);
		{
			const mutation = await upsertIntoIndex(config, args.name, formData);
			vectorUpsertCount += batch.length;
			logger.log(
				`✨ Enqueued ${batch.length} vectors into index '${args.name}' for upsertion. Mutation changeset identifier: ${mutation.mutationId}`
			);
		}

		if (vectorUpsertCount > VECTORIZE_MAX_UPSERT_VECTOR_RECORDS) {
			logger.warn(
				`🚧 While Vectorize is in beta, we've limited uploads to 100k vectors per run. You may run this again with another batch to upload further`
			);
			break;
		}
	}

	if (args.json) {
		logger.log(
			JSON.stringify({ index: args.name, count: vectorUpsertCount }, null, 2)
		);
		return;
	}

	{
		logger.log(
			`✅ Successfully enqueued ${vectorUpsertCount} vectors into index '${args.name}' for upsertion.`
		);
	}
}
