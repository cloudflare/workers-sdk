import { access, constants, stat } from "node:fs/promises";
import { logger } from "../../logger";
import type { Interface as RLInterface } from "node:readline";

export const deprecatedV1DefaultFlag = false;

export const VECTORIZE_V1_MAX_BATCH_SIZE = 1_000;
export const VECTORIZE_MAX_BATCH_SIZE = 5_000;
export const VECTORIZE_UPSERT_BATCH_SIZE = VECTORIZE_V1_MAX_BATCH_SIZE;
export const VECTORIZE_MAX_UPSERT_VECTOR_RECORDS = 100_000;

// Helper function to carry out initial validations to a file supplied for
// Vectorize upserts/inserts. This function returns true only if the file exists,
// can be read, and is non-empty.
export async function isValidFile(path: string): Promise<boolean> {
	try {
		await access(path, constants.R_OK);

		const fileStat = await stat(path);
		return fileStat.isFile() && fileStat.size > 0;
	} catch {
		return false;
	}
}

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
	} catch {
		logger.error(
			`🚨 Encountered an error while reading batches from the file.`
		);
		return;
	}
}
