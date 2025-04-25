import * as fs from "fs";
import path from "node:path";
import { experimental_readRawConfig, readConfig } from "../../config";
import { normalizeAndValidateConfig } from "../../config/validation";
import { run } from "../../experimental-flags";
import { normalizeString } from "../helpers/normalize";
import { runInTempDir } from "../helpers/run-in-tmp";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";
import type {
	ConfigFields,
	RawConfig,
	RawDevConfig,
	RawEnvironment,
} from "../../config";

describe("readConfig()", () => {
	runInTempDir();
	it("should not error if a python entrypoint is used with the right compatibility_flag", () => {
		writeWranglerConfig({
			main: "index.py",
			compatibility_flags: ["python_workers"],
		});
		const config = readConfig({ config: "wrangler.toml" });
		expect(config.rules).toMatchInlineSnapshot(`
			Array [
			  Object {
			    "globs": Array [
			      "**/*.py",
			    ],
			    "type": "PythonModule",
			  },
			]
		`);
	});
	it("should error if a python entrypoint is used without the right compatibility_flag", () => {
		writeWranglerConfig({
			main: "index.py",
		});
		try {
			readConfig({ config: "wrangler.toml" });
			expect.fail();
		} catch (e) {
			expect(e).toMatchInlineSnapshot(
				`[Error: The \`python_workers\` compatibility flag is required to use Python.]`
			);
		}
	});
});

