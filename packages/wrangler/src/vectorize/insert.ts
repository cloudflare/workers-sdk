import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { File, FormData } from "undici";
import { readConfig } from "../config";
import { logger } from "../logger";
import { insertIntoIndex } from "./client";
import { vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Interface as RLInterface } from "node:readline";

const VECTORIZE_MAX_BATCH_SIZE = 1_000;
const VECTORIZE_UPSERT_BATCH_SIZE = VECTORIZE_MAX_BATCH_SIZE;
const VECTORIZE_MAX_UPSERT_VECTOR_RECORDS = 100_000;

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
					"Number of vector records to include when sending to the Cloudflare API.",
				type: "number",
				default: VECTORIZE_UPSERT_BATCH_SIZE,
			},
			json: {
				describe: "return output as clean JSON",
				type: "boolean",
				default: false,
			},
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const rl = createInterface({ input: createReadStream(args.file) });

	if (Number(args.batchSize) > VECTORIZE_MAX_BATCH_SIZE) {
		logger.error(
			`🚨 Vectorize currently limits upload batches to ${VECTORIZE_MAX_BATCH_SIZE} records at a time.`
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
		logger.log(`✨ Uploading vector batch (${batch.length} vectors)`);
		const idxPart = await insertIntoIndex(config, args.name, formData);
		vectorInsertCount += idxPart.count;

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

	logger.log(
		`✅ Successfully inserted ${vectorInsertCount} vectors into index '${args.name}'`
	);
}

// helper method that reads an ndjson file line by line in batches. not this doesn't
// actually do any parsing - that will be handled on the backend
// https://nodejs.org/docs/latest-v16.x/api/readline.html#rlsymbolasynciterator
async function* getBatchFromFile(
	rl: RLInterface,
	batchSize = VECTORIZE_UPSERT_BATCH_SIZE
) {
	let batch: string[] = [];
	for await (const line of rl) {
		if (batch.push(line) >= batchSize) {
			yield batch;
			batch = [];
		}
	}

	yield batch;
}
