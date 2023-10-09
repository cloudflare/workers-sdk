import { Blob } from "node:buffer";
import { writeFileSync } from "node:fs";
import { MockedRequest, rest } from "msw";
import { FormData } from "undici";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { msw } from "../helpers/msw";
import { FileReaderSync } from "../helpers/msw/read-file-sync";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { VectorizeVector } from "@cloudflare/workers-types";
import type { RestRequest } from "msw";

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
			metadata: { text: "Which witch is which?" },
		},
	];

	it("should batch uploads in ndjson format", async () => {
		writeFileSync(
			"vectors.ndjson",
			testVectors.map((v) => JSON.stringify(v)).join(`\n`)
		);

		const batchSize = 3;
		let insertRequestCount = 0;
		msw.use(
			rest.post(
				"*/vectorize/indexes/:indexName/insert",
				async (req, res, ctx) => {
					expect(req.params.indexName).toEqual("my-index");
					expect(req.headers.get("Content-Type")).toBe(
						"text/plain;charset=UTF-8"
					);
					const formData = await (req as RestRequestWithFormData).formData();
					const vectors = formData.get("vectors") as string;

					if (insertRequestCount === 0) {
						expect(formData).toMatchInlineSnapshot(`
				FormData {
				  Symbol(state): Array [
				    Object {
				      "name": "vectors",
				      "value": "{\\"id\\":\\"b0daca4a-ffd8-4865-926b-e24800af2a2d\\",\\"values\\":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121],\\"metadata\\":{\\"text\\":\\"She sells seashells by the seashore\\"}}
				{\\"id\\":\\"a44706aa-a366-48bc-8cc1-3feffd87d548\\",\\"values\\":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512],\\"metadata\\":{\\"text\\":\\"Peter Piper picked a peck of pickled peppers\\"}}
				{\\"id\\":\\"43cfcb31-07e2-411f-8bf9-f82a95ba8b96\\",\\"values\\":[0.0515,0.7512,0.8612,0.2153,0.1521,0.6812],\\"metadata\\":{\\"text\\":\\"You know New York, you need New York, you know you need unique New York\\"}}",
				    },
				  ],
				}
			`);
					} else {
						expect(formData).toMatchInlineSnapshot(`
				FormData {
				  Symbol(state): Array [
				    Object {
				      "name": "vectors",
				      "value": "{\\"id\\":\\"15cc795d-93d3-416d-9a2a-36fa6fac73da\\",\\"values\\":[0.8525,0.7751,0.6326,0.1512,0.9655,0.6626],\\"metadata\\":{\\"text\\":\\"He threw three free throws\\"}}
				{\\"id\\":\\"15cc795d-93d3-416d-9a2a-36fa6fac73da\\",\\"values\\":[0.6323,0.1111,0.5136,0.7512,0.6632,0.5254],\\"metadata\\":{\\"text\\":\\"Which witch is which?\\"}}",
				    },
				  ],
				}
			`);
					}
					insertRequestCount++;

					return res(
						ctx.status(200),
						ctx.json({
							success: true,
							errors: [],
							messages: [],
							result: { count: vectors.split(`\n`).length },
						})
					);
				}
			)
		);

		await runWrangler(
			`vectorize insert my-index --file vectors.ndjson --batch-size ${batchSize}`
		);

		expect(insertRequestCount).toBe(2);
		expect(std.out).toMatchInlineSnapshot(`
		"✨ Uploading vector batch (3 vectors)
		✨ Uploading vector batch (2 vectors)
		✅ Successfully inserted 5 vectors into index 'my-index'"
	`);
	});
});

FormData.prototype.toString = mockFormDataToString;
export interface RestRequestWithFormData extends MockedRequest, RestRequest {
	formData(): Promise<FormData>;
}
(MockedRequest.prototype as RestRequestWithFormData).formData =
	mockFormDataFromString;

function mockFormDataToString(this: FormData) {
	const entries = [];
	for (const [key, value] of this.entries()) {
		if (value instanceof Blob) {
			const reader = new FileReaderSync();
			reader.readAsText(value);
			const result = reader.result;
			entries.push([key, result]);
		} else {
			entries.push([key, value]);
		}
	}
	return JSON.stringify({
		__formdata: entries,
	});
}

async function mockFormDataFromString(this: MockedRequest): Promise<FormData> {
	const { __formdata } = await this.json();
	expect(__formdata).toBeInstanceOf(Array);

	const form = new FormData();
	for (const [key, value] of __formdata) {
		form.set(key, value);
	}
	return form;
}
