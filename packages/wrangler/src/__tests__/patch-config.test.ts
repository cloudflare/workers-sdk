import { writeFileSync } from "node:fs";
import dedent from "ts-dedent";
import { experimental_patchConfig } from "../config/patch-config";
import { runInTempDir } from "./helpers/run-in-tmp";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";
import type { RawConfig } from "../config";

type TestCase = {
	name: string;
	original: RawConfig;
	additivePatch: RawConfig;
	replacingPatch: RawConfig;
	expectedToml: string;
	expectedJson: string;
};
const testCases: TestCase[] = [
	{
		name: "add a binding",
		original: {},
		additivePatch: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
		},
		replacingPatch: {
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
		additivePatch: {
			kv_namespaces: [
				{
					binding: "KV2",
				},
			],
		},
		replacingPatch: {
			kv_namespaces: [
				{
					binding: "KV",
				},
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
		additivePatch: {
			d1_databases: [
				{
					binding: "DB",
				},
			],
		},
		replacingPatch: {
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
		additivePatch: {
			compatibility_flags: ["nodejs_compat"],
		},
		replacingPatch: {
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
		additivePatch: {
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
		replacingPatch: {
			kv_namespaces: [
				{
					binding: "KV",
				},
				{
					binding: "KV2",
				},
				{
					binding: "KV3",
				},
			],
			d1_databases: [
				{
					binding: "DB",
				},
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

const replacingOnlyTestCases: Omit<TestCase, "additivePatch">[] = [
	{
		name: "edit a binding",
		original: {},
		replacingPatch: {
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
				binding = "KV2"

				`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV2"
						}
					]
				}
			`,
	},
	{
		name: "add a field to an existing binding",
		original: {
			kv_namespaces: [
				{
					binding: "KV",
				},
			],
		},
		replacingPatch: {
			kv_namespaces: [
				{
					binding: "KV",
					id: "1234",
				},
			],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

				[[kv_namespaces]]
				binding = "KV"
				id = "1234"

				`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"kv_namespaces": [
						{
							"binding": "KV",
							"id": "1234"
						}
					]
				}
			`,
	},
	{
		name: "delete an existing binding so that none are left",
		original: {
			compatibility_flags: ["test-flag"],
		},
		replacingPatch: {
			compatibility_flags: undefined,
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

				`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name"
				}
			`,
	},
	// This one doesn't work because the jsonc-parser leaves behind a stray bracket when deleting
	// there are possibly solutions that I am not inclined to solve right now
	// e.g. passing in {binding: undefined} in the patch instead and cleaning up empty objects
	// {
	// 	name: "delete an existing binding (but some bindings of that type are still left)",
	// 	original: {
	// 		kv_namespaces: [
	// 			{
	// 				binding: "KV",
	// 			},
	// 			{
	// 				binding: "KV2",
	// 			},
	// 		],
	// 	},
	// 	replacingPatch: {
	// 		kv_namespaces: [
	// 			{
	// 				binding: "KV",
	// 			},
	// 			undefined,
	// 		],
	// 	},
	// 	expectedToml: dedent`
	// 			compatibility_date = "2022-01-12"
	// 			name = "test-name"

	// 			[[kv_namespaces]]
	// 			binding = "KV"

	// 			`,
	// 	expectedJson: dedent`
	// 			{
	// 				"compatibility_date": "2022-01-12",
	// 				"name": "test-name",
	// 				"kv_namespaces": [
	// 					{
	// 						"binding": "KV"
	// 					}
	// 				]
	// 			}
	// 		`,
	// },
	{
		name: "edit a compat flag",
		original: {},
		replacingPatch: {
			compatibility_flags: ["no_nodejs_compat"],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"
				compatibility_flags = [ "no_nodejs_compat" ]

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"compatibility_flags": [
						"no_nodejs_compat"
					]
				}
			`,
	},
	{
		name: "add a compat flag",
		original: { compatibility_flags: ["nodejs_compat"] },
		replacingPatch: {
			compatibility_flags: ["nodejs_compat", "flag"],
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"
				compatibility_flags = [ "nodejs_compat", "flag" ]

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name",
					"compatibility_flags": [
						"nodejs_compat",
						"flag"
					]
				}
			`,
	},
	{
		name: "delete a compat flag",
		original: {},
		replacingPatch: {
			compatibility_flags: undefined,
		},
		expectedToml: dedent`
				compatibility_date = "2022-01-12"
				name = "test-name"

			`,
		expectedJson: dedent`
				{
					"compatibility_date": "2022-01-12",
					"name": "test-name"
				}
			`,
	},
];

describe("experimental_patchConfig()", () => {
	runInTempDir();
	describe.each([true, false])("isArrayInsertion = %o", (isArrayInsertion) => {
		describe.each(testCases)(
			`$name`,
			({
				original,
				replacingPatch,
				additivePatch,
				expectedJson,
				expectedToml,
			}) => {
				it.each(["json", "toml"])("%s", (configType) => {
					writeWranglerConfig(
						original,
						configType === "json" ? "./wrangler.json" : "./wrangler.toml"
					);
					const result = experimental_patchConfig(
						configType === "json" ? "./wrangler.json" : "./wrangler.toml",
						isArrayInsertion ? additivePatch : replacingPatch,
						isArrayInsertion
					);
					expect(result).not.toBeFalsy();
					expect(result).toEqual(
						`${configType === "json" ? expectedJson : expectedToml}`
					);
				});
			}
		);
	});
	describe("isArrayInsertion = false", () => {
		describe.each(replacingOnlyTestCases)(
			`$name`,
			({ original, replacingPatch, expectedJson, expectedToml }) => {
				it.each(["json", "toml"])("%s", (configType) => {
					writeWranglerConfig(
						original,
						configType === "json" ? "./wrangler.json" : "./wrangler.toml"
					);
					const result = experimental_patchConfig(
						configType === "json" ? "./wrangler.json" : "./wrangler.toml",
						replacingPatch,
						false
					);
					expect(result).not.toBeFalsy();
					expect(result).toEqual(
						`${configType === "json" ? expectedJson : expectedToml}`
					);
				});
			}
		);
	});

	describe("jsonc", () => {
		describe("add multiple bindings", () => {
			it("isArrayInsertion = true", () => {
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
			it("isArrayInsertion = false ", () => {
				const jsonc = dedent`
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
							binding: "KV",
						},
						{
							binding: "KV2",
						},
						{
							binding: "KV3",
						},
					],
					d1_databases: [
						{
							binding: "DB",
						},
						{
							binding: "DB2",
						},
					],
				};
				const result = experimental_patchConfig(
					"./wrangler.jsonc",
					patch,
					false
				);
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
		describe("edit existing bindings", () => {
			it("isArrayInsertion = false", () => {
				const jsonc = `
				{
					// comment one
					"compatibility_date": "2022-01-12",
					// comment two
					"name": "test-name",
					"kv_namespaces": [
						{
							// comment three
							"binding": "KV"
							// comment four
						},
						{
							// comment five
							"binding": "KV2"
							// comment six
						}
					]
				}
				`;
				writeFileSync("./wrangler.jsonc", jsonc);
				const patch = {
					compatibility_date: "2024-27-09",
					kv_namespaces: [
						{
							binding: "KV",
							id: "hello-id",
						},
						{
							binding: "KV2",
						},
					],
				};
				const result = experimental_patchConfig(
					"./wrangler.jsonc",
					patch,
					false
				);
				expect(result).not.toBeFalsy();
				expect(result).toMatchInlineSnapshot(`
					"{
						// comment one
						\\"compatibility_date\\": \\"2024-27-09\\",
						// comment two
						\\"name\\": \\"test-name\\",
						\\"kv_namespaces\\": [
							{
								// comment three
								\\"binding\\": \\"KV\\",
								\\"id\\": \\"hello-id\\"
								// comment four
							},
							{
								// comment five
								\\"binding\\": \\"KV2\\"
								// comment six
							}
						]
					}"
				`);
			});
		});

		describe("edit existing bindings with patch array in a different order (will mess up comments)", () => {
			it("isArrayInsertion = false", () => {
				const jsonc = `
				{
					// comment one
					"compatibility_date": "2022-01-12",
					// comment two
					"name": "test-name",
					"kv_namespaces": [
						{
							// comment three
							"binding": "KV"
							// comment four
						},
						{
							// comment five
							"binding": "KV2"
							// comment six
						}
					]
				}
				`;
				writeFileSync("./wrangler.jsonc", jsonc);
				const patch = {
					compatibility_date: "2024-27-09",
					kv_namespaces: [
						{
							binding: "KV2",
						},
						{
							binding: "KV",
							id: "hello-id",
						},
					],
				};
				const result = experimental_patchConfig(
					"./wrangler.jsonc",
					patch,
					false
				);
				expect(result).not.toBeFalsy();
				// Note that the comments have stayed in place!
				// However, I don't think we can reasonably expect to bring comments along when an array has been reordered
				expect(result).toMatchInlineSnapshot(`
					"{
						// comment one
						\\"compatibility_date\\": \\"2024-27-09\\",
						// comment two
						\\"name\\": \\"test-name\\",
						\\"kv_namespaces\\": [
							{
								// comment three
								\\"binding\\": \\"KV2\\"
								// comment four
							},
							{
								// comment five
								\\"binding\\": \\"KV\\",
								\\"id\\": \\"hello-id\\"
								// comment six
							}
						]
					}"
				`);
			});
		});

		describe("delete existing bindings (cannot preserve comments)", () => {
			it("isArrayInsertion = false", () => {
				const jsonc = `
				{
					// comment one
					"compatibility_date": "2022-01-12",
					// comment two
					"name": "test-name",
					"kv_namespaces": [
						{
							// comment three
							"binding": "KV"
							// comment four
						},
						{
							// comment five
							"binding": "KV2"
							// comment six
						}
					]
				}
				`;
				writeFileSync("./wrangler.jsonc", jsonc);
				const patch = {
					compatibility_date: "2024-27-09",
					kv_namespaces: undefined,
				};
				const result = experimental_patchConfig(
					"./wrangler.jsonc",
					patch,
					false
				);
				expect(result).not.toBeFalsy();
				expect(result).toMatchInlineSnapshot(`
					"{
						// comment one
						\\"compatibility_date\\": \\"2024-27-09\\",
						// comment two
						\\"name\\": \\"test-name\\"
					}"
				`);
			});
		});
	});
});
