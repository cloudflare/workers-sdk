import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { UserError } from "@cloudflare/workers-utils";
import { FormData } from "undici";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { insertIntoIndex, insertIntoIndexV1 } from "./client";
import {
	deprecatedV1DefaultFlag,
	getBatchFromFile,
	isValidFile,
	VECTORIZE_MAX_BATCH_SIZE,
	VECTORIZE_MAX_UPSERT_VECTOR_RECORDS,
	VECTORIZE_UPSERT_BATCH_SIZE,
	VECTORIZE_V1_MAX_BATCH_SIZE,
} from "./common";

export const vectorizeInsertCommand = createCommand({
	metadata: {
		description: "Insert vectors into a Vectorize index",
		owner: "Product: Vectorize",
		status: "stable",
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
				"Number of vector records to include when sending to the Cloudflare API.",
			type: "number",
			default: VECTORIZE_UPSERT_BATCH_SIZE,
		},
		json: {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		},
		"deprecated-v1": {
			type: "boolean",
			default: deprecatedV1DefaultFlag,
			describe:
				"Insert into a deprecated V1 Vectorize index. This must be enabled if the index was created with the V1 option.",
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

		if (
			args.deprecatedV1 &&
			Number(args.batchSize) > VECTORIZE_V1_MAX_BATCH_SIZE
		) {
			throw new UserError(
				`🚨 Vectorize currently limits upload batches to ${VECTORIZE_V1_MAX_BATCH_SIZE} records at a time.`
			);
		} else if (
			!args.deprecatedV1 &&
			Number(args.batchSize) > VECTORIZE_MAX_BATCH_SIZE
		) {
			throw new UserError(
				`🚨 The global rate limit for the Cloudflare API is 1200 requests per five minutes. Vectorize V2 indexes currently limit upload batches to ${VECTORIZE_MAX_BATCH_SIZE} records at a time to stay within the service limits.`
			);
		}

		let vectorInsertCount = 0;
		for await (const batch of getBatchFromFile(rl, args.batchSize)) {
			const formData = new FormData();
			formData.append(
				"vectors",
				new File([batch.join(`\n`)], "vectors.ndjson", {
					type: "application/x-ndjson",
				})
			);
			if (args.deprecatedV1) {
				logger.log(`✨ Uploading vector batch (${batch.length} vectors)`);
				const idxPart = await insertIntoIndexV1(config, args.name, formData);
				vectorInsertCount += idxPart.count;
			} else {
				const mutation = await insertIntoIndex(config, args.name, formData);
				vectorInsertCount += batch.length;
				logger.log(
					`✨ Enqueued ${batch.length} vectors into index '${args.name}' for insertion. Mutation changeset identifier: ${mutation.mutationId}`
				);
			}

			if (vectorInsertCount > VECTORIZE_MAX_UPSERT_VECTOR_RECORDS) {
				logger.warn(
					`🚧 While Vectorize is in beta, we've limited uploads to 100k vectors per run. You may run this again with another batch to upload further`
				);
				break;
			}
		}

		if (args.json) {
			logger.log(
				JSON.stringify({ index: args.name, count: vectorInsertCount }, null, 2)
			);
			return;
		}

		if (args.deprecatedV1) {
			logger.log(
				`✅ Successfully inserted ${vectorInsertCount} vectors into index '${args.name}'`
			);
		} else {
			logger.log(
				`✅ Successfully enqueued ${vectorInsertCount} vectors into index '${args.name}' for insertion.`
			);
		}
	},
});
