import { logger } from "../logger";
import type { Interface as RLInterface } from "node:readline";

export const vectorizeGABanner = `--------------------
📣 Vectorize is now Generally Available.
📣 Please use the '--deprecated-v1' flag to create, get, list, delete and insert vectors into legacy Vectorize indexes
📣 Creation of legacy Vectorize indexes will be blocked by December 2024. Other operations will continue to function
📣 See the Vectorize docs to get started: https://developers.cloudflare.com/vectorize
📣 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose
📣 To give feedback, visit https://discord.cloudflare.com/
--------------------
`;

export const deprecatedV1DefaultFlag = false;

export const VECTORIZE_V1_MAX_BATCH_SIZE = 1_000;
export const VECTORIZE_MAX_BATCH_SIZE = 5_000;
export const VECTORIZE_UPSERT_BATCH_SIZE = VECTORIZE_V1_MAX_BATCH_SIZE;
export const VECTORIZE_MAX_UPSERT_VECTOR_RECORDS = 100_000;

// helper method that reads an ndjson file line by line in batches. not this doesn't
// actually do any parsing - that will be handled on the backend
// https://nodejs.org/docs/latest-v16.x/api/readline.html#rlsymbolasynciterator
export async function* getBatchFromFile(
	rl: RLInterface,
	batchSize = VECTORIZE_MAX_BATCH_SIZE
): AsyncGenerator<string[]> {
	const batch: string[] = [];

	try {
		for await (const line of rl) {
			batch.push(line);

			if (batch.length >= batchSize) {
				yield batch.splice(0, batchSize);
			}
		}

		// Yield any lines remaining in the last batch
		if (batch.length > 0) {
			yield batch;
		}
	} catch (error) {
		logger.error(
			`🚨 Encountered an error while reading batches from the file.`
		);
		return;
	}
}
