import { type FileHandle, open } from "node:fs/promises";
import { File, FormData } from "undici";
import { readConfig } from "../config";
import { logger } from "../logger";
import { insertIntoIndex } from "./client";
import { vectorizeBetaWarning } from "./common";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { VectorizeVectorMutation } from "@cloudflare/workers-types";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
const VECTORIZE_UPSERT_BATCH_SIZE = 5_000;
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
		})
		.epilogue(vectorizeBetaWarning);
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const file = await open(args.file);

	let index: Optional<VectorizeVectorMutation, "ids"> | undefined;
	for await (const batch of getBatchFromFile(file, args.batchSize)) {
		const formData = new FormData();
		formData.append("vectors", new File([batch.join(`\n`)], "vectors.ndjson"));
		logger.log(`✨ Uploading vector batch (${batch.length} vectors)`);
		const idxPart = await insertIntoIndex(config, args.name, formData);
		if (!index) index = idxPart;
		else index.count += idxPart.count;

		if (index.count > VECTORIZE_MAX_UPSERT_VECTOR_RECORDS) {
			logger.warn(
				`🚧 While Vectorize is in beta, we've limited uploads to 100k vectors`
			);
			logger.warn(
				`🚧 You may run this again with another batch to upload further`
			);
			break;
		}
	}

	// remove the ids - skip tracking these for bulk uploads since this could be in the 100s of thousands.
	if (index) delete index.ids;
	logger.log(JSON.stringify(index, null, 2));
}

// helper method that reads an ndjson file line by line in batches. not this doesn't
// actually do any parsing - that will be handled on the backend
async function* getBatchFromFile(file: FileHandle, batchSize = 3) {
	let batch: string[] = [];
	for await (const line of file.readLines()) {
		if (batch.push(line) >= batchSize) {
			yield batch;
			batch = [];
		}
	}
	yield batch;
}
