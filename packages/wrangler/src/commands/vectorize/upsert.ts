import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { UserError } from "@cloudflare/workers-utils";
import { FormData } from "undici";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { upsertIntoIndex } from "./client";
import {
	getBatchFromFile,
	isValidFile,
	VECTORIZE_MAX_BATCH_SIZE,
	VECTORIZE_MAX_UPSERT_VECTOR_RECORDS,
} from "./common";

export const vectorizeUpsertCommand = createCommand({
	metadata: {
		description: "Upsert vectors into a Vectorize index",
		status: "stable",
		owner: "Product: Vectorize",
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the Vectorize index.",
		},
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
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (!(await isValidFile(args.file))) {
			throw new UserError(
				`🚨 Cannot read invalid or empty file: ${args.file}.`
			);
		}

		const rl = createInterface({ input: createReadStream(args.file) });

		if (Number(args.batchSize) > VECTORIZE_MAX_BATCH_SIZE) {
			throw new UserError(
				`🚨 The global rate limit for the Cloudflare API is 1200 requests per five minutes. Vectorize indexes currently limit upload batches to ${VECTORIZE_MAX_BATCH_SIZE} records at a time to stay within the service limits.`
			);
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
	},
});
