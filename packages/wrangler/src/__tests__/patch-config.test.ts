import { writeFileSync } from "node:fs";
import dedent from "ts-dedent";
import { experimental_patchConfig } from "../config/patch-config";
import { runInTempDir } from "./helpers/run-in-tmp";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type { RawConfig } from "../config";

type TestCase = {
	name: string;
	original: RawConfig;
	patch: RawConfig;
	expectedToml: string;
	expectedJson: string;
};
const testCases: TestCase[] = [
	{
		name: "add a binding",
		original: {},
		patch: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

				[[kv_namespaces]]
				binding = "KV"

				`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV"
						}
					]
				}
			`,
	},
	{
		name: "add a second binding of the same type",
		original: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
		},
		patch: {
			kv_namespaces: [
				{
					binding: "KV2",
				},
			],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

				[[kv_namespaces]]
				binding = "KV"

				[[kv_namespaces]]
				binding = "KV2"

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV"
						},
						{
							"binding": "KV2"
						}
					]
				}
			`,
	},
	{
		name: "add a new D1 binding when only KV bindings exist",
		original: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
		},
		patch: {
			d1_databases: [
				{
					binding: "DB",
				},
			],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

				[[kv_namespaces]]
				binding = "KV"

				[[d1_databases]]
				binding = "DB"

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV"
						}
					],
					"d1_databases": [
						{
							"binding": "DB"
						}
					]
				}
			`,
	},
	{
		name: "add a new field",
		original: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
		},
		patch: {
			compatibility_flags: ["nodejs_compat"],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"
				compatibility_flags = [ "nodejs_compat" ]

				[[kv_namespaces]]
				binding = "KV"

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV"
						}
					],
					"compatibility_flags": [
						"nodejs_compat"
					]
				}
			`,
	},
	{
		name: "make multiple edits at the same time",
		original: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
			d1_databases: [
				{
					binding: "DB",
				},
			],
		},
		patch: {
			kv_namespaces: [
				{
					binding: "KV2",
				},
				{
					binding: "KV3",
				},
			],
			d1_databases: [
				{
					binding: "DB2",
				},
			],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

				[[kv_namespaces]]
				binding = "KV"

				[[kv_namespaces]]
				binding = "KV2"

				[[kv_namespaces]]
				binding = "KV3"

				[[d1_databases]]
				binding = "DB"

				[[d1_databases]]
				binding = "DB2"

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV"
						},
						{
							"binding": "KV2"
						},
						{
							"binding": "KV3"
						}
					],
					"d1_databases": [
						{
							"binding": "DB"
						},
						{
							"binding": "DB2"
						}
					]
				}
			`,
	},
];

describe("experimental_patchConfig()", () => {
	runInTempDir();
	describe.each(["json", "toml"])("%s", (configType) => {
		it.each(testCases)(
			`$name`,
			({ original, patch, expectedJson, expectedToml }) => {
				writeWranglerConfig(
					original,
					configType === "json" ? "./wrangler.json" : "./wrangler.toml"
				);
				const result = experimental_patchConfig(
					configType === "json" ? "./wrangler.json" : "./wrangler.toml",
					patch
				);
				expect(result).not.toBeFalsy();
				expect(result).toEqual(
					`${configType === "json" ? expectedJson : expectedToml}`
				);
			}
		);
	});

	describe("jsonc", () => {
		it("preserves comments", () => {
			const jsonc = `
	{
		// a comment
		"compatibility_date": "2022-01-12",
		"name": "test-name",
		"kv_namespaces": [
			{
				// more comments!
				"binding": "KV"
			}
		],
		"d1_databases": [
			/**
			 * multiline comment
			 */
			{
				"binding": "DB"
			}
		]
	}
	`;
			writeFileSync("./wrangler.jsonc", jsonc);
			const patch = {
				kv_namespaces: [
					{
						binding: "KV2",
					},
					{
						binding: "KV3",
					},
				],
				d1_databases: [
					{
						binding: "DB2",
					},
				],
			};
			const result = experimental_patchConfig("./wrangler.jsonc", patch);
			expect(result).not.toBeFalsy();
			expect(result).toMatchInlineSnapshot(`
				"{
					// a comment
					\\"compatibility_date\\": \\"2022-01-12\\",
					\\"name\\": \\"test-name\\",
					\\"kv_namespaces\\": [
						{
							// more comments!
							\\"binding\\": \\"KV\\"
						},
						{
							\\"binding\\": \\"KV2\\"
						},
						{
							\\"binding\\": \\"KV3\\"
						}
					],
					\\"d1_databases\\": [
						/**
							 * multiline comment
							 */
						{
							\\"binding\\": \\"DB\\"
						},
						{
							\\"binding\\": \\"DB2\\"
						}
					]
				}"
			`);
		});
	});
});