describe("normalizeAndValidateConfig()", () => {
	it("should use defaults for empty configuration", () => {
		const { config, diagnostics } = normalizeAndValidateConfig(
			{},
			undefined,
			undefined,
			{
				env: undefined,
			}
		);

		expect(config).toEqual({
			account_id: undefined,
			build: {
				command: undefined,
				cwd: undefined,
				watch_dir: "./src",
			},
			compatibility_date: undefined,
			compatibility_flags: [],
			configPath: undefined,
			d1_databases: [],
			vectorize: [],
			hyperdrive: [],
			dev: {
				ip: process.platform === "win32" ? "127.0.0.1" : "localhost",
				local_protocol: "http",
				port: undefined, // the default of 8787 is set at runtime
				upstream_protocol: "http",
				host: undefined,
			},
			containers: undefined,
			cloudchamber: {},
			durable_objects: {
				bindings: [],
			},
			jsx_factory: "React.createElement",
			jsx_fragment: "React.Fragment",
			tsconfig: undefined,
			kv_namespaces: [],
			send_email: [],
			legacy_env: true,
			logfwdr: {
				bindings: [],
				schema: undefined,
			},
			send_metrics: undefined,
			main: undefined,
			migrations: [],
			name: undefined,
			queues: {
				consumers: [],
				producers: [],
			},
			r2_buckets: [],
			secrets_store_secrets: [],
			services: [],
			analytics_engine_datasets: [],
			route: undefined,
			routes: undefined,
			rules: [],
			site: undefined,
			text_blobs: undefined,
			browser: undefined,
			ai: undefined,
			version_metadata: undefined,
			triggers: {
				crons: [],
			},
			unsafe: {
				bindings: undefined,
				metadata: undefined,
			},
			dispatch_namespaces: [],
			mtls_certificates: [],
			usage_model: undefined,
			vars: {},
			define: {},
			wasm_modules: undefined,
			data_blobs: undefined,
			workers_dev: undefined,
			preview_urls: true,
			zone_id: undefined,
			no_bundle: undefined,
			minify: undefined,
			first_party_worker: undefined,
			keep_vars: undefined,
			logpush: undefined,
			upload_source_maps: undefined,
			placement: undefined,
			tail_consumers: undefined,
			pipelines: [],
			workflows: [],
		});
		expect(diagnostics.hasErrors()).toBe(false);
		expect(diagnostics.hasWarnings()).toBe(false);
	});

	describe("top-level non-environment configuration", () => {
		it("should override config defaults with provided values", () => {
			const expectedConfig: Partial<ConfigFields<RawDevConfig>> = {
				legacy_env: true,
				send_metrics: false,
				dev: {
					ip: "255.255.255.255",
					port: 9999,
					local_protocol: "https",
					upstream_protocol: "http",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				undefined,
				undefined,
				{ env: undefined }
			);

			expect(config).toEqual(expect.objectContaining(expectedConfig));
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		it("should error on invalid top level fields", () => {
			const expectedConfig = {
				legacy_env: "FOO",
				send_metrics: "BAD",
				keep_vars: "NEVER",
				dev: {
					ip: 222,
					port: "FOO",
					local_protocol: "wss",
					upstream_protocol: "ws",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				undefined,
				undefined,

				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({ ...expectedConfig, main: undefined })
			);
			expect(diagnostics.hasWarnings()).toBe(false);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - Expected \\"legacy_env\\" to be of type boolean but got \\"FOO\\".
			  - Expected \\"send_metrics\\" to be of type boolean but got \\"BAD\\".
			  - Expected \\"keep_vars\\" to be of type boolean but got \\"NEVER\\".
			  - Expected \\"dev.ip\\" to be of type string but got 222.
			  - Expected \\"dev.port\\" to be of type number but got \\"FOO\\".
			  - Expected \\"dev.local_protocol\\" field to be one of [\\"http\\",\\"https\\"] but got \\"wss\\".
			  - Expected \\"dev.upstream_protocol\\" field to be one of [\\"http\\",\\"https\\"] but got \\"ws\\"."
		`);
		});

		it("should warn on and remove unexpected top level fields", () => {
			const expectedConfig = {
				unexpected: {
					subkey: "some-value",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				undefined,
				undefined,

				{ env: undefined }
			);

			expect("unexpected" in config).toBe(false);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:
				  - Unexpected fields found in top-level field: \\"unexpected\\""
			`);
		});

		it("should report a deprecation warning if `miniflare` appears at the top level", () => {
			const expectedConfig = {
				miniflare: {
					host: "localhost",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				undefined,
				undefined,

				{ env: undefined }
			);

			expect("miniflare" in config).toBe(false);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:
				  - Unexpected fields found in top-level field: \\"miniflare\\""
			`);
		});

		it("should normalise a blank route value to be undefined", () => {
			const expectedConfig = {
				route: "",
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				undefined,
				undefined,

				{ env: undefined }
			);

			expect(config.route).toBeUndefined();
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(true);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The \\"route\\" field in your configuration is an empty string and will be ignored.
			    Please remove the \\"route\\" field from your configuration."
		`);
		});

		it("should normalise a blank account_id value to be undefined", () => {
			const expectedConfig = {
				account_id: "",
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				undefined,
				undefined,

				{ env: undefined }
			);

			expect(config.account_id).toBeUndefined();
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(true);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The \\"account_id\\" field in your configuration is an empty string and will be ignored.
			    Please remove the \\"account_id\\" field from your configuration."
		`);
		});

		describe("compatibility_date", () => {
			it("should allow valid values", () => {
				const expectedConfig: RawConfig = {
					compatibility_date: "2024-10-01",
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error for en-dashes", () => {
				const expectedConfig: RawConfig = {
					compatibility_date: "2024–10–01", // en-dash
				};

				const result = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{
						env: undefined,
					}
				);

				expect(result.config).toEqual(expect.objectContaining(expectedConfig));
				expect(result.diagnostics.hasWarnings()).toBe(false);
				expect(result.diagnostics.hasErrors()).toBe(true);

				expect(normalizeString(result.diagnostics.renderErrors()))
					.toMatchInlineSnapshot(`
						"Processing wrangler configuration:
						  - \\"compatibility_date\\" field should use ISO-8601 accepted hyphens (-) rather than en-dashes (–) or em-dashes (—)."
					`);
			});

			it("should error for em-dashes", () => {
				const expectedConfig = {
					compatibility_date: "2024—10—01", // em-dash
				};

				const result = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{
						env: undefined,
					}
				);

				expect(result.config).toEqual(expect.objectContaining(expectedConfig));
				expect(result.diagnostics.hasWarnings()).toBe(false);
				expect(result.diagnostics.hasErrors()).toBe(true);

				expect(normalizeString(result.diagnostics.renderErrors()))
					.toMatchInlineSnapshot(`
						"Processing wrangler configuration:
						  - \\"compatibility_date\\" field should use ISO-8601 accepted hyphens (-) rather than en-dashes (–) or em-dashes (—)."
					`);
			});

			it("should error for invalid date values", () => {
				const expectedConfig: RawConfig = {
					compatibility_date: "abc",
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(true);

				expect(normalizeString(diagnostics.renderErrors()))
					.toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"compatibility_date\\" field should be a valid ISO-8601 date (YYYY-MM-DD), but got \\"abc\\"."
				`);
			});

			it("should error for dates that are both invalid and include en/em dashes", () => {
				const expectedConfig = {
					compatibility_date: "2024—100—01", // invalid date + em-dash
				};

				const result = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{
						env: undefined,
					}
				);

				expect(result.config).toEqual(expect.objectContaining(expectedConfig));
				expect(result.diagnostics.hasWarnings()).toBe(false);
				expect(result.diagnostics.hasErrors()).toBe(true);

				expect(normalizeString(result.diagnostics.renderErrors()))
					.toMatchInlineSnapshot(`
						"Processing wrangler configuration:
						  - \\"compatibility_date\\" field should use ISO-8601 accepted hyphens (-) rather than en-dashes (–) or em-dashes (—).
						  - \\"compatibility_date\\" field should be a valid ISO-8601 date (YYYY-MM-DD), but got \\"2024—100—01\\"."
					`);
			});
		});

		describe("[site]", () => {
			it("should override `site` config defaults with provided values", () => {
				const expectedConfig: RawConfig = {
					site: {
						bucket: "BUCKET",
						"entry-point": "my-site",
						exclude: ["EXCLUDE_1", "EXCLUDE_2"],
						include: ["INCLUDE_1", "INCLUDE_2"],
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(true);

				expect(normalizeString(diagnostics.renderWarnings()))
					.toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - [1mDeprecation[0m: \\"site.entry-point\\":
			              Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration file:
			              \`\`\`
			              main = \\"my-site/index.js\\"
			              \`\`\`"
		        `);
			});

			it("should error if `site` config is missing `bucket`", () => {
				const expectedConfig: RawConfig = {
					// @ts-expect-error we're intentionally passing an invalid configuration here
					site: {
						"entry-point": "workers-site",
						include: ["INCLUDE_1", "INCLUDE_2"],
						exclude: ["EXCLUDE_1", "EXCLUDE_2"],
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.hasErrors()).toBe(true);

				expect(normalizeString(diagnostics.renderWarnings()))
					.toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - [1mDeprecation[0m: \\"site.entry-point\\":
			              Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration file:
			              \`\`\`
			              main = \\"workers-site/index.js\\"
			              \`\`\`"
		        `);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - \\"site.bucket\\" is a required field."
		        `);
			});

			it("should error on invalid `site` values", () => {
				const expectedConfig = {
					site: {
						bucket: "BUCKET",
						"entry-point": 111,
						include: [222, 333],
						exclude: [444, 555],
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig as unknown as RawConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Expected \\"sites.include.[0]\\" to be of type string but got 222.
			            - Expected \\"sites.include.[1]\\" to be of type string but got 333.
			            - Expected \\"sites.exclude.[0]\\" to be of type string but got 444.
			            - Expected \\"sites.exclude.[1]\\" to be of type string but got 555.
			            - Expected \\"site.entry-point\\" to be of type string but got 111."
		        `);

				expect(normalizeString(diagnostics.renderWarnings()))
					.toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - [1mDeprecation[0m: \\"site.entry-point\\":
			              Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration file:
			              \`\`\`
			              main = \\"111/index.js\\"
			              \`\`\`"
		        `);
			});

			it("should log a deprecation warning if entry-point is defined", async () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					{
						site: {
							bucket: "some/path",
							"entry-point": "some/other/script.js",
						},
					} as unknown as RawConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(config.site).toMatchInlineSnapshot(`
			          Object {
			            "bucket": "some/path",
			            "entry-point": "some/other/script.js",
			            "exclude": Array [],
			            "include": Array [],
			          }
		        `);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.hasErrors()).toBe(false);

				expect(normalizeString(diagnostics.renderWarnings()))
					.toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - [1mDeprecation[0m: \\"site.entry-point\\":
			              Delete the \`site.entry-point\` field, then add the top level \`main\` field to your configuration file:
			              \`\`\`
			              main = \\"some/other/script.js\\"
			              \`\`\`"
		        `);
			});
		});

		describe("[alias]", () => {
			it("errors with a non-object", () => {
				const { config: _config, diagnostics } = normalizeAndValidateConfig(
					{
						alias: "some silly string",
					} as unknown as RawConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected alias to be an object, but got string"
				`);
			});

			it("errors with non string values", () => {
				const { config: _config, diagnostics } = normalizeAndValidateConfig(
					{
						alias: {
							"some-module": 123,
						},
					} as unknown as RawConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected alias[\\"some-module\\"] to be a string, but got number"
				`);
			});

			it("returns the alias config when valid", () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					{
						alias: {
							"some-module": "./path/to/some-module",
						},
					} as unknown as RawConfig,
					undefined,
					undefined,

					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);

				expect(config.alias).toMatchInlineSnapshot(`
					Object {
					  "some-module": "./path/to/some-module",
					}
				`);
			});
		});

		it("should map `wasm_module` paths from relative to the config path to relative to the cwd", () => {
			const expectedConfig: RawConfig = {
				wasm_modules: {
					MODULE_1: "path/to/module_1.mjs",
					MODULE_2: "module_2.mjs",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",

				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					wasm_modules: {
						MODULE_1: path.normalize("project/path/to/module_1.mjs"),
						MODULE_2: path.normalize("project/module_2.mjs"),
					},
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		it("should warn on unexpected fields on `triggers`", async () => {
			const expectedConfig: RawConfig = {
				triggers: {
					crons: ["1 * * * *"],
					// @ts-expect-error we're purposely adding a field
					// that doesn't belong here
					someOtherfield: 123,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					triggers: {
						crons: ["1 * * * *"],
						someOtherfield: 123,
					},
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(true);

			expect(normalizePath(diagnostics.renderWarnings()))
				.toMatchInlineSnapshot(`
					"Processing project/wrangler.toml configuration:
					  - Unexpected fields found in triggers field: \\"someOtherfield\\""
				`);
		});

		it("should error on invalid `wasm_modules` paths", () => {
			const expectedConfig = {
				wasm_modules: {
					MODULE_1: 111,
					MODULE_2: 222,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					wasm_modules: {},
				})
			);
			expect(diagnostics.hasWarnings()).toBe(false);
			expect(normalizePath(diagnostics.renderErrors())).toMatchInlineSnapshot(`
			        "Processing project/wrangler.toml configuration:
			          - Expected \\"wasm_modules['MODULE_1']\\" to be of type string but got 111.
			          - Expected \\"wasm_modules['MODULE_2']\\" to be of type string but got 222."
		      `);
		});

		it("should map `text_blobs` paths from relative to the config path to relative to the cwd", () => {
			const expectedConfig: RawConfig = {
				text_blobs: {
					BLOB_1: "path/to/text1.txt",
					BLOB_2: "text2.md",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					text_blobs: {
						BLOB_1: path.normalize("project/path/to/text1.txt"),
						BLOB_2: path.normalize("project/text2.md"),
					},
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		it("should error on invalid `text_blob` paths", () => {
			const expectedConfig = {
				text_blobs: {
					MODULE_1: 111,
					MODULE_2: 222,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					text_blobs: {},
				})
			);
			expect(diagnostics.hasWarnings()).toBe(false);
			expect(normalizePath(diagnostics.renderErrors())).toMatchInlineSnapshot(`
			        "Processing project/wrangler.toml configuration:
			          - Expected \\"text_blobs['MODULE_1']\\" to be of type string but got 111.
			          - Expected \\"text_blobs['MODULE_2']\\" to be of type string but got 222."
		      `);
		});

		it("should map `data_blobs` paths from relative to the config path to relative to the cwd", () => {
			const expectedConfig: RawConfig = {
				data_blobs: {
					BLOB_1: "path/to/data1.bin",
					BLOB_2: "data2.bin",
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					data_blobs: {
						BLOB_1: path.normalize("project/path/to/data1.bin"),
						BLOB_2: path.normalize("project/data2.bin"),
					},
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		it("should error on invalid `data_blob` paths", () => {
			const expectedConfig = {
				data_blobs: {
					MODULE_1: 111,
					MODULE_2: 222,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig as unknown as RawConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					data_blobs: {},
				})
			);
			expect(diagnostics.hasWarnings()).toBe(false);
			expect(normalizePath(diagnostics.renderErrors())).toMatchInlineSnapshot(`
			        "Processing project/wrangler.toml configuration:
			          - Expected \\"data_blobs['MODULE_1']\\" to be of type string but got 111.
			          - Expected \\"data_blobs['MODULE_2']\\" to be of type string but got 222."
		      `);
		});

		it("should resolve tsconfig relative to wrangler.toml", async () => {
			const expectedConfig: RawEnvironment = {
				tsconfig: "path/to/some-tsconfig.json",
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					tsconfig: path.normalize("project/path/to/some-tsconfig.json"),
				})
			);

			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		it("should warn on unsafe binding metadata usage", () => {
			const expectedConfig: RawConfig = {
				unsafe: {
					bindings: [
						{
							type: "metadata",
							name: "METADATA",
						},
					],
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"project/wrangler.toml",
				"project/wrangler.toml",
				{ env: undefined }
			);

			expect(config).toEqual(
				expect.objectContaining({
					unsafe: {
						bindings: [
							{
								type: "metadata",
								name: "METADATA",
							},
						],
					},
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(true);

			expect(normalizeString(diagnostics.renderWarnings()))
				.toMatchInlineSnapshot(`
"Processing project/wrangler.toml configuration:
  - \\"unsafe\\" fields are experimental and may change or break at any time.
  - \\"unsafe.bindings[0]\\": {\\"type\\":\\"metadata\\",\\"name\\":\\"METADATA\\"}
    - The deployment object in the metadata binding is now deprecated. Please switch using the version_metadata binding for access to version specific fields: https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata"
`);
		});
	});

	describe("top-level environment configuration", () => {
		it("should override config defaults with provided values", () => {
			const main = "src/index.ts";
			const resolvedMain = path.resolve(process.cwd(), main);

			const expectedConfig: RawEnvironment = {
				name: "mock-name",
				account_id: "ACCOUNT_ID",
				compatibility_date: "2022-01-01",
				compatibility_flags: ["FLAG1", "FLAG2"],
				workers_dev: false,
				routes: [
					"ROUTE_1",
					"ROUTE_2",
					{ pattern: "ROUTE3", zone_id: "ZONE_ID_3" },
					"ROUTE_4",
				],
				jsx_factory: "JSX_FACTORY",
				jsx_fragment: "JSX_FRAGMENT",
				tsconfig: "path/to/tsconfig",
				triggers: { crons: ["CRON_1", "CRON_2"] },
				main,
				build: {
					command: "COMMAND",
					cwd: "CWD",
					watch_dir: "WATCH_DIR",
				},
				define: {
					DEF1: "DEFINE_1",
					DEF2: "DEFINE_2",
				},
				vars: {
					VAR1: "VALUE_1",
					VAR2: "VALUE_2",
				},
				cloudchamber: {},
				durable_objects: {
					bindings: [
						{ name: "DO_BINDING_1", class_name: "CLASS1" },
						{
							name: "DO_BINDING_2",
							class_name: "CLASS2",
							script_name: "SCRIPT2",
						},
						{
							name: "DO_BINDING_3",
							class_name: "CLASS3",
							script_name: "SCRIPT3",
							environment: "ENV3",
						},
					],
				},
				kv_namespaces: [
					{ binding: "KV_BINDING_1", id: "KV_ID_1" },
					{
						binding: "KV_BINDING_2",
						id: "KV_ID_2",
						preview_id: "KV_PREVIEW_1",
					},
				],
				send_email: [
					{ name: "SEB_TARGET", destination_address: "teste@example.com" },
					{ name: "SEB_UNRESTRICTED" },
					{
						name: "SEB_ALLOWLIST",
						allowed_destination_addresses: [
							"email1@example.com",
							"email2@example.com",
						],
					},
				],
				r2_buckets: [
					{ binding: "R2_BINDING_1", bucket_name: "R2_BUCKET_1" },
					{
						binding: "R2_BINDING_2",
						bucket_name: "R2_BUCKET_2",
						preview_bucket_name: "R2_PREVIEW_2",
					},
				],
				services: [
					{
						binding: "SERVICE_BINDING_1",
						service: "SERVICE_TYPE_1",
						environment: "SERVICE_BINDING_ENVIRONMENT_1",
						entrypoint: "SERVICE_BINDING_ENVIRONMENT_1",
					},
				],
				analytics_engine_datasets: [
					{
						binding: "AE_BINDING_1",
						dataset: "DATASET_1",
					},
					{
						binding: "AE_BINDING_2",
					},
				],
				unsafe: {
					bindings: [
						{ name: "UNSAFE_BINDING_1", type: "UNSAFE_TYPE_1" },
						{
							name: "UNSAFE_BINDING_2",
							type: "UNSAFE_TYPE_2",
							extra: "UNSAFE_EXTRA_1",
						},
					],
					metadata: undefined,
				},
				no_bundle: true,
				minify: true,
				first_party_worker: true,
				logpush: true,
				upload_source_maps: true,
				placement: {
					mode: "smart",
				},
				observability: {
					enabled: true,
					head_sampling_rate: 1,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				expectedConfig,
				"wrangler.toml",
				"wrangler.toml",
				{ env: undefined }
			);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			expect({ ...config, tsconfig: normalizePath(config.tsconfig!) }).toEqual(
				expect.objectContaining({
					...expectedConfig,
					main: resolvedMain,
					topLevelName: expectedConfig.name,
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
				"Processing wrangler.toml configuration:
				  - \\"unsafe\\" fields are experimental and may change or break at any time.
				  - In your wrangler.toml file, you have configured \`durable_objects\` exported by this Worker (CLASS1), but no \`migrations\` for them. This may not work as expected until you add a \`migrations\` section to your wrangler.toml file. Add the following configuration:

				    \`\`\`
				    [[migrations]]
				    tag = \\"v1\\"
				    new_classes = [ \\"CLASS1\\" ]

				    \`\`\`

				    Refer to https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/ for more details."
			`);
		});

		it("should error on invalid environment values", () => {
			const expectedConfig: RawEnvironment = {
				name: 111,
				account_id: 222,
				compatibility_date: 333,
				compatibility_flags: [444, 555],
				workers_dev: "BAD",
				routes: [
					666,
					777,
					// this one's valid, but we add it here to make sure
					// it doesn't get included in the error message
					"example.com/*",
					{ pattern: 123, zone_id: "zone_id_1" },
					{ pattern: "route_2", zone_id: 123 },
					{ pattern: "route_2", zone_name: 123 },
					{ pattern: "route_3" },
					{ zone_id: "zone_id_4" },
					{ zone_name: "zone_name_4" },
					{ pattern: undefined },
					{ pattern: "route_5", zone_id: "zone_id_5", some_other_key: 123 },
					{ pattern: "route_5", zone_name: "zone_name_5", some_other_key: 123 },
					// this one's valid too
					{ pattern: "route_6", zone_id: "zone_id_6" },
					// as well as this one
					{ pattern: "route_6", zone_name: "zone_name_6" },
				],
				route: 888,
				jsx_factory: 999,
				jsx_fragment: 1000,
				tsconfig: true,
				triggers: { crons: [1111, 1222] },
				main: 1333,
				build: {
					command: 1444,
					cwd: 1555,
					watch_dir: 1666,
				},
				define: {
					DEF1: 1777,
				},
				no_bundle: "INVALID",
				minify: "INVALID",
				first_party_worker: "INVALID",
				logpush: "INVALID",
				upload_source_maps: "INVALID",
				placement: {
					mode: "INVALID",
				},
				observability: {
					enabled: "INVALID",
					head_sampling_rate: "INVALID",
				},
			} as unknown as RawEnvironment;

			const { config, diagnostics } = normalizeAndValidateConfig(
				{ env: { ENV1: expectedConfig } },
				undefined,
				undefined,
				{ env: "ENV1" }
			);

			expect(config).toEqual(expect.objectContaining(expectedConfig));
			expect(diagnostics.hasWarnings()).toBe(false);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:

				  - \\"env.ENV1\\" environment configuration
				    - Expected \\"route\\" to be either a string, or an object with shape { pattern, custom_domain, zone_id | zone_name }, but got 888.
				    - Expected \\"account_id\\" to be of type string but got 222.
				    - Expected \\"routes\\" to be an array of either strings or objects with the shape { pattern, custom_domain, zone_id | zone_name }, but these weren't valid: [
				      666,
				      777
				    ].
				    - Expected exactly one of the following fields [\\"routes\\",\\"route\\"].
				    - Expected \\"workers_dev\\" to be of type boolean but got \\"BAD\\".
				    - Expected \\"build.command\\" to be of type string but got 1444.
				    - Expected \\"build.cwd\\" to be of type string but got 1555.
				    - Expected \\"build.watch_dir\\" to be of type string but got 1666.
				    - Expected \\"compatibility_date\\" to be of type string but got 333.
				    - Expected \\"compatibility_flags\\" to be of type string array but got [444,555].
				    - Expected \\"jsx_factory\\" to be of type string but got 999.
				    - Expected \\"jsx_fragment\\" to be of type string but got 1000.
				    - Expected \\"tsconfig\\" to be of type string but got true.
				    - Expected \\"name\\" to be of type string, alphanumeric and lowercase with dashes only but got 111.
				    - Expected \\"main\\" to be of type string but got 1333.
				    - Expected \\"placement.mode\\" field to be one of [\\"off\\",\\"smart\\"] but got \\"INVALID\\".
				    - The field \\"define.DEF1\\" should be a string but got 1777.
				    - Expected \\"no_bundle\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"minify\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"first_party_worker\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"logpush\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"upload_source_maps\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"observability.enabled\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"observability.logs.enabled\\" to be of type boolean but got undefined.
				    - Expected \\"observability.head_sampling_rate\\" to be of type number but got \\"INVALID\\"."
			`);
		});

		describe("name", () => {
			it("should error on invalid `name` value with spaces", () => {
				const expectedConfig: RawEnvironment = {
					name: "this has spaces",
				} as unknown as RawEnvironment;

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected \\"name\\" to be of type string, alphanumeric and lowercase with dashes only but got \\"this has spaces\\"."
				`);
			});

			it("should be valid `name` with underscores", () => {
				const expectedConfig: RawEnvironment = {
					name: "enterprise_nx_01",
				} as unknown as RawEnvironment;

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error on invalid `name` value with special characters", () => {
				const expectedConfig: RawEnvironment = {
					name: "Thy'lek-Shran",
				} as unknown as RawEnvironment;

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Expected \\"name\\" to be of type string, alphanumeric and lowercase with dashes only but got \\"Thy'lek-Shran\\"."
		        `);
			});

			it("should error on invalid `name` value with only special characters", () => {
				const expectedConfig: RawEnvironment = {
					name: "!@#$%^&*(()",
				} as unknown as RawEnvironment;

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Expected \\"name\\" to be of type string, alphanumeric and lowercase with dashes only but got \\"!@#$%^&*(()\\"."
		        `);
			});

			it("should accept any Worker name if the dispatch-namespace flag is used", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "example.com",
						main: "index.js",
					},
					undefined,
					undefined,
					{ env: undefined, "dispatch-namespace": "test-namespace" }
				);
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});
		});

		describe("[build]", () => {
			it("should default custom build watch directories to src", () => {
				const expectedConfig: RawEnvironment = {
					build: {
						command: "execute some --build",
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config.build).toEqual(
					expect.objectContaining({
						command: "execute some --build",
						watch_dir: "./src",
					})
				);

				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should resolve custom build watch directories relative to wrangler.toml", async () => {
				const expectedConfig: RawEnvironment = {
					build: {
						command: "execute some --build",
						watch_dir: "some/path",
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					"project/wrangler.toml",
					"project/wrangler.toml",
					{ env: undefined }
				);

				expect(config.build).toEqual(
					expect.objectContaining({
						command: "execute some --build",
						watch_dir: path.normalize("project/some/path"),
					})
				);

				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should allow watch_dir to be an array of paths", () => {
				const expectedConfig: RawEnvironment = {
					build: {
						command: "execute some --build",
						watch_dir: ["some/path/a", "some/path/b", "some/path/c"],
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					"project/wrangler.toml",
					"project/wrangler.toml",
					{ env: undefined }
				);

				expect(config.build).toEqual(
					expect.objectContaining({
						command: "execute some --build",
						watch_dir: [
							path.normalize("project/some/path/a"),
							path.normalize("project/some/path/b"),
							path.normalize("project/some/path/c"),
						],
					})
				);

				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should error when the watch_dir array isn't an array of strings", () => {
				const expectedConfig: RawEnvironment = {
					build: {
						command: "execute some --build",
						watch_dir: [
							"some/path/a",
							"some/path/b",
							// @ts-expect-error intentionally bad "paths"
							123,
							"some/path/c",
							// @ts-expect-error intentionally bad "paths"
							false,
						],
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					"project/wrangler.toml",
					"project/wrangler.toml",
					{ env: undefined }
				);

				expect(config.build).toEqual(
					expect.objectContaining({
						command: "execute some --build",
						watch_dir: [
							path.normalize("project/some/path/a"),
							path.normalize("project/some/path/b"),
							path.normalize("project/123"),
							path.normalize("project/some/path/c"),
							path.normalize("project/false"),
						],
					})
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);

				expect(normalizePath(diagnostics.renderErrors()))
					.toMatchInlineSnapshot(`
			          "Processing project/wrangler.toml configuration:
			            - Expected \\"build.watch_dir.[2]\\" to be of type string but got 123.
			            - Expected \\"build.watch_dir.[4]\\" to be of type string but got false."
		        `);
			});
		});

		describe("[durable_objects]", () => {
			it("should error if durable_objects is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { durable_objects: [] } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects\\" should be an object but got []."
		        `);
			});

			it("should error if durable_objects is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { durable_objects: "BAD" } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects\\" should be an object but got \\"BAD\\"."
		        `);
			});

			it("should error if durable_objects is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { durable_objects: 999 } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects\\" should be an object but got 999."
		        `);
			});

			it("should error if durable_objects is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { durable_objects: null } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects\\" should be an object but got null."
		        `);
			});

			it("should error if durable_objects.bindings is not defined", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { durable_objects: {} } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects\\" is missing the required \\"bindings\\" property."
		        `);
			});

			it("should error if durable_objects.bindings is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { durable_objects: { bindings: {} } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got {}."
		        `);
			});

			it("should error if durable_objects.bindings is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { durable_objects: { bindings: "BAD" } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got \\"BAD\\"."
		        `);
			});

			it("should error if durable_objects.bindings is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { durable_objects: { bindings: 999 } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got 999."
		        `);
			});

			it("should error if durable_objects.bindings is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { durable_objects: { bindings: null } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.durable_objects.bindings\\" should be an array but got null."
		        `);
			});

			it("should error if durable_objects.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: {
							ENV1: {
								durable_objects: {
									bindings: [
										{},
										{ name: "VALID" },
										{ name: 1555, class_name: 1666 },
										{
											name: 1777,
											class_name: 1888,
											script_name: 1999,
										},
										{
											name: "SOMENAME",
											class_name: "SomeClass",
											environment: "staging",
										},
										{
											name: 1778,
											class_name: 1889,
											script_name: 1992,
											environment: 2111,
										},
										{
											name: 1772,
											class_name: 1883,
											environment: 2112,
										},
									],
								},
							},
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);

				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration

			              - \\"env.ENV1.durable_objects.bindings[0]\\": {}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"class_name\\" field.

			              - \\"env.ENV1.durable_objects.bindings[1]\\": {\\"name\\":\\"VALID\\"}
			                - binding should have a string \\"class_name\\" field.

			              - \\"env.ENV1.durable_objects.bindings[2]\\": {\\"name\\":1555,\\"class_name\\":1666}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"class_name\\" field.

			              - \\"env.ENV1.durable_objects.bindings[3]\\": {\\"name\\":1777,\\"class_name\\":1888,\\"script_name\\":1999}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"class_name\\" field.
			                - the field \\"script_name\\", when present, should be a string.

			              - \\"env.ENV1.durable_objects.bindings[4]\\": {\\"name\\":\\"SOMENAME\\",\\"class_name\\":\\"SomeClass\\",\\"environment\\":\\"staging\\"}
			                - binding should have a \\"script_name\\" field if \\"environment\\" is present.

			              - \\"env.ENV1.durable_objects.bindings[5]\\": {\\"name\\":1778,\\"class_name\\":1889,\\"script_name\\":1992,\\"environment\\":2111}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"class_name\\" field.
			                - the field \\"script_name\\", when present, should be a string.
			                - the field \\"environment\\", when present, should be a string.

			              - \\"env.ENV1.durable_objects.bindings[6]\\": {\\"name\\":1772,\\"class_name\\":1883,\\"environment\\":2112}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"class_name\\" field.
			                - the field \\"environment\\", when present, should be a string.
			                - binding should have a \\"script_name\\" field if \\"environment\\" is present."
		        `);
			});
		});

		describe("[migrations]", () => {
			it("should override `migrations` config defaults with provided values", () => {
				const expectedConfig: RawConfig = {
					migrations: [
						{
							tag: "TAG",
							new_classes: ["CLASS_1", "CLASS_2"],
							renamed_classes: [
								{
									from: "FROM_CLASS",
									to: "TO_CLASS",
								},
							],
							deleted_classes: ["CLASS_3", "CLASS_4"],
						},
					],
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: expectedConfig } },
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should error on invalid `migrations` values", () => {
				const expectedConfig = {
					migrations: [
						{
							tag: 111,
							new_classes: [222, 333],
							new_sqlite_classes: [222, 333],
							renamed_classes: [
								{
									from: 444,
									to: 555,
								},
							],
							deleted_classes: [666, 777],
						},
					],
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: expectedConfig as unknown as RawConfig } },
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.ENV1\\" environment configuration
					    - Expected \\"migrations[0].tag\\" to be of type string but got 111.
					    - Expected \\"migrations[0].new_classes.[0]\\" to be of type string but got 222.
					    - Expected \\"migrations[0].new_classes.[1]\\" to be of type string but got 333.
					    - Expected \\"migrations[0].new_sqlite_classes.[0]\\" to be of type string but got 222.
					    - Expected \\"migrations[0].new_sqlite_classes.[1]\\" to be of type string but got 333.
					    - Expected \\"migrations[0].renamed_classes\\" to be an array of \\"{from: string, to: string}\\" objects but got [{\\"from\\":444,\\"to\\":555}].
					    - Expected \\"migrations[0].deleted_classes.[0]\\" to be of type string but got 666.
					    - Expected \\"migrations[0].deleted_classes.[1]\\" to be of type string but got 777."
				`);
			});

			it("should warn/error on unexpected fields on `migrations`", async () => {
				const expectedConfig = {
					migrations: [
						{
							tag: "TAG",
							new_classes: ["CLASS_1", "CLASS_2"],
							renamed_classes: [
								{
									from: "FROM_CLASS",
									to: "TO_CLASS",
								},
								{
									a: "something",
									b: "someone",
								},
							],
							deleted_classes: ["CLASS_3", "CLASS_4"],
							new_sqlite_classes: ["CLASS_5", "CLASS_6"],
							transferred_classes: [
								{
									from: "FROM_CLASS",
									from_script: "FROM_SCRIPT",
									to: "TO_CLASS",
								},
								{
									from: "FROM_CLASS",
									to: "TO_CLASS",
								},
							],
							unrecognized_field: "FOO",
						},
					],
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: expectedConfig as unknown as RawConfig } },
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.ENV1\\" environment configuration
					    - Unexpected fields found in migrations field: \\"unrecognized_field\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - Expected \\"migrations[0].renamed_classes\\" to be an array of \\"{from: string, to: string}\\" objects but got [{\\"from\\":\\"FROM_CLASS\\",\\"to\\":\\"TO_CLASS\\"},{\\"a\\":\\"something\\",\\"b\\":\\"someone\\"}].
			              - Expected \\"migrations[0].transferred_classes\\" to be an array of \\"{from: string, from_script: string, to: string}\\" objects but got [{\\"from\\":\\"FROM_CLASS\\",\\"from_script\\":\\"FROM_SCRIPT\\",\\"to\\":\\"TO_CLASS\\"},{\\"from\\":\\"FROM_CLASS\\",\\"to\\":\\"TO_CLASS\\"}]."
				`);
			});
		});

		describe("[assets]", () => {
			it("should override `assets` config defaults with provided values", () => {
				const expectedConfig: RawConfig = {
					assets: {
						directory: "public/",
						binding: "ASSETS",
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should error on invalid `assets` values", () => {
				const expectedConfig = {
					assets: {
						binding: 2,
						notAField: "boop",
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in assets field: \\"notAField\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected \\"assets.binding\\" to be of type string but got 2."
				`);
			});

			it("should error on invalid `assets` config values", () => {
				const expectedConfig = {
					assets: {
						directory: "./public",
						html_handling: "foo",
						not_found_handling: "bar",
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.ENV1\\" environment configuration
					    - Unexpected fields found in assets field: \\"invalid_field_1\\",\\"invalid_field_2\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected \\"assets.html_handling\\" field to be one of [\\"auto-trailing-slash\\",\\"force-trailing-slash\\",\\"drop-trailing-slash\\",\\"none\\"] but got \\"foo\\".
					  - Expected \\"assets.not_found_handling\\" field to be one of [\\"single-page-application\\",\\"404-page\\",\\"none\\"] but got \\"bar\\"."
				`);
			});

			it("should accept any Worker name if the dispatch-namespace flag is used", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "example.com",
						main: "index.js",
					},
					undefined,
					undefined,
					{ env: undefined, "dispatch-namespace": "test-namespace" }
				);
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});
		});
	});

	describe("[dispatch_namespaces] in Durable Object env", () => {
		it("should include dispatchNamespaces in the env object passed to Durable Object constructors", async () => {
			const config = {
				dispatch_namespaces: [
					{
						binding: "DISPATCH_NS",
						namespace: "user-worker",
					},
				],
			};

			const env = getBindings(config, "test-env", true, {
				dispatchNamespaces: config.dispatch_namespaces,
			});

			expect(env.dispatch_namespaces).toBeDefined();
			expect(env.dispatch_namespaces).toEqual([
				{
					binding: "DISPATCH_NS",
					namespace: "user-worker",
				},
			]);
		});
	});

	describe("experimental_readRawConfig()", () => {
		describe.each(["json", "jsonc", "toml"])(
			`with %s config files`,
			(configType) => {
				runInTempDir();
				it(`should find a ${configType} config file given a specific path`, () => {
					fs.mkdirSync("../folder", { recursive: true });
					writeWranglerConfig(
						{ name: "config-one" },
						`../folder/config.${configType}`
					);

					const result = experimental_readRawConfig({
						config: `../folder/config.${configType}`,
					});
					expect(result.rawConfig).toEqual(
						expect.objectContaining({
							name: "config-one",
						})
					);
				});

				it("should find a config file given a specific script", () => {
					fs.mkdirSync("./path/to", { recursive: true });
					writeWranglerConfig(
						{ name: "config-one" },
						`./path/wrangler.${configType}`
					);

					fs.mkdirSync("../folder", { recursive: true });
					writeWranglerConfig(
						{ name: "config-two" },
						`../folder/wrangler.${configType}`
					);

					let result = experimental_readRawConfig({
						script: "./path/to/index.js",
					});
					expect(result.rawConfig).toEqual(
						expect.objectContaining({
							name: "config-one",
						})
					);

					result = experimental_readRawConfig({
						script: "../folder/index.js",
					});
					expect(result.rawConfig).toEqual(
						expect.objectContaining({
							name: "config-two",
						})
					);
				});
			}
		);
	});
});

function normalizePath(text: string): string {
	return text
		.replace("project\\wrangler.toml", "project/wrangler.toml")
		.replace("src\\index.ts", "src/index.ts")
		.replace("path\\to\\tsconfig", "path/to/tsconfig");
}
