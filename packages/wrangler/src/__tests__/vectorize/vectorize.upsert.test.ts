import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { toString } from "../helpers/serialize-form-data-entry";
import type { VectorizeVector } from "../../vectorize/types";

describe("dataset upsert", () => {
	const std = mockConsoleMethods();

	runInTempDir();
	mockAccountId();
	mockApiToken();

	const testVectors: VectorizeVector[] = [
		{
			id: "b0daca4a-ffd8-4865-926b-e24800af2a2d",
			values: [0.2331, 1.0125, 0.6131, 0.9421, 0.9661, 0.8121],
			metadata: { text: "She sells seashells by the seashore" },
		},
		{
			id: "a44706aa-a366-48bc-8cc1-3feffd87d548",
			values: [0.2321, 0.8121, 0.6315, 0.6151, 0.4121, 0.1512],
			metadata: { text: "Peter Piper picked a peck of pickled peppers" },
		},
		{
			id: "43cfcb31-07e2-411f-8bf9-f82a95ba8b96",
			values: [0.0515, 0.7512, 0.8612, 0.2153, 0.1521, 0.6812],
			metadata: {
				text: "You know New York, you need New York, you know you need unique New York",
			},
		},
		{
			id: "15cc795d-93d3-416d-9a2a-36fa6fac73da",
			values: [0.8525, 0.7751, 0.6326, 0.1512, 0.9655, 0.6626],
			metadata: { text: "He threw three free throws" },
		},
		{
			id: "15cc795d-93d3-416d-9a2a-36fa6fac73da",
			values: [0.6323, 0.1111, 0.5136, 0.7512, 0.6632, 0.5254],
			metadata: {
				text: "Which witch is which?",
				boo: false,
				num: 100,
				nested: { t: "abcd" },
			},
		},
	];

	it("should batch uploads in ndjson format for Vectorize v1", async () => {
		writeFileSync(
			"vectors.ndjson",
			testVectors.map((v) => JSON.stringify(v)).join(`\n`)
		);

		const batchSize = 3;
		let insertRequestCount = 0;
		msw.use(
			http.post(
				"*/vectorize/indexes/:indexName/insert",
				async ({ request, params }) => {
					expect(params.indexName).toEqual("my-index");

					const formData = await request.formData();
					const vectors = await toString(formData.get("vectors"));

					if (insertRequestCount === 0) {
						expect(vectors).toMatchInlineSnapshot(`
							"{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121],"metadata":{"text":"She sells seashells by the seashore"}}
							{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512],"metadata":{"text":"Peter Piper picked a peck of pickled peppers"}}
							{"id":"43cfcb31-07e2-411f-8bf9-f82a95ba8b96","values":[0.0515,0.7512,0.8612,0.2153,0.1521,0.6812],"metadata":{"text":"You know New York, you need New York, you know you need unique New York"}}"
						`);
					} else {
						expect(vectors).toMatchInlineSnapshot(`
							"{"id":"15cc795d-93d3-416d-9a2a-36fa6fac73da","values":[0.8525,0.7751,0.6326,0.1512,0.9655,0.6626],"metadata":{"text":"He threw three free throws"}}
							{"id":"15cc795d-93d3-416d-9a2a-36fa6fac73da","values":[0.6323,0.1111,0.5136,0.7512,0.6632,0.5254],"metadata":{"text":"Which witch is which?","boo":false,"num":100,"nested":{"t":"abcd"}}}"
						`);
					}
					insertRequestCount++;

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { count: vectors.split(`\n`).length },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler(
			`vectorize insert my-index --file vectors.ndjson --batch-size ${batchSize} --deprecated-v1=true`
		);

		expect(insertRequestCount).toBe(2);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Uploading vector batch (3 vectors)
			✨ Uploading vector batch (2 vectors)
			✅ Successfully inserted 5 vectors into index 'my-index'"
		`);
	});

	it("should batch uploads in ndjson format for Vectorize", async () => {
		writeFileSync(
			"vectors.ndjson",
			testVectors.map((v) => JSON.stringify(v)).join(`\n`)
		);

		const mutationId = crypto.randomUUID();

		const batchSize = 3;
		let insertRequestCount = 0;
		msw.use(
			http.post(
				"*/vectorize/v2/indexes/:indexName/insert",
				async ({ request, params }) => {
					expect(params.indexName).toEqual("my-index");

					const formData = await request.formData();
					const vectors = await toString(formData.get("vectors"));

					if (insertRequestCount === 0) {
						expect(vectors).toMatchInlineSnapshot(`
							"{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121],"metadata":{"text":"She sells seashells by the seashore"}}
							{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512],"metadata":{"text":"Peter Piper picked a peck of pickled peppers"}}
							{"id":"43cfcb31-07e2-411f-8bf9-f82a95ba8b96","values":[0.0515,0.7512,0.8612,0.2153,0.1521,0.6812],"metadata":{"text":"You know New York, you need New York, you know you need unique New York"}}"
						`);
					} else {
						expect(vectors).toMatchInlineSnapshot(`
							"{"id":"15cc795d-93d3-416d-9a2a-36fa6fac73da","values":[0.8525,0.7751,0.6326,0.1512,0.9655,0.6626],"metadata":{"text":"He threw three free throws"}}
							{"id":"15cc795d-93d3-416d-9a2a-36fa6fac73da","values":[0.6323,0.1111,0.5136,0.7512,0.6632,0.5254],"metadata":{"text":"Which witch is which?","boo":false,"num":100,"nested":{"t":"abcd"}}}"
						`);
					}
					insertRequestCount++;

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { mutationId: mutationId },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler(
			`vectorize insert my-index --file vectors.ndjson --batch-size ${batchSize}`
		);

		expect(insertRequestCount).toBe(2);
		expect(
			std.out.replaceAll(mutationId, "00000000-0000-0000-0000-000000000000")
		).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Enqueued 3 vectors into index 'my-index' for insertion. Mutation changeset identifier: 00000000-0000-0000-0000-000000000000
			✨ Enqueued 2 vectors into index 'my-index' for insertion. Mutation changeset identifier: 00000000-0000-0000-0000-000000000000
			✅ Successfully enqueued 5 vectors into index 'my-index' for insertion."
		`);
	});

	it("should batch uploads for upsert in ndjson format for Vectorize", async () => {
		writeFileSync(
			"vectors.ndjson",
			testVectors.map((v) => JSON.stringify(v)).join(`\n`)
		);

		const mutationId = crypto.randomUUID();

		const batchSize = 3;
		let insertRequestCount = 0;
		msw.use(
			http.post(
				"*/vectorize/v2/indexes/:indexName/upsert",
				async ({ request, params }) => {
					expect(params.indexName).toEqual("my-index");

					const formData = await request.formData();
					const vectors = await toString(formData.get("vectors"));

					if (insertRequestCount === 0) {
						expect(vectors).toMatchInlineSnapshot(`
							"{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121],"metadata":{"text":"She sells seashells by the seashore"}}
							{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512],"metadata":{"text":"Peter Piper picked a peck of pickled peppers"}}
							{"id":"43cfcb31-07e2-411f-8bf9-f82a95ba8b96","values":[0.0515,0.7512,0.8612,0.2153,0.1521,0.6812],"metadata":{"text":"You know New York, you need New York, you know you need unique New York"}}"
						`);
					} else {
						expect(vectors).toMatchInlineSnapshot(`
							"{"id":"15cc795d-93d3-416d-9a2a-36fa6fac73da","values":[0.8525,0.7751,0.6326,0.1512,0.9655,0.6626],"metadata":{"text":"He threw three free throws"}}
							{"id":"15cc795d-93d3-416d-9a2a-36fa6fac73da","values":[0.6323,0.1111,0.5136,0.7512,0.6632,0.5254],"metadata":{"text":"Which witch is which?","boo":false,"num":100,"nested":{"t":"abcd"}}}"
						`);
					}
					insertRequestCount++;

					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { mutationId: mutationId },
						},
						{ status: 200 }
					);
				}
			)
		);

		await runWrangler(
			`vectorize upsert my-index --file vectors.ndjson --batch-size ${batchSize}`
		);

		expect(insertRequestCount).toBe(2);
		expect(
			std.out.replaceAll(mutationId, "00000000-0000-0000-0000-000000000000")
		).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			✨ Enqueued 3 vectors into index 'my-index' for upsertion. Mutation changeset identifier: 00000000-0000-0000-0000-000000000000
			✨ Enqueued 2 vectors into index 'my-index' for upsertion. Mutation changeset identifier: 00000000-0000-0000-0000-000000000000
			✅ Successfully enqueued 5 vectors into index 'my-index' for upsertion."
		`);
	});

	it("should reject an invalid file param", async () => {
		await expect(
			runWrangler("vectorize upsert my-index --file invalid_vectors.ndjson")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 Cannot read invalid or empty file: invalid_vectors.ndjson.]`
		);
	});

	it("should reject an empty file param", async () => {
		writeFileSync("empty_vectors.ndjson", "");

		await expect(
			runWrangler("vectorize upsert my-index --file empty_vectors.ndjson")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: 🚨 Cannot read invalid or empty file: empty_vectors.ndjson.]`
		);
	});
});
