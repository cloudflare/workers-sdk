import { describe, test } from "vitest";
import { createBatches } from "../../utils/create-batches";

// split a template string into an array of chars (convenience util to make writing inputs/outputs easier)
const s = (input: TemplateStringsArray) => input[0].split("");

describe("createBatches", () => {
	const data = [
		{
			input: s`abcde`,
			batchSize: 2,
			output: [s`ab`, s`cd`, s`e`],
		},
		{
			input: s`abcdefgh`,
			batchSize: 3,
			output: [s`abc`, s`def`, s`gh`],
		},
		{
			input: s`abcdefghijklmnopqrstuvwxyz`,
			batchSize: 6,
			output: [s`abcdef`, s`ghijkl`, s`mnopqr`, s`stuvwx`, s`yz`],
		},
	];

	for (const { input, batchSize, output } of data) {
		test(`${input} in batches of ${batchSize}`, ({ expect }) => {
			expect([...createBatches(input, batchSize)]).toEqual(output);
		});
	}
});
