import { describe, it } from "vitest";
import { camelObject } from "../src/codemods/wrangler-to-cf/converter-helpers";

describe("converter helpers", () => {
	it("camel-cases record keys at every array depth", ({ expect }) => {
		expect(
			camelObject({
				options: [
					[
						{
							head_sampling_rate: 0.5,
						},
					],
				],
			})
		).toEqual({
			kind: "object",
			properties: [
				{
					key: "options",
					value: [
						[
							{
								kind: "object",
								properties: [
									{
										key: "headSamplingRate",
										value: 0.5,
									},
								],
							},
						],
					],
				},
			],
		});
	});
});
