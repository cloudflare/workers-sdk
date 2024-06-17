const EMBEDDING_MODEL = '@cf/baai/bge-large-en-v1.5';

export class Embeddings {
	#ai: Ai;
	#index: VectorizeIndex;

	constructor(ai: Ai, index: VectorizeIndex) {
		this.#ai = ai;
		this.#index = index;
	}

	async delete(id: string): Promise<number> {
		console.log(`Deleting vector for ${id}.`);
		const { count } = await this.#index.deleteByIds([id]);
		console.log(`Deleted ${count} vectors.`);

		return count;
	}

	async upsert(id: string, content: string, metadata?: Record<string, VectorizeVectorMetadataValue>): Promise<boolean> {
		console.log(`Creating vector for ${id}.`);

		if (metadata && !this.#isValidMetadata(metadata)) {
			console.log(`Invalid metadata for ${id}. Aborting vector creation.`);
			return false;
		}

		console.log(`Generating vector for ${id}.`);

		const vector = await this.#generateVector(content);

		if (!vector) {
			console.log(`Failed to create embeddings for ${id}. Aborting vector creation.`);
			return false;
		}

		console.log(`Generated vector for ${id} successfully.`);
		console.log(`Inserting vector for ${id}.`);

		const meta = {
			id,
			...metadata,
		};

		await this.#index.upsert([{ id, values: vector, metadata: meta }]);

		console.log(`Inserted vector for ${id}`);

		return true;
	}

	async similar(content: string, numResults = 20): Promise<VectorizeMatches['matches']> {
		console.log('Searching for similar content.');

		const queryVector = await this.#generateVector(content);

		if (!queryVector) {
			console.log('Failed to generate embeddings for query.');
			return [];
		}

		const results = await this.#index.query(queryVector, {
			topK: numResults,
			returnValues: false,
			returnMetadata: true,
		});

		console.log(`Found ${results.matches.length} matches.`);

		return results.matches;
	}

	async #generateVector(text: string): Promise<number[] | null> {
		try {
			console.log('Generating vector.');

			const { data } = await this.#ai.run(EMBEDDING_MODEL, { text: [text] });

			const vector = data[0];

			if (!vector?.length) {
				console.log('Error generating vector.');
				return null;
			}

			console.log('Generated vector successfully.');

			return vector;
		} catch (e) {
			console.log('Error generating vector.');
			return null;
		}
	}

	#isValidMetadata(metadata: Record<string, unknown>): metadata is Record<string, VectorizeVectorMetadataValue> {
		for (const [key, value] of Object.entries(metadata)) {
			if (!isMetadataFilterValue(value)) {
				console.log(`Invalid metadata value for key ${key}: ${metadata[key]}`);
				return false;
			}
		}

		return true;
	}
}

function isMetadataFilterValue(value: unknown): value is VectorizeVectorMetadataFilter[keyof VectorizeVectorMetadataFilter] {
	return ['string', 'number', 'boolean', null, undefined].includes(typeof value);
}
