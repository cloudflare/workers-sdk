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
				enable_containers: true,
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
			unsafe_hello_world: [],
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
				crons: undefined,
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
					enable_containers: false,
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
					enable_containers: true,
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
					{ binding: "R2_BINDING_1", bucket_name: "r2-bucket-1" },
					{
						binding: "R2_BINDING_2",
						bucket_name: "r2-bucket-2",
						preview_bucket_name: "r2-preview-2",
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
				expectedConfig,
				undefined,
				undefined,
				{ env: undefined }
			);

			expect(config).toEqual(expect.objectContaining(expectedConfig));
			expect(diagnostics.hasWarnings()).toBe(false);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:
				  - Expected \\"route\\" to be either a string, or an object with shape { pattern, custom_domain, zone_id | zone_name }, but got 888.
				  - Expected \\"account_id\\" to be of type string but got 222.
				  - Expected \\"routes\\" to be an array of either strings or objects with the shape { pattern, custom_domain, zone_id | zone_name }, but these weren't valid: [
				      666,
				      777,
				      {
				        \\"pattern\\": 123,
				        \\"zone_id\\": \\"zone_id_1\\"
				      },
				      {
				        \\"pattern\\": \\"route_2\\",
				        \\"zone_id\\": 123
				      },
				      {
				        \\"pattern\\": \\"route_2\\",
				        \\"zone_name\\": 123
				      },
				      {
				        \\"pattern\\": \\"route_3\\"
				      },
				      {
				        \\"zone_id\\": \\"zone_id_4\\"
				      },
				      {
				        \\"zone_name\\": \\"zone_name_4\\"
				      },
				      {},
				      {
				        \\"pattern\\": \\"route_5\\",
				        \\"zone_id\\": \\"zone_id_5\\",
				        \\"some_other_key\\": 123
				      },
				      {
				        \\"pattern\\": \\"route_5\\",
				        \\"zone_name\\": \\"zone_name_5\\",
				        \\"some_other_key\\": 123
				      }
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
					{ durable_objects: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects\\" should be an object but got []."
		              `);
			});

			it("should error if durable_objects is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects\\" should be an object but got \\"BAD\\"."
		              `);
			});

			it("should error if durable_objects is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects\\" should be an object but got 999."
		              `);
			});

			it("should error if durable_objects is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects\\" should be an object but got null."
		              `);
			});

			it("should error if durable_objects.bindings is not defined", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects\\" is missing the required \\"bindings\\" property."
		              `);
			});

			it("should error if durable_objects.bindings is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: { bindings: {} } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects.bindings\\" should be an array but got {}."
		              `);
			});

			it("should error if durable_objects.bindings is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: { bindings: "BAD" } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects.bindings\\" should be an array but got \\"BAD\\"."
		              `);
			});

			it("should error if durable_objects.bindings is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: { bindings: 999 } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects.bindings\\" should be an array but got 999."
		              `);
			});

			it("should error if durable_objects.bindings is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ durable_objects: { bindings: null } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"durable_objects.bindings\\" should be an array but got null."
		              `);
			});

			it("should error if durable_objects.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						durable_objects: {
							bindings: [
								{},
								{ name: "MISSING_CLASS" },
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
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);

				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"durable_objects.bindings[0]\\": {}
			              - binding should have a string \\"name\\" field.
			              - binding should have a string \\"class_name\\" field.

			            - \\"durable_objects.bindings[1]\\": {\\"name\\":\\"MISSING_CLASS\\"}
			              - binding should have a string \\"class_name\\" field.

			            - \\"durable_objects.bindings[2]\\": {\\"name\\":1555,\\"class_name\\":1666}
			              - binding should have a string \\"name\\" field.
			              - binding should have a string \\"class_name\\" field.

			            - \\"durable_objects.bindings[3]\\": {\\"name\\":1777,\\"class_name\\":1888,\\"script_name\\":1999}
			              - binding should have a string \\"name\\" field.
			              - binding should have a string \\"class_name\\" field.
			              - the field \\"script_name\\", when present, should be a string.

			            - \\"durable_objects.bindings[4]\\": {\\"name\\":\\"SOMENAME\\",\\"class_name\\":\\"SomeClass\\",\\"environment\\":\\"staging\\"}
			              - binding should have a \\"script_name\\" field if \\"environment\\" is present.

			            - \\"durable_objects.bindings[5]\\": {\\"name\\":1778,\\"class_name\\":1889,\\"script_name\\":1992,\\"environment\\":2111}
			              - binding should have a string \\"name\\" field.
			              - binding should have a string \\"class_name\\" field.
			              - the field \\"script_name\\", when present, should be a string.
			              - the field \\"environment\\", when present, should be a string.

			            - \\"durable_objects.bindings[6]\\": {\\"name\\":1772,\\"class_name\\":1883,\\"environment\\":2112}
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
							new_sqlite_classes: ["CLASS_1", "CLASS_2"],
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
					expectedConfig,
					undefined,
					undefined,
					{ env: undefined }
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
					expectedConfig as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
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
					expectedConfig as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in migrations field: \\"unrecognized_field\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
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
					"
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected \\"assets.html_handling\\" field to be one of [\\"auto-trailing-slash\\",\\"force-trailing-slash\\",\\"drop-trailing-slash\\",\\"none\\"] but got \\"foo\\".
					  - Expected \\"assets.not_found_handling\\" field to be one of [\\"single-page-application\\",\\"404-page\\",\\"none\\"] but got \\"bar\\"."
				`);
			});

			it("should accept valid `assets` config values", () => {
				const expectedConfig: RawConfig = {
					assets: {
						directory: "./public",
						html_handling: "drop-trailing-slash",
						not_found_handling: "404-page",
					},
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

			it("should error on invalid additional fields", () => {
				const expectedConfig = {
					assets: {
						directory: "./public",
						invalid_field_1: "this is invalid",
						invalid_field_2: "this is invalid too",
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(expectedConfig));
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in assets field: \\"invalid_field_1\\",\\"invalid_field_2\\""
				`);
				expect(diagnostics.hasErrors()).toBeFalsy();
			});
		});

		describe("[browser]", () => {
			it("should error if browser is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ browser: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"browser\\" should be an object but got []."
		`);
			});

			it("should error if browser is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ browser: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"browser\\" should be an object but got \\"BAD\\"."
		`);
			});

			it("should error if browser is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ browser: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"browser\\" should be an object but got 999."
		`);
			});

			it("should error if browser is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ browser: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"browser\\" should be an object but got null."
		`);
			});
		});

		// Vectorize
		describe("[vectorize]", () => {
			it("should error if vectorize is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ vectorize: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"vectorize\\" should be an array but got {}."
		`);
			});

			it("should error if vectorize bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						vectorize: [
							{},
							{ binding: "VALID" },
							{ binding: 2000, index_name: 2111 },
							{
								binding: "BINDING_2",
								index_name: "ID_2",
							},
							{ binding: "VALID", index_name: "" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"vectorize[0]\\" bindings should have a string \\"binding\\" field but got {}.
			  - \\"vectorize[0]\\" bindings must have an \\"index_name\\" field but got {}.
			  - \\"vectorize[1]\\" bindings must have an \\"index_name\\" field but got {\\"binding\\":\\"VALID\\"}.
			  - \\"vectorize[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"index_name\\":2111}.
			  - \\"vectorize[2]\\" bindings must have an \\"index_name\\" field but got {\\"binding\\":2000,\\"index_name\\":2111}."
		`);
			});

			it("should error if vectorize is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ vectorize: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"vectorize\\" should be an array but got \\"BAD\\"."
		`);
			});

			it("should error if vectorize is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ vectorize: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"vectorize\\" should be an array but got 999."
		`);
			});

			it("should error if vectorize is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ vectorize: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"vectorize\\" should be an array but got null."
		`);
			});
		});

		// AI
		describe("[ai]", () => {
			it("should error if ai is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ ai: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"ai\\" should be an object but got []."
		`);
			});

			it("should error if ai is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ ai: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"ai\\" should be an object but got \\"BAD\\"."
		`);
			});

			it("should error if ai is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ ai: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"ai\\" should be an object but got 999."
		`);
			});

			it("should error if ai is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ ai: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"ai\\" should be an object but got null."
		`);
			});
		});

		// Images
		describe("[images]", () => {
			it("should error if images is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ images: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"images\\" should be an object but got []."
		`);
			});

			it("should error if images is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ images: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"images\\" should be an object but got \\"BAD\\"."
		`);
			});

			it("should error if images is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ images: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"images\\" should be an object but got 999."
		`);
			});

			it("should error if ai is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ images: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"images\\" should be an object but got null."
		`);
			});
		});

		// Worker Version Metadata
		describe("[version_metadata]", () => {
			it("should error if version_metadata is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ version_metadata: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"version_metadata\\" should be an object but got []."
		`);
			});

			it("should error if version_metadata is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ version_metadata: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"version_metadata\\" should be an object but got \\"BAD\\"."
		`);
			});

			it("should error if version_metadata is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ version_metadata: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"version_metadata\\" should be an object but got 999."
		`);
			});

			it("should error if version_metadata is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ version_metadata: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"version_metadata\\" should be an object but got null."
		`);
			});
		});

		describe("[cloudchamber]", () => {
			it("should error if cloudchamber is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ cloudchamber: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"cloudchamber\\" should be an object, but got null"
				`);
			});

			it("should error if cloudchamber is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ cloudchamber: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"cloudchamber\\" should be an object, but got []"
				`);
			});

			it("should error if cloudchamber is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ cloudchamber: "test" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"cloudchamber\\" should be an object, but got \\"test\\""
				`);
			});

			it("should error if cloudchamber is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ cloudchamber: 22 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"cloudchamber\\" should be an object, but got 22"
				`);
			});

			it("should error if cloudchamber bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						cloudchamber: {
							image: 123, // should be a string
							location: 123, // should be a string
							vcpu: "invalid", // should be a number
							memory: 123, // should be a string
							ipv4: "invalid", // should be a boolean
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"cloudchamber\\" bindings should, optionally, have a string \\"memory\\" field but got {\\"image\\":123,\\"location\\":123,\\"vcpu\\":\\"invalid\\",\\"memory\\":123,\\"ipv4\\":\\"invalid\\"}.
					  - \\"cloudchamber\\" bindings should, optionally, have a string \\"image\\" field but got {\\"image\\":123,\\"location\\":123,\\"vcpu\\":\\"invalid\\",\\"memory\\":123,\\"ipv4\\":\\"invalid\\"}.
					  - \\"cloudchamber\\" bindings should, optionally, have a string \\"location\\" field but got {\\"image\\":123,\\"location\\":123,\\"vcpu\\":\\"invalid\\",\\"memory\\":123,\\"ipv4\\":\\"invalid\\"}.
					  - \\"cloudchamber\\" bindings should, optionally, have a boolean \\"ipv4\\" field but got {\\"image\\":123,\\"location\\":123,\\"vcpu\\":\\"invalid\\",\\"memory\\":123,\\"ipv4\\":\\"invalid\\"}.
					  - \\"cloudchamber\\" bindings should, optionally, have a number \\"vcpu\\" field but got {\\"image\\":123,\\"location\\":123,\\"vcpu\\":\\"invalid\\",\\"memory\\":123,\\"ipv4\\":\\"invalid\\"}."
				`);
			});
		});

		describe("[containers]", () => {
			it("should error if containers is not an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ containers: "test" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers\\" field should be an array, but got \\"test\\""
				`);
			});

			it("should error if containers is an object that is not an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ containers: { something: "here" } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers\\" field should be an array, but got {\\"something\\":\\"here\\"}"
				`);
			});

			it("should error if containers is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ containers: "test" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers\\" field should be an array, but got \\"test\\""
				`);
			});

			it("should error if containers is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ containers: 22 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers\\" field should be an array, but got 22"
				`);
			});

			it("should error if no containers name and no worker name are provided", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						containers: [
							{
								image: "docker.io/something:hello",
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers.class_name\\" is a required field.
					  - Must have either a top level \\"name\\" and \\"containers.class_name\\" field defined, or have field \\"containers.name\\" defined."
				`);
			});

			it("should provide a name if no container name is provided and worker name exists", () => {
				const { diagnostics, config } = normalizeAndValidateConfig(
					{
						name: "test-worker-name",
						containers: [
							{
								image: "docker.io/something:hello",
								class_name: "test-class",
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config.containers).toEqual([
					{
						class_name: "test-class",
						name: "test-worker-name-test-class",
						image: "docker.io/something:hello",
						image_build_context: undefined,
					},
				]);
				if (config.containers) {
					expect(config.containers[0].name).toEqual(
						"test-worker-name-test-class"
					);
				}
			});

			it("should error for invalid container app fields", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								image: "something",
								class_name: "test-class",
								rollout_kind: "invalid",
								instance_type: "invalid",
								max_instances: "invalid",
								image_build_context: 123,
								image_vars: "invalid",
								scheduling_policy: "invalid",
								unknown_field: "value",
								rollout_active_grace_period: "60s",
								rollout_step_percentage: "invalid",
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in containers field: \\"unknown_field\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected \\"containers.image_build_context\\" to be of type string but got 123.
					  - The image \\"something\\" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
					    If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)
					  - \\"containers.rollout_step_percentage\\" must be a number or array of numbers, but got \\"invalid\\"
					  - Expected \\"containers.rollout_kind\\" field to be one of [\\"full_auto\\",\\"full_manual\\",\\"none\\"] but got \\"invalid\\".
					  - \\"containers.rollout_active_grace_period\\" field should be a positive number but got \\"60s\\"
					  - Expected \\"containers.max_instances\\" to be of type number but got \\"invalid\\".
					  - Expected \\"containers.image_vars\\" to be of type object but got \\"invalid\\".
					  - Expected \\"containers.scheduling_policy\\" field to be one of [\\"regional\\",\\"moon\\",\\"default\\"] but got \\"invalid\\".
					  - Expected \\"containers.instance_type\\" field to be one of [\\"dev\\",\\"basic\\",\\"standard\\"] but got \\"invalid\\"."
				`);
			});

			it("should error if rollout_active_grace_period and rollout_step_percentage are out of range", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								image: "blah",
								class_name: "test-class",
								rollout_active_grace_period: -1,
								rollout_step_percentage: 9,
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - The image \\"blah\\" does not appear to be a valid path to a Dockerfile, or a valid image registry path:
					    If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)
					  - \\"containers.rollout_step_percentage\\" must be one of [5, 10, 20, 25, 50, 100], but got 9
					  - \\"containers.rollout_active_grace_period\\" field should be a positive number but got \\"-1\\""
				`);
			});

			it("should warn for deprecated container fields", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								class_name: "test-class",
								instances: 10,
								configuration: {
									image: "config-image",
								},
								durable_objects: {
									namespace_id: "test-namespace",
								},
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers.configuration\\" is deprecated. Use top level \\"containers\\" fields instead. \\"configuration.image\\" should be \\"image\\", limits should be set via \\"instance_type\\".
					  - \\"containers.instances\\" is deprecated. Use \\"containers.max_instances\\" instead.
					  - \\"containers.durable_objects\\" is deprecated. Use the \\"class_name\\" field instead."
				`);
			});

			it("should error for invalid containers.configuration fields", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								class_name: "test-class",
								configuration: {
									image: "config-image",
									secrets: [],
									labels: [],
									disk: { size: "2GB" },
									memory: "256MB",
									vcpu: 0.5,
									memory_mib: 256,
									invalid_field: "should not be here",
									another_invalid: 123,
								},
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers.configuration\\" is deprecated. Use top level \\"containers\\" fields instead. \\"configuration.image\\" should be \\"image\\", limits should be set via \\"instance_type\\".
					  - Unexpected fields found in containers.configuration field: \\"memory\\",\\"invalid_field\\",\\"another_invalid\\""
				`);
			});

			it.each([{ value: 25 }, { value: [20, 50, 100] }])(
				"should accept rollout_step_percentage set to $value",
				(value) => {
					const { diagnostics } = normalizeAndValidateConfig(
						{
							name: "test-worker",
							containers: [
								{
									class_name: "test-class",
									image: "docker.io/test:latest",
									rollout_step_percentage: value.value,
								},
							],
						} as unknown as RawConfig,
						undefined,
						undefined,
						{ env: undefined }
					);

					expect(diagnostics.hasWarnings()).toBe(false);
					expect(diagnostics.hasErrors()).toBe(false);
				}
			);

			it("should error for invalid rollout_step_percentage number values", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								class_name: "test-class",
								image: "docker.io/test:latest",
								rollout_step_percentage: 15,
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers.rollout_step_percentage\\" must be one of [5, 10, 20, 25, 50, 100], but got 15"
				`);
			});

			it("should error for rollout_step_percentage array with invalid items", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								class_name: "test-class",
								image: "docker.io/test:latest",
								rollout_step_percentage: [20, 30, 1, 101],
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers.rollout_step_percentage\\" array elements must be in ascending order, but got \\"20,30,1,101\\"
					  - The final step in \\"containers.rollout_step_percentage\\" must be 100, but got \\"101\\"
					  - \\"containers.rollout_step_percentage\\" array elements must be between 10 and 100, but got \\"1, 101\\""
				`);
			});

			it("should error when rollout_step_percentage has more steps than max_instances", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						name: "test-worker",
						containers: [
							{
								name: "test-container",
								class_name: "TestClass",
								image: "registry.cloudflare.com/test:latest",
								max_instances: 2,
								rollout_step_percentage: [10, 50, 75, 100],
							},
						],
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO",
									class_name: "TestClass",
								},
							],
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"containers.rollout_step_percentage\\" cannot have more steps (4) than \\"max_instances\\" (2)"
				`);
			});
		});

		describe("[kv_namespaces]", () => {
			it("should error if kv_namespaces is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ kv_namespaces: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"kv_namespaces\\" should be an array but got {}."
		              `);
			});

			it("should error if kv_namespaces is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ kv_namespaces: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"kv_namespaces\\" should be an array but got \\"BAD\\"."
		              `);
			});

			it("should error if kv_namespaces is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ kv_namespaces: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"kv_namespaces\\" should be an array but got 999."
		              `);
			});

			it("should error if kv_namespaces is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ kv_namespaces: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"kv_namespaces\\" should be an array but got null."
		              `);
			});

			it("should error if kv_namespaces.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						kv_namespaces: [
							{},
							{ binding: "VALID" },
							{ binding: 2000, id: 2111 },
							{
								binding: "KV_BINDING_2",
								id: "KV_ID_2",
								preview_id: 2222,
							},
							{ binding: "VALID", id: "" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - \\"kv_namespaces[0]\\" bindings should have a string \\"binding\\" field but got {}.
			            - \\"kv_namespaces[0]\\" bindings should have a string \\"id\\" field but got {}.
			            - \\"kv_namespaces[1]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":\\"VALID\\"}.
			            - \\"kv_namespaces[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
			            - \\"kv_namespaces[2]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
			            - \\"kv_namespaces[3]\\" bindings should, optionally, have a string \\"preview_id\\" field but got {\\"binding\\":\\"KV_BINDING_2\\",\\"id\\":\\"KV_ID_2\\",\\"preview_id\\":2222}.
			            - \\"kv_namespaces[4]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":\\"VALID\\",\\"id\\":\\"\\"}."
		        `);
			});

			it("should allow the id field to be omitted when the RESOURCES_PROVISION experimental flag is enabled", () => {
				const { diagnostics } = run(
					{
						RESOURCES_PROVISION: true,
						MULTIWORKER: false,
						REMOTE_BINDINGS: false,
						DEPLOY_REMOTE_DIFF_CHECK: false,
					},
					() =>
						normalizeAndValidateConfig(
							{
								kv_namespaces: [{ binding: "VALID" }],
							} as unknown as RawConfig,
							undefined,
							undefined,
							{ env: undefined }
						)
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});
		});

		it("should error if send_email.bindings are not valid", () => {
			const { diagnostics } = normalizeAndValidateConfig(
				{
					send_email: [
						{},
						{ binding: "VALID" },
						{ name: "SEB", destination_address: 123 },
						{
							name: "SEB2",
							allowed_destination_addresses: 123,
						},
						{
							name: "SEB3",
							destination_address: "email@example.com",
							allowed_destination_addresses: ["email@example.com"],
						},
					],
				} as unknown as RawConfig,
				undefined,
				undefined,
				{ env: undefined }
			);

			expect(diagnostics.hasWarnings()).toBe(false);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - \\"send_email[0]\\" bindings should have a string \\"name\\" field but got {}.
			            - \\"send_email[1]\\" bindings should have a string \\"name\\" field but got {\\"binding\\":\\"VALID\\"}.
			            - \\"send_email[2]\\" bindings should, optionally, have a string \\"destination_address\\" field but got {\\"name\\":\\"SEB\\",\\"destination_address\\":123}.
			            - \\"send_email[3]\\" bindings should, optionally, have a []string \\"allowed_destination_addresses\\" field but got {\\"name\\":\\"SEB2\\",\\"allowed_destination_addresses\\":123}.
			            - \\"send_email[4]\\" bindings should have either a \\"destination_address\\" or \\"allowed_destination_addresses\\" field, but not both."
		        `);
		});

		describe("[d1_databases]", () => {
			it("should error if d1_databases is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ d1_databases: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"d1_databases\\" should be an array but got {}."
		              `);
			});

			it("should error if d1_databases is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ d1_databases: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"d1_databases\\" should be an array but got \\"BAD\\"."
		              `);
			});

			it("should error if d1_databases is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ d1_databases: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"d1_databases\\" should be an array but got 999."
		              `);
			});

			it("should error if d1_databases is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ d1_databases: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"d1_databases\\" should be an array but got null."
		              `);
			});

			it("should error if d1_databases.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						d1_databases: [
							{},
							{ binding: "VALID" },
							{ binding: 2000, id: 2111 },
							{
								binding: "D1_BINDING_2",
								id: "my-db",
								preview_id: 2222,
							},
							{ binding: "VALID", id: "" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in d1_databases[2] field: \\"id\\"
					  - Unexpected fields found in d1_databases[3] field: \\"id\\",\\"preview_id\\"
					  - Unexpected fields found in d1_databases[4] field: \\"id\\""
				`);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"d1_databases[0]\\" bindings should have a string \\"binding\\" field but got {}.
			  - \\"d1_databases[0]\\" bindings must have a \\"database_id\\" field but got {}.
			  - \\"d1_databases[1]\\" bindings must have a \\"database_id\\" field but got {\\"binding\\":\\"VALID\\"}.
			  - \\"d1_databases[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
			  - \\"d1_databases[2]\\" bindings must have a \\"database_id\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
			  - \\"d1_databases[3]\\" bindings must have a \\"database_id\\" field but got {\\"binding\\":\\"D1_BINDING_2\\",\\"id\\":\\"my-db\\",\\"preview_id\\":2222}.
			  - \\"d1_databases[4]\\" bindings must have a \\"database_id\\" field but got {\\"binding\\":\\"VALID\\",\\"id\\":\\"\\"}."
		`);
			});

			it("should allow the database_id field to be omitted when the RESOURCES_PROVISION experimental flag is enabled", () => {
				const { diagnostics } = run(
					{
						RESOURCES_PROVISION: true,
						MULTIWORKER: false,
						REMOTE_BINDINGS: false,
						DEPLOY_REMOTE_DIFF_CHECK: false,
					},
					() =>
						normalizeAndValidateConfig(
							{
								d1_databases: [{ binding: "VALID" }],
							} as unknown as RawConfig,
							undefined,
							undefined,
							{ env: undefined }
						)
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});
		});

		describe("[hyperdrive]", () => {
			it("should error if hyperdrive is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ hyperdrive: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"hyperdrive\\" should be an array but got {}."
		`);
			});

			it("should error if hyperdrive is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ hyperdrive: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"hyperdrive\\" should be an array but got \\"BAD\\"."
		`);
			});

			it("should error if hyperdrive is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ hyperdrive: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"hyperdrive\\" should be an array but got 999."
		`);
			});

			it("should error if hyperdrive is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ hyperdrive: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"hyperdrive\\" should be an array but got null."
		`);
			});

			it("should accept valid bindings", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						hyperdrive: [
							{ binding: "VALID", id: "343cd4f1d58c42fbb5bd082592fd7143" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error if hyperdrive.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						hyperdrive: [
							{},
							{ binding: "VALID", id: "343cd4f1d58c42fbb5bd082592fd7143" },
							{ binding: 2000, project: 2111 },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in hyperdrive[2] field: \\"project\\""
				`);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"hyperdrive[0]\\" bindings should have a string \\"binding\\" field but got {}.
			  - \\"hyperdrive[0]\\" bindings must have a \\"id\\" field but got {}.
			  - \\"hyperdrive[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"project\\":2111}.
			  - \\"hyperdrive[2]\\" bindings must have a \\"id\\" field but got {\\"binding\\":2000,\\"project\\":2111}."
		`);
			});
		});

		describe("[queues]", () => {
			it("should error if queues is not an object", () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					{ queues: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(
					expect.not.objectContaining({ queues: expect.anything })
				);
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"queues\\" should be an object but got []."
		              `);
			});

			it("should error if queues producer bindings are not valid", () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					{
						queues: {
							invalidField: "madeupValue",
							producers: [
								{},
								{ binding: "QUEUE_BINDING_1" },
								{ binding: 2333, queue: 2444 },
								{ binding: "QUEUE_BINDING_3", queue: "" },
							],
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(
					expect.not.objectContaining({
						queues: { producers: expect.anything },
					})
				);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in queues field: \\"invalidField\\""
				`);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"queues.producers[0]\\" bindings should have a string \\"binding\\" field but got {}.
					  - \\"queues.producers[0]\\" bindings should have a string \\"queue\\" field but got {}.
					  - \\"queues.producers[1]\\" bindings should have a string \\"queue\\" field but got {\\"binding\\":\\"QUEUE_BINDING_1\\"}.
					  - \\"queues.producers[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"queue\\":2444}.
					  - \\"queues.producers[2]\\" bindings should have a string \\"queue\\" field but got {\\"binding\\":2333,\\"queue\\":2444}.
					  - \\"queues.producers[3]\\" bindings should have a string \\"queue\\" field but got {\\"binding\\":\\"QUEUE_BINDING_3\\",\\"queue\\":\\"\\"}."
				`);
			});

			it("should error if queues consumers are not valid", () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					{
						queues: {
							invalidField: "madeupValue",
							consumers: [
								{},
								{ queue: 22 },
								{ queue: "myQueue", invalidField: "madeupValue" },
								{
									queue: "myQueue",
									max_batch_size: "3",
									max_batch_timeout: null,
									max_retries: "hello",
									dead_letter_queue: 5,
									max_concurrency: "hello",
								},
							],
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(
					expect.not.objectContaining({
						queues: { producers: expect.anything },
					})
				);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in queues field: \\"invalidField\\"
					  - Unexpected fields found in queues.consumers[2] field: \\"invalidField\\""
				`);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"queues.consumers[0]\\" should have a string \\"queue\\" field but got {}.
			  - \\"queues.consumers[1]\\" should have a string \\"queue\\" field but got {\\"queue\\":22}.
			  - \\"queues.consumers[3]\\" should, optionally, have a number \\"max_batch_size\\" field but got {\\"queue\\":\\"myQueue\\",\\"max_batch_size\\":\\"3\\",\\"max_batch_timeout\\":null,\\"max_retries\\":\\"hello\\",\\"dead_letter_queue\\":5,\\"max_concurrency\\":\\"hello\\"}.
			  - \\"queues.consumers[3]\\" should, optionally, have a number \\"max_batch_timeout\\" field but got {\\"queue\\":\\"myQueue\\",\\"max_batch_size\\":\\"3\\",\\"max_batch_timeout\\":null,\\"max_retries\\":\\"hello\\",\\"dead_letter_queue\\":5,\\"max_concurrency\\":\\"hello\\"}.
			  - \\"queues.consumers[3]\\" should, optionally, have a number \\"max_retries\\" field but got {\\"queue\\":\\"myQueue\\",\\"max_batch_size\\":\\"3\\",\\"max_batch_timeout\\":null,\\"max_retries\\":\\"hello\\",\\"dead_letter_queue\\":5,\\"max_concurrency\\":\\"hello\\"}.
			  - \\"queues.consumers[3]\\" should, optionally, have a string \\"dead_letter_queue\\" field but got {\\"queue\\":\\"myQueue\\",\\"max_batch_size\\":\\"3\\",\\"max_batch_timeout\\":null,\\"max_retries\\":\\"hello\\",\\"dead_letter_queue\\":5,\\"max_concurrency\\":\\"hello\\"}.
			  - \\"queues.consumers[3]\\" should, optionally, have a number \\"max_concurrency\\" field but got {\\"queue\\":\\"myQueue\\",\\"max_batch_size\\":\\"3\\",\\"max_batch_timeout\\":null,\\"max_retries\\":\\"hello\\",\\"dead_letter_queue\\":5,\\"max_concurrency\\":\\"hello\\"}."
		`);
			});
		});

		describe("[r2_buckets]", () => {
			it("should error if r2_buckets is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ r2_buckets: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"r2_buckets\\" should be an array but got {}."
		              `);
			});

			it("should error if r2_buckets is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ r2_buckets: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"r2_buckets\\" should be an array but got \\"BAD\\"."
		              `);
			});

			it("should error if r2_buckets is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ r2_buckets: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"r2_buckets\\" should be an array but got 999."
		              `);
			});

			it("should error if r2_buckets is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ r2_buckets: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"r2_buckets\\" should be an array but got null."
		              `);
			});

			it("should error if r2_buckets.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						r2_buckets: [
							{},
							{ binding: "R2_BINDING_1" },
							{ binding: 2333, bucket_name: 2444 },
							{
								binding: "R2_BINDING_2",
								bucket_name: "r2-bucket-2",
								preview_bucket_name: 2555,
							},
							{ binding: "R2_BINDING_3", bucket_name: "INVALID-NAME" },
							{
								binding: "R2_BINDING_4",
								bucket_name: "bucket",
								preview_bucket_name: "INVALID-NAME",
							},
							{ binding: "R2_BINDING_5", bucket_name: "" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"r2_buckets[0]\\" bindings should have a string \\"binding\\" field but got {}.
					  - \\"r2_buckets[0]\\" bindings should have a string \\"bucket_name\\" field but got {}.
					  - \\"r2_buckets[1]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_1\\"}.
					  - \\"r2_buckets[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
					  - \\"r2_buckets[2]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
					  - \\"r2_buckets[3]\\" bindings should, optionally, have a string \\"preview_bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_2\\",\\"bucket_name\\":\\"r2-bucket-2\\",\\"preview_bucket_name\\":2555}.
					  - r2_buckets[4].bucket_name=\\"INVALID-NAME\\" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.
					  - r2_buckets[5].preview_bucket_name= \\"INVALID-NAME\\" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.
					  - \\"r2_buckets[6]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_5\\",\\"bucket_name\\":\\"\\"}."
				`);
			});

			it("should allow the bucket_name field to be omitted when the RESOURCES_PROVISION experimental flag is enabled", () => {
				const { diagnostics } = run(
					{
						RESOURCES_PROVISION: true,
						MULTIWORKER: false,
						REMOTE_BINDINGS: false,
						DEPLOY_REMOTE_DIFF_CHECK: false,
					},
					() =>
						normalizeAndValidateConfig(
							{
								d1_databases: [{ binding: "VALID" }],
							} as unknown as RawConfig,
							undefined,
							undefined,
							{ env: undefined }
						)
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});
		});

		describe("[services]", () => {
			it("should error if services is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ services: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			"
		`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - The field \\"services\\" should be an array but got {}."
		        `);
			});

			it("should error if services is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ services: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			"
		`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - The field \\"services\\" should be an array but got \\"BAD\\"."
		        `);
			});

			it("should error if services is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ services: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			"
		`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - The field \\"services\\" should be an array but got 999."
		        `);
			});

			it("should error if services is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ services: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			"
		`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - The field \\"services\\" should be an array but got null."
		        `);
			});

			it("should error if services bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						services: [
							{},
							{ binding: "SERVICE_BINDING_1" },
							{ binding: 123, service: 456 },
							{ binding: 123, service: 456, environment: 789 },
							{ binding: "SERVICE_BINDING_1", service: 456, environment: 789 },
							{
								binding: 123,
								service: "SERVICE_BINDING_SERVICE_1",
								environment: 789,
							},
							{
								binding: 123,
								service: 456,
								environment: "SERVICE_BINDING_ENVIRONMENT_1",
							},
							{
								binding: "SERVICE_BINDING_1",
								service: "SERVICE_BINDING_SERVICE_1",
								environment: "SERVICE_BINDING_ENVIRONMENT_1",
								entrypoint: 123,
							},
							{
								binding: "SERVICE_BINDING_1",
								service: "SERVICE_BINDING_SERVICE_1",
								entrypoint: 123,
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			"
		`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"services[0]\\" bindings should have a string \\"binding\\" field but got {}.
			  - \\"services[0]\\" bindings should have a string \\"service\\" field but got {}.
			  - \\"services[1]\\" bindings should have a string \\"service\\" field but got {\\"binding\\":\\"SERVICE_BINDING_1\\"}.
			  - \\"services[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":123,\\"service\\":456}.
			  - \\"services[2]\\" bindings should have a string \\"service\\" field but got {\\"binding\\":123,\\"service\\":456}.
			  - \\"services[3]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":123,\\"service\\":456,\\"environment\\":789}.
			  - \\"services[3]\\" bindings should have a string \\"service\\" field but got {\\"binding\\":123,\\"service\\":456,\\"environment\\":789}.
			  - \\"services[3]\\" bindings should have a string \\"environment\\" field but got {\\"binding\\":123,\\"service\\":456,\\"environment\\":789}.
			  - \\"services[4]\\" bindings should have a string \\"service\\" field but got {\\"binding\\":\\"SERVICE_BINDING_1\\",\\"service\\":456,\\"environment\\":789}.
			  - \\"services[4]\\" bindings should have a string \\"environment\\" field but got {\\"binding\\":\\"SERVICE_BINDING_1\\",\\"service\\":456,\\"environment\\":789}.
			  - \\"services[5]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":123,\\"service\\":\\"SERVICE_BINDING_SERVICE_1\\",\\"environment\\":789}.
			  - \\"services[5]\\" bindings should have a string \\"environment\\" field but got {\\"binding\\":123,\\"service\\":\\"SERVICE_BINDING_SERVICE_1\\",\\"environment\\":789}.
			  - \\"services[6]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":123,\\"service\\":456,\\"environment\\":\\"SERVICE_BINDING_ENVIRONMENT_1\\"}.
			  - \\"services[6]\\" bindings should have a string \\"service\\" field but got {\\"binding\\":123,\\"service\\":456,\\"environment\\":\\"SERVICE_BINDING_ENVIRONMENT_1\\"}.
			  - \\"services[7]\\" bindings should have a string \\"entrypoint\\" field but got {\\"binding\\":\\"SERVICE_BINDING_1\\",\\"service\\":\\"SERVICE_BINDING_SERVICE_1\\",\\"environment\\":\\"SERVICE_BINDING_ENVIRONMENT_1\\",\\"entrypoint\\":123}.
			  - \\"services[8]\\" bindings should have a string \\"entrypoint\\" field but got {\\"binding\\":\\"SERVICE_BINDING_1\\",\\"service\\":\\"SERVICE_BINDING_SERVICE_1\\",\\"entrypoint\\":123}."
		`);
			});
		});

		describe("[analytics_engine_datasets]", () => {
			it("should error if analytics_engine_datasets is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ analytics_engine_datasets: {} } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"analytics_engine_datasets\\" should be an array but got {}."
		              `);
			});

			it("should error if analytics_engine_datasets is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ analytics_engine_datasets: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"analytics_engine_datasets\\" should be an array but got \\"BAD\\"."
		              `);
			});

			it("should error if analytics_engine_datasets is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ analytics_engine_datasets: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"analytics_engine_datasets\\" should be an array but got 999."
		              `);
			});

			it("should error if analytics_engine_datasets is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ analytics_engine_datasets: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"analytics_engine_datasets\\" should be an array but got null."
		              `);
			});

			it("should error if analytics_engine_datasets.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						analytics_engine_datasets: [
							{},
							{ binding: 2333, dataset: 2444 },
							{
								binding: "AE_BINDING_2",
								dataset: 2555,
							},
							{ binding: "AE_BINDING_1", dataset: "" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - \\"analytics_engine_datasets[0]\\" bindings should have a string \\"binding\\" field but got {}.
			            - \\"analytics_engine_datasets[1]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"dataset\\":2444}.
			            - \\"analytics_engine_datasets[1]\\" bindings should, optionally, have a string \\"dataset\\" field but got {\\"binding\\":2333,\\"dataset\\":2444}.
			            - \\"analytics_engine_datasets[2]\\" bindings should, optionally, have a string \\"dataset\\" field but got {\\"binding\\":\\"AE_BINDING_2\\",\\"dataset\\":2555}.
			            - \\"analytics_engine_datasets[3]\\" bindings should, optionally, have a string \\"dataset\\" field but got {\\"binding\\":\\"AE_BINDING_1\\",\\"dataset\\":\\"\\"}."
		        `);
			});
		});

		describe("[dispatch_namespaces]", () => {
			it("should error if dispatch_namespaces is not an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						dispatch_namespaces: "just a string",
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"dispatch_namespaces\\" should be an array but got \\"just a string\\"."
		`);
			});

			it("should error on non valid dispatch_namespaces", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						dispatch_namespaces: [
							"a string",
							123,
							{
								binding: 123,
								namespace: 456,
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_1",
								namespace: 456,
							},
							// this one is valid
							{
								binding: "DISPATCH_NAMESPACE_BINDING_1",
								namespace: "DISPATCH_NAMESPACE_BINDING_NAMESPACE_1",
							},
							{
								binding: 123,
								namespace: "DISPATCH_NAMESPACE_BINDING_SERVICE_1",
							},
							{
								binding: 123,
								service: 456,
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"dispatch_namespaces[0]\\" binding should be objects, but got \\"a string\\"
			  - \\"dispatch_namespaces[1]\\" binding should be objects, but got 123
			  - \\"dispatch_namespaces[2]\\" should have a string \\"binding\\" field but got {\\"binding\\":123,\\"namespace\\":456}.
			  - \\"dispatch_namespaces[2]\\" should have a string \\"namespace\\" field but got {\\"binding\\":123,\\"namespace\\":456}.
			  - \\"dispatch_namespaces[3]\\" should have a string \\"namespace\\" field but got {\\"binding\\":\\"DISPATCH_NAMESPACE_BINDING_1\\",\\"namespace\\":456}.
			  - \\"dispatch_namespaces[5]\\" should have a string \\"binding\\" field but got {\\"binding\\":123,\\"namespace\\":\\"DISPATCH_NAMESPACE_BINDING_SERVICE_1\\"}.
			  - \\"dispatch_namespaces[6]\\" should have a string \\"binding\\" field but got {\\"binding\\":123,\\"service\\":456}.
			  - \\"dispatch_namespaces[6]\\" should have a string \\"namespace\\" field but got {\\"binding\\":123,\\"service\\":456}."
		`);
			});

			test("should error on invalid outbounds for a namespace", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						dispatch_namespaces: [
							{
								binding: "DISPATCH_NAMESPACE_BINDING_1",
								namespace: "NAMESPACE",
								outbound: "a string",
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_2",
								namespace: "NAMESPACE",
								outbound: [{ not: "valid" }],
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_3",
								namespace: "NAMESPACE",
								outbound: {
									service: 123,
								},
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_4",
								namespace: "NAMESPACE",
								outbound: {
									service: "outbound",
									environment: { bad: "env" },
								},
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_5",
								namespace: "NAMESPACE",
								outbound: {
									environment: "production",
								},
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_6",
								namespace: "NAMESPACE",
								outbound: {
									service: "outbound",
									parameters: "bad",
								},
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_7",
								namespace: "NAMESPACE",
								outbound: {
									service: "outbound",
									parameters: false,
								},
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_8",
								namespace: "NAMESPACE",
								outbound: {
									service: "outbound",
									parameters: [true, { not: "good" }],
								},
							},
							// these are correct
							{
								binding: "DISPATCH_NAMESPACE_BINDING_9",
								namespace: "NAMESPACE",
								outbound: {
									service: "outbound",
									parameters: ["finally", "real", "params"],
								},
							},
							{
								binding: "DISPATCH_NAMESPACE_BINDING_10",
								namespace: "NAMESPACE",
								outbound: {
									service: "outbound",
									environment: "production",
									parameters: ["some", "more", "params"],
								},
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"dispatch_namespaces[0].outbound\\" should be an object, but got \\"a string\\"
			  - \\"dispatch_namespaces[0]\\" has an invalid outbound definition.
			  - \\"dispatch_namespaces[1].outbound.service\\" is a required field.
			  - \\"dispatch_namespaces[1]\\" has an invalid outbound definition.
			  - Expected \\"dispatch_namespaces[2].outbound.service\\" to be of type string but got 123.
			  - \\"dispatch_namespaces[2]\\" has an invalid outbound definition.
			  - Expected \\"dispatch_namespaces[3].outbound.environment\\" to be of type string but got {\\"bad\\":\\"env\\"}.
			  - \\"dispatch_namespaces[3]\\" has an invalid outbound definition.
			  - \\"dispatch_namespaces[4].outbound.service\\" is a required field.
			  - \\"dispatch_namespaces[4]\\" has an invalid outbound definition.
			  - Expected \\"dispatch_namespaces[5].outbound.parameters\\" to be an array of strings but got \\"bad\\"
			  - \\"dispatch_namespaces[5]\\" has an invalid outbound definition.
			  - Expected \\"dispatch_namespaces[6].outbound.parameters\\" to be an array of strings but got false
			  - \\"dispatch_namespaces[6]\\" has an invalid outbound definition.
			  - Expected \\"dispatch_namespaces[7].outbound.parameters.[0]\\" to be of type string but got true.
			  - Expected \\"dispatch_namespaces[7].outbound.parameters.[1]\\" to be of type string but got {\\"not\\":\\"good\\"}.
			  - \\"dispatch_namespaces[7]\\" has an invalid outbound definition."
		`);
			});
		});

		describe("[mtls_certificates]", () => {
			it("should error if mtls_certificates is not an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						mtls_certificates: "just a string",
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"mtls_certificates\\" should be an array but got \\"just a string\\"."
		`);
			});

			it("should error on non valid mtls_certificates", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						mtls_certificates: [
							"a string",
							123,
							false,
							{
								binding: 123,
								namespace: 123,
							},
							{
								binding: "CERT_ONE",
								id: "1234",
							},
							{
								binding: "CERT_TWO",
								certificate_id: 1234,
							},
							// this one is valid
							{
								binding: "CERT_THREE",
								certificate_id: "1234",
							},
							{
								binding: true,
								service: "1234",
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in mtls_certificates[3] field: \\"namespace\\"
					  - Unexpected fields found in mtls_certificates[4] field: \\"id\\"
					  - Unexpected fields found in mtls_certificates[7] field: \\"service\\""
				`);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"mtls_certificates\\" bindings should be objects, but got \\"a string\\"
			  - \\"mtls_certificates\\" bindings should be objects, but got 123
			  - \\"mtls_certificates\\" bindings should be objects, but got false
			  - \\"mtls_certificates[3]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":123,\\"namespace\\":123}.
			  - \\"mtls_certificates[3]\\" bindings should have a string \\"certificate_id\\" field but got {\\"binding\\":123,\\"namespace\\":123}.
			  - \\"mtls_certificates[4]\\" bindings should have a string \\"certificate_id\\" field but got {\\"binding\\":\\"CERT_ONE\\",\\"id\\":\\"1234\\"}.
			  - \\"mtls_certificates[5]\\" bindings should have a string \\"certificate_id\\" field but got {\\"binding\\":\\"CERT_TWO\\",\\"certificate_id\\":1234}.
			  - \\"mtls_certificates[7]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":true,\\"service\\":\\"1234\\"}.
			  - \\"mtls_certificates[7]\\" bindings should have a string \\"certificate_id\\" field but got {\\"binding\\":true,\\"service\\":\\"1234\\"}."
		`);
			});
		});

		describe("[pipelines]", () => {
			it("should error if pipelines is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ pipelines: {} },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"pipelines\\" should be an array but got {}."
		`);
			});

			it("should error if pipelines is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ pipelines: "BAD" },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"pipelines\\" should be an array but got \\"BAD\\"."
		`);
			});

			it("should error if pipelines is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ pipelines: 999 },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"pipelines\\" should be an array but got 999."
		`);
			});

			it("should error if pipelines is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ pipelines: null },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"pipelines\\" should be an array but got null."
		`);
			});

			it("should accept valid bindings", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						pipelines: [
							{
								binding: "VALID",
								pipeline: "343cd4f1d58c42fbb5bd082592fd7143",
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error if pipelines.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						pipelines: [
							{},
							{
								binding: "VALID",
								pipeline: "343cd4f1d58c42fbb5bd082592fd7143",
							},
							{ binding: 2000, project: 2111 },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in pipelines[2] field: \\"project\\""
				`);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"pipelines[0]\\" bindings must have a string \\"binding\\" field but got {}.
					  - \\"pipelines[0]\\" bindings must have a string \\"pipeline\\" field but got {}.
					  - \\"pipelines[2]\\" bindings must have a string \\"binding\\" field but got {\\"binding\\":2000,\\"project\\":2111}.
					  - \\"pipelines[2]\\" bindings must have a string \\"pipeline\\" field but got {\\"binding\\":2000,\\"project\\":2111}."
				`);
			});
		});

		describe("[secrets_store_secrets]", () => {
			it("should error if secrets_store_secrets is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ secrets_store_secrets: {} },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"secrets_store_secrets\\" should be an array but got {}."
		`);
			});

			it("should error if secrets_store_secrets is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ secrets_store_secrets: null },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"secrets_store_secrets\\" should be an array but got null."
		`);
			});

			it("should accept valid bindings", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						secrets_store_secrets: [
							{
								binding: "VALID",
								store_id: "store_id",
								secret_name: "secret_name",
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error if secrets_store_secrets.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						secrets_store_secrets: [
							{},
							{
								binding: "VALID",
								store_id: "store_id",
								secret_name: "secret_name",
							},
							{
								binding: null,
								invalid: true,
								store_id: 123,
								secret_name: null,
							},
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in secrets_store_secrets[2] field: \\"invalid\\""
				`);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"secrets_store_secrets[0]\\" bindings must have a string \\"binding\\" field but got {}.
					  - \\"secrets_store_secrets[0]\\" bindings must have a string \\"store_id\\" field but got {}.
					  - \\"secrets_store_secrets[0]\\" bindings must have a string \\"secret_name\\" field but got {}.
					  - \\"secrets_store_secrets[2]\\" bindings must have a string \\"binding\\" field but got {\\"binding\\":null,\\"invalid\\":true,\\"store_id\\":123,\\"secret_name\\":null}.
					  - \\"secrets_store_secrets[2]\\" bindings must have a string \\"store_id\\" field but got {\\"binding\\":null,\\"invalid\\":true,\\"store_id\\":123,\\"secret_name\\":null}.
					  - \\"secrets_store_secrets[2]\\" bindings must have a string \\"secret_name\\" field but got {\\"binding\\":null,\\"invalid\\":true,\\"store_id\\":123,\\"secret_name\\":null}."
				`);
			});
		});

		describe("[unsafe_hello_world]", () => {
			it("should error if unsafe_hello_world is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ unsafe_hello_world: {} },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"unsafe_hello_world\\" should be an array but got {}."
		`);
			});

			it("should error if unsafe_hello_world is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					// @ts-expect-error purposely using an invalid value
					{ unsafe_hello_world: null },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"unsafe_hello_world\\" should be an array but got null."
		`);
			});

			it("should accept valid bindings", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						unsafe_hello_world: [
							{
								binding: "VALID",
								enable_timer: true,
							},
						],
					},
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error if hello_world.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						unsafe_hello_world: [
							// @ts-expect-error Test if empty object is caught
							{},
							{
								binding: "VALID",
								// @ts-expect-error Test if enable_timer is not a boolean
								enable_timer: "yes",
							},
							{
								// @ts-expect-error Test if binding is not a string
								binding: null,
								invalid: true,
								enable_timer: false,
							},
						],
					},
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in unsafe_hello_world[2] field: \\"invalid\\""
				`);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"unsafe_hello_world[0]\\" bindings must have a string \\"binding\\" field but got {}.
					  - \\"unsafe_hello_world[1]\\" bindings must have a boolean \\"enable_timer\\" field but got {\\"binding\\":\\"VALID\\",\\"enable_timer\\":\\"yes\\"}.
					  - \\"unsafe_hello_world[2]\\" bindings must have a string \\"binding\\" field but got {\\"binding\\":null,\\"invalid\\":true,\\"enable_timer\\":false}."
				`);
			});
		});

		describe("[unsafe.bindings]", () => {
			it("should error if unsafe is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: [] } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe\\" should be an object but got []."
		              `);
			});

			it("should error if unsafe is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: "BAD" } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe\\" should be an object but got \\"BAD\\"."
		              `);
			});

			it("should error if unsafe is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: 999 } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe\\" should be an object but got 999."
		              `);
			});

			it("should error if unsafe is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: null } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe\\" should be an object but got null."
		              `);
			});

			it("should not error if unsafe is an empty object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: {} } satisfies RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);
			});

			it("should error if unsafe contains unexpected properties", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						unsafe: {
							invalid: true,
						},
					} as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"unsafe\\" fields are experimental and may change or break at any time.
					  - Unexpected fields found in unsafe field: \\"invalid\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);
			});

			it("should error if unsafe.bindings is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { bindings: {} } } as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.bindings\\" should be an array but got {}."
		              `);
			});

			it("should error if unsafe.bindings is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { bindings: "BAD" } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.bindings\\" should be an array but got \\"BAD\\"."
		              `);
			});

			it("should error if unsafe.bindings is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { bindings: 999 } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.bindings\\" should be an array but got 999."
		              `);
			});

			it("should error if unsafe.bindings is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { bindings: null } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.bindings\\" should be an array but got null."
		              `);
			});

			it("should error if durable_objects.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						unsafe: {
							bindings: [
								{},
								{ name: "UNSAFE_BINDING_1" },
								{ name: 2666, type: 2777 },
								{
									name: "UNSAFE_BINDING_2",
									type: "UNSAFE_TYPE_2",
									extra: 2888,
								},
							],
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"unsafe.bindings[0]\\": {}
			              - binding should have a string \\"name\\" field.
			              - binding should have a string \\"type\\" field.

			            - \\"unsafe.bindings[1]\\": {\\"name\\":\\"UNSAFE_BINDING_1\\"}
			              - binding should have a string \\"type\\" field.

			            - \\"unsafe.bindings[2]\\": {\\"name\\":2666,\\"type\\":2777}
			              - binding should have a string \\"name\\" field.
			              - binding should have a string \\"type\\" field."
		        `);
			});

			it("should error if unsafe.metadata is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { metadata: [] } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - The field \\"unsafe.metadata\\" should be an object but got []."
		`);
			});

			it("should error if unsafe.metadata is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { metadata: "BAD" } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.metadata\\" should be an object but got \\"BAD\\"."
		              `);
			});

			it("should error if unsafe.metadata is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { metadata: 999 } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.metadata\\" should be an object but got 999."
		              `);
			});

			it("should error if unsafe.metadata is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { metadata: null } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - \\"unsafe\\" fields are experimental and may change or break at any time."
		              `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			                  "Processing wrangler configuration:
			                    - The field \\"unsafe.metadata\\" should be an object but got null."
		              `);
			});

			it("should not provide an unsafe warning when the environment variable is specified", () => {
				vi.stubEnv("WRANGLER_DISABLE_EXPERIMENTAL_WARNING", "1");

				const { diagnostics } = normalizeAndValidateConfig(
					{ unsafe: { bindings: [] } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});
		});

		describe("[placement]", () => {
			it(`should error if placement hint is set with placement mode "off"`, () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ placement: { mode: "off", hint: "wnam" } },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"placement.hint\\" cannot be set if \\"placement.mode\\" is not \\"smart\\""
				`);
			});

			it(`should not error if placement hint is set with placement mode "smart"`, () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ placement: { mode: "smart", hint: "wnam" } },
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasErrors()).toBe(false);
			});
		});

		describe("route & routes fields", () => {
			it("should error if both route and routes are specified", () => {
				const rawConfig: RawConfig = {
					route: "route1",
					routes: ["route2", "route3"],
				};

				const { diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Expected exactly one of the following fields [\\"routes\\",\\"route\\"]."
		        `);
			});
		});
	});

	describe("named environments", () => {
		it("should warn if we specify an environment but there are no named environments", () => {
			const rawConfig: RawConfig = {
				name: "my-worker",
				kv_namespaces: [{ binding: "KV", id: "xxxx-xxxx-xxxx-xxxx" }],
			};
			const { diagnostics, config } = normalizeAndValidateConfig(
				rawConfig,
				undefined,
				undefined,
				{
					env: "dev",
				}
			);
			expect(config).toEqual(
				expect.objectContaining({
					name: "my-worker-dev",
					kv_namespaces: [{ binding: "KV", id: "xxxx-xxxx-xxxx-xxxx" }],
				})
			);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			        "Processing wrangler configuration:
			        "
		      `);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:
				  - No environment found in configuration with name \\"dev\\".
				    Before using \`--env=dev\` there should be an equivalent environment section in the configuration.

				    Consider adding an environment configuration section to the Wrangler configuration file:
				    \`\`\`
				    [env.dev]
				    \`\`\`
				"
			`);
		});

		it("should error if we specify an environment that does not match the named environments", () => {
			const rawConfig: RawConfig = { env: { ENV1: {} } };
			const { diagnostics } = normalizeAndValidateConfig(
				rawConfig,
				undefined,
				undefined,
				{
					env: "DEV",
				}
			);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:
				  - No environment found in configuration with name \\"DEV\\".
				    Before using \`--env=DEV\` there should be an equivalent environment section in the configuration.
				    The available configured environment names are: [\\"ENV1\\"]

				    Consider adding an environment configuration section to the Wrangler configuration file:
				    \`\`\`
				    [env.DEV]
				    \`\`\`
				"
			`);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			        "Processing wrangler configuration:
			        "
		      `);
		});

		it("should use top-level values for inheritable config fields", () => {
			const main = "src/index.ts";
			const resolvedMain = path.resolve(process.cwd(), main);
			const rawConfig: RawConfig = {
				name: "mock-name",
				account_id: "ACCOUNT_ID",
				compatibility_date: "2022-01-01",
				compatibility_flags: ["FLAG1", "FLAG2"],
				workers_dev: false,
				routes: ["ROUTE_1", "ROUTE_2"],
				jsx_factory: "JSX_FACTORY",
				jsx_fragment: "JSX_FRAGMENT",
				tsconfig: "path/to/tsconfig.json",
				triggers: { crons: ["CRON_1", "CRON_2"] },
				main,
				build: {
					command: "COMMAND",
					cwd: "CWD",
					watch_dir: "WATCH_DIR",
				},
				no_bundle: true,
				minify: true,
				first_party_worker: true,
				logpush: true,
				upload_source_maps: true,
				observability: {
					enabled: true,
					head_sampling_rate: 0.5,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				{ ...rawConfig, env: { dev: {} } },
				undefined,
				undefined,
				{ env: "dev" }
			);

			expect(config).toEqual(
				expect.objectContaining({
					...rawConfig,
					main: resolvedMain,
					name: "mock-name-dev",
					topLevelName: "mock-name",
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		it("should override top-level values for inheritable config fields", () => {
			const main = "src/index.ts";
			const resolvedMain = path.resolve(process.cwd(), main);
			const rawEnv: RawEnvironment = {
				name: "mock-env-name",
				account_id: "ENV_ACCOUNT_ID",
				compatibility_date: "2022-02-02",
				compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
				workers_dev: true,
				routes: ["ENV_ROUTE_1", "ENV_ROUTE_2"],
				jsx_factory: "ENV_JSX_FACTORY",
				jsx_fragment: "ENV_JSX_FRAGMENT",
				tsconfig: "ENV_path/to/tsconfig.json",
				triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				main,
				build: {
					command: "ENV_COMMAND",
					cwd: "ENV_CWD",
					watch_dir: "ENV_WATCH_DIR",
				},
				no_bundle: false,
				minify: false,
				first_party_worker: false,
				logpush: false,
				upload_source_maps: false,
				observability: {
					enabled: false,
				},
			};
			const rawConfig: RawConfig = {
				name: "mock-name",
				account_id: "ACCOUNT_ID",
				compatibility_date: "2022-01-01",
				compatibility_flags: ["FLAG1", "FLAG2"],
				workers_dev: false,
				routes: ["ROUTE_1", "ROUTE_2"],
				jsx_factory: "JSX_FACTORY",
				jsx_fragment: "JSX_FRAGMENT",
				tsconfig: "path/to/tsconfig.json",
				triggers: { crons: ["CRON_1", "CRON_2"] },
				main: "top-level.js",
				build: {
					command: "COMMAND",
					cwd: "CWD",
					watch_dir: "WATCH_DIR",
				},
				no_bundle: true,
				minify: true,
				first_party_worker: true,
				logpush: true,
				upload_source_maps: true,
				observability: {
					enabled: true,
				},
				env: {
					ENV1: rawEnv,
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				rawConfig,
				undefined,
				undefined,
				{ env: "ENV1" }
			);

			expect(config).toEqual(
				expect.objectContaining({
					...rawEnv,
					main: resolvedMain,
					topLevelName: "mock-name",
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.hasWarnings()).toBe(false);
		});

		describe("non-legacy", () => {
			it("should use top-level `name` field", () => {
				const rawConfig: RawConfig = {
					name: "mock-name",
					legacy_env: false,
					env: { DEV: {} },
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "DEV" }
				);

				expect(config.name).toEqual("mock-name");
				expect(config.topLevelName).toEqual("mock-name");
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in the future. DO NOT USE IN PRODUCTION."
		        `);
			});

			it("should error if named environment contains a `name` field, even if there is no top-level name", () => {
				const rawConfig: RawConfig = {
					legacy_env: false,
					env: {
						DEV: {
							name: "mock-env-name",
						},
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "DEV" }
				);

				expect(config.name).toBeUndefined();
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in the future. DO NOT USE IN PRODUCTION."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.DEV\\" environment configuration
			              - The \\"name\\" field is not allowed in named service environments.
			                Please remove the field from this environment."
		        `);
			});

			it("should error if top-level config and a named environment both contain a `name` field", () => {
				const rawConfig: RawConfig = {
					name: "mock-name",
					legacy_env: false,
					env: {
						DEV: {
							name: "mock-env-name",
						},
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "DEV" }
				);

				expect(config.name).toEqual("mock-name");
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in the future. DO NOT USE IN PRODUCTION."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.DEV\\" environment configuration
			              - The \\"name\\" field is not allowed in named service environments.
			                Please remove the field from this environment."
		        `);
			});

			it("should error if named environment contains a `account_id` field, even if there is no top-level name", () => {
				const rawConfig: RawConfig = {
					legacy_env: false,
					env: {
						DEV: {
							account_id: "some_account_id",
						},
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "DEV" }
				);

				expect(diagnostics.hasWarnings()).toBe(true);
				expect(config.account_id).toBeUndefined();
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in the future. DO NOT USE IN PRODUCTION."
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.DEV\\" environment configuration
					    - The \\"account_id\\" field is not allowed in named service environments.
					      Please remove the field from this environment."
				`);
			});

			it("should error if top-level config and a named environment both contain a `account_id` field", () => {
				const rawConfig: RawConfig = {
					account_id: "ACCOUNT_ID",
					legacy_env: false,
					env: {
						DEV: {
							account_id: "ENV_ACCOUNT_ID",
						},
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "DEV" }
				);

				expect(config.account_id).toEqual("ACCOUNT_ID");
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Experimental: Service environments are in beta, and their behaviour is guaranteed to change in the future. DO NOT USE IN PRODUCTION."
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.DEV\\" environment configuration
					    - The \\"account_id\\" field is not allowed in named service environments.
					      Please remove the field from this environment."
				`);
			});
		});

		it("should warn for non-inherited fields that are missing in environments", () => {
			const define: RawConfig["define"] = {
				abc: "123",
			};
			const vars: RawConfig["vars"] = {
				FOO: "foo",
			};
			const durable_objects: RawConfig["durable_objects"] = {
				bindings: [],
			};
			const kv_namespaces: RawConfig["kv_namespaces"] = [];
			const r2_buckets: RawConfig["r2_buckets"] = [];
			const analytics_engine_datasets: RawConfig["analytics_engine_datasets"] =
				[];
			const unsafe: RawConfig["unsafe"] = {
				bindings: undefined,
				metadata: undefined,
			};
			const rawConfig: RawConfig = {
				define,
				vars,
				durable_objects,
				kv_namespaces,
				r2_buckets,
				analytics_engine_datasets,
				unsafe,
				env: {
					ENV1: {},
				},
			};

			const { config, diagnostics } = normalizeAndValidateConfig(
				rawConfig,
				undefined,
				undefined,
				{ env: "ENV1" }
			);

			expect(config).toEqual(
				expect.not.objectContaining({
					define,
					vars,
					durable_objects,
					kv_namespaces,
					r2_buckets,
					analytics_engine_datasets,
					unsafe,
				})
			);
			expect(diagnostics.hasErrors()).toBe(false);
			expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:
				  - \\"unsafe\\" fields are experimental and may change or break at any time.
				  - \\"env.ENV1\\" environment configuration
				    - \\"vars\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"vars\\" is not inherited by environments.
				      Please add \\"vars\\" to \\"env.ENV1\\".
				    - \\"define\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"define\\" is not inherited by environments.
				      Please add \\"define\\" to \\"env.ENV1\\".
				    - \\"durable_objects\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"durable_objects\\" is not inherited by environments.
				      Please add \\"durable_objects\\" to \\"env.ENV1\\".
				    - \\"kv_namespaces\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"kv_namespaces\\" is not inherited by environments.
				      Please add \\"kv_namespaces\\" to \\"env.ENV1\\".
				    - \\"r2_buckets\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"r2_buckets\\" is not inherited by environments.
				      Please add \\"r2_buckets\\" to \\"env.ENV1\\".
				    - \\"analytics_engine_datasets\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"analytics_engine_datasets\\" is not inherited by environments.
				      Please add \\"analytics_engine_datasets\\" to \\"env.ENV1\\".
				    - \\"unsafe\\" exists at the top level, but not on \\"env.ENV1\\".
				      This is not what you probably want, since \\"unsafe\\" is not inherited by environments.
				      Please add \\"unsafe\\" to \\"env.ENV1\\"."
			`);
		});
		it("should error on node_compat", () => {
			const { diagnostics } = normalizeAndValidateConfig(
				// @ts-expect-error node_compat has been removed
				{ env: { ENV1: { node_compat: true } } },
				undefined,
				undefined,
				{ env: "ENV1" }
			);
			expect(diagnostics.hasErrors()).toBe(true);
			expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
				"Processing wrangler configuration:

				  - \\"env.ENV1\\" environment configuration
				    - [1mRemoved[0m: \\"node_compat\\":
				      The \\"node_compat\\" field is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information."
			`);
		});

		it("should error on invalid environment values", () => {
			const expectedConfig: RawEnvironment = {
				name: 111,
				account_id: 222,
				compatibility_date: 333,
				compatibility_flags: [444, 555],
				workers_dev: "BAD",
				routes: [666, 777],
				route: 888,
				jsx_factory: 999,
				jsx_fragment: 1000,
				tsconfig: 123,
				triggers: { crons: [1111, 1222] },
				main: 1333,
				build: {
					command: 1444,
					cwd: 1555,
					watch_dir: 1666,
				},
				no_bundle: "INVALID",
				minify: "INVALID",
				first_party_worker: "INVALID",
				logpush: "INVALID",
				upload_source_maps: "INVALID",
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
				    - Expected \\"tsconfig\\" to be of type string but got 123.
				    - Expected \\"name\\" to be of type string, alphanumeric and lowercase with dashes only but got 111.
				    - Expected \\"main\\" to be of type string but got 1333.
				    - Expected \\"no_bundle\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"minify\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"first_party_worker\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"logpush\\" to be of type boolean but got \\"INVALID\\".
				    - Expected \\"upload_source_maps\\" to be of type boolean but got \\"INVALID\\"."
			`);
		});

		describe("[define]", () => {
			it("should accept valid values for config.define", () => {
				const rawConfig: RawConfig = {
					define: {
						abc: "def",
						ghi: "123",
					},
				};
				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(rawConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error if config.define is not an object", () => {
				const rawConfig: RawConfig = {
					// @ts-expect-error purposely using an invalid value
					define: 123,
				};
				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(rawConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - The field \\"define\\" should be an object but got 123.
			          "
		        `);
			});

			it("should error if the values on config.define are not strings", () => {
				const rawConfig: RawConfig = {
					define: {
						// @ts-expect-error purposely using an invalid value
						abc: 123,
						// This one's valid
						def: "xyz",
						// @ts-expect-error purposely using an invalid value
						ghi: true,
						// @ts-expect-error purposely using an invalid value
						jkl: {
							nested: "value",
						},
					},
				};
				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(config).toEqual(expect.objectContaining(rawConfig));
				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - The field \\"define.abc\\" should be a string but got 123.
			            - The field \\"define.ghi\\" should be a string but got true.
			            - The field \\"define.jkl\\" should be a string but got {\\"nested\\":\\"value\\"}."
		        `);
			});

			describe("named environments", () => {
				it("should accept valid values for config.define inside an environment", () => {
					const rawConfig: RawConfig = {
						define: {
							abc: "def",
							ghi: "123",
						},
						env: {
							ENV1: {
								define: {
									abc: "xyz",
									ghi: "456",
								},
							},
						},
					};
					const { config, diagnostics } = normalizeAndValidateConfig(
						rawConfig,
						undefined,
						undefined,
						{ env: "ENV1" }
					);

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					expect(config).toEqual(expect.objectContaining(rawConfig.env!.ENV1));
					expect(diagnostics.hasWarnings()).toBe(false);
					expect(diagnostics.hasErrors()).toBe(false);
				});

				it("should error if config.define is not an object inside an environment", () => {
					const rawConfig: RawConfig = {
						define: {
							abc: "def",
							ghi: "123",
						},
						env: {
							ENV1: {
								// @ts-expect-error purposely using an invalid value
								define: 123,
							},
						},
					};
					const { config, diagnostics } = normalizeAndValidateConfig(
						rawConfig,
						undefined,
						undefined,
						{ env: "ENV1" }
					);

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					expect(config).toEqual(expect.objectContaining(rawConfig.env!.ENV1));
					expect(diagnostics.hasWarnings()).toBe(false);
					expect(diagnostics.hasErrors()).toBe(true);

					expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
				            "Processing wrangler configuration:

				              - \\"env.ENV1\\" environment configuration
				                - The field \\"env.ENV1.define\\" should be an object but got 123.
				            "
			          `);
				});

				it("should warn if if the shape of .define inside an environment doesn't match the shape of the top level .define", () => {
					const rawConfig: RawConfig = {
						define: {
							abc: "def",
							ghi: "123",
						},
						env: {
							ENV1: {
								define: {
									abc: "def",
									xyz: "123",
								},
							},
						},
					};
					const { config, diagnostics } = normalizeAndValidateConfig(
						rawConfig,
						undefined,
						undefined,
						{ env: "ENV1" }
					);

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					expect(config).toEqual(expect.objectContaining(rawConfig.env!.ENV1));
					expect(diagnostics.hasWarnings()).toBe(true);
					expect(diagnostics.hasErrors()).toBe(false);

					expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
				            "Processing wrangler configuration:

				              - \\"env.ENV1\\" environment configuration
				                - \\"define.ghi\\" exists at the top level, but not on \\"env.ENV1.define\\".
				                  This is not what you probably want, since \\"define\\" configuration is not inherited by environments.
				                  Please add \\"define.ghi\\" to \\"env.ENV1\\".
				                - \\"xyz\\" exists on \\"env.ENV1\\", but not on the top level.
				                  This is not what you probably want, since \\"define\\" configuration within environments can only override existing top level \\"define\\" configuration
				                  Please remove \\"env.ENV1.define.xyz\\", or add \\"define.xyz\\"."
			          `);
				});

				it("should error if the values on config.define in an environment are not strings", () => {
					const rawConfig: RawConfig = {
						define: {
							abc: "123",
							def: "xyz",
							ghi: "true",
							jkl: "some value",
						},
						env: {
							ENV1: {
								define: {
									// @ts-expect-error purposely using an invalid value
									abc: 123,
									// This one's valid
									def: "xyz",
									// @ts-expect-error purposely using an invalid value
									ghi: true,
									// @ts-expect-error purposely using an invalid value
									jkl: {
										nested: "value",
									},
								},
							},
						},
					};
					const { config, diagnostics } = normalizeAndValidateConfig(
						rawConfig,
						undefined,
						undefined,
						{ env: "ENV1" }
					);

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					expect(config).toEqual(expect.objectContaining(rawConfig.env!.ENV1));
					expect(diagnostics.hasWarnings()).toBe(false);
					expect(diagnostics.hasErrors()).toBe(true);

					expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
				            "Processing wrangler configuration:

				              - \\"env.ENV1\\" environment configuration
				                - The field \\"env.ENV1.define.abc\\" should be a string but got 123.
				                - The field \\"env.ENV1.define.ghi\\" should be a string but got true.
				                - The field \\"env.ENV1.define.jkl\\" should be a string but got {\\"nested\\":\\"value\\"}."
			          `);
				});
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
			                - the field \\"script_name\\", when present, should be a string."
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
					    - Expected \\"migrations[0].renamed_classes\\" to be an array of \\"{from: string, to: string}\\" objects but got [{\\"from\\":\\"FROM_CLASS\\",\\"to\\":\\"TO_CLASS\\"},{\\"a\\":\\"something\\",\\"b\\":\\"someone\\"}]."
				`);
			});
		});

		describe("[kv_namespaces]", () => {
			it("should error if kv_namespaces is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { kv_namespaces: {} } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got {}."
		        `);
			});

			it("should error if kv_namespaces is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { kv_namespaces: "BAD" } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got \\"BAD\\"."
		        `);
			});

			it("should error if kv_namespaces is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { kv_namespaces: 999 } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got 999."
		        `);
			});

			it("should error if kv_namespaces is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { kv_namespaces: null } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.kv_namespaces\\" should be an array but got null."
		        `);
			});

			it("should error if kv_namespaces.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: {
							ENV1: {
								kv_namespaces: [
									{},
									{ binding: "VALID" },
									{ binding: 2000, id: 2111 },
									{
										binding: "KV_BINDING_2",
										id: "KV_ID_2",
										preview_id: 2222,
									},
								],
							},
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"env.ENV1.kv_namespaces[0]\\" bindings should have a string \\"binding\\" field but got {}.
			              - \\"env.ENV1.kv_namespaces[0]\\" bindings should have a string \\"id\\" field but got {}.
			              - \\"env.ENV1.kv_namespaces[1]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":\\"VALID\\"}.
			              - \\"env.ENV1.kv_namespaces[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
			              - \\"env.ENV1.kv_namespaces[2]\\" bindings should have a string \\"id\\" field but got {\\"binding\\":2000,\\"id\\":2111}.
			              - \\"env.ENV1.kv_namespaces[3]\\" bindings should, optionally, have a string \\"preview_id\\" field but got {\\"binding\\":\\"KV_BINDING_2\\",\\"id\\":\\"KV_ID_2\\",\\"preview_id\\":2222}."
		        `);
			});
		});

		describe("[r2_buckets]", () => {
			it("should error if r2_buckets is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { r2_buckets: {} } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.r2_buckets\\" should be an array but got {}."
		        `);
			});

			it("should error if r2_buckets is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { r2_buckets: "BAD" } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.r2_buckets\\" should be an array but got \\"BAD\\"."
		        `);
			});

			it("should error if r2_buckets is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { r2_buckets: 999 } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.r2_buckets\\" should be an array but got 999."
		        `);
			});

			it("should error if r2_buckets is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { r2_buckets: null } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.r2_buckets\\" should be an array but got null."
		        `);
			});

			it("should error if r2_buckets.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: {
							ENV1: {
								r2_buckets: [
									{},
									{ binding: "R2_BINDING_1" },
									{ binding: 2333, bucket_name: 2444 },
									{
										binding: "R2_BINDING_2",
										bucket_name: "R2_BUCKET_2",
										preview_bucket_name: 2555,
									},
								],
							},
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.ENV1\\" environment configuration
					    - \\"env.ENV1.r2_buckets[0]\\" bindings should have a string \\"binding\\" field but got {}.
					    - \\"env.ENV1.r2_buckets[0]\\" bindings should have a string \\"bucket_name\\" field but got {}.
					    - \\"env.ENV1.r2_buckets[1]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_1\\"}.
					    - \\"env.ENV1.r2_buckets[2]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
					    - \\"env.ENV1.r2_buckets[2]\\" bindings should have a string \\"bucket_name\\" field but got {\\"binding\\":2333,\\"bucket_name\\":2444}.
					    - env.ENV1.r2_buckets[3].bucket_name=\\"R2_BUCKET_2\\" is invalid. Bucket names must begin and end with an alphanumeric character, only contain lowercase letters, numbers, and hyphens, and be between 3 and 63 characters long.
					    - \\"env.ENV1.r2_buckets[3]\\" bindings should, optionally, have a string \\"preview_bucket_name\\" field but got {\\"binding\\":\\"R2_BINDING_2\\",\\"bucket_name\\":\\"R2_BUCKET_2\\",\\"preview_bucket_name\\":2555}."
				`);
			});
		});

		describe("[analytics_engine_datasets]", () => {
			it("should error if analytics_engine_datasets is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { analytics_engine_datasets: {} } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.analytics_engine_datasets\\" should be an array but got {}."
		        `);
			});

			it("should error if analytics_engine_datasets is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { analytics_engine_datasets: "BAD" } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.analytics_engine_datasets\\" should be an array but got \\"BAD\\"."
		        `);
			});

			it("should error if analytics_engine_datasets is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { analytics_engine_datasets: 999 } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.analytics_engine_datasets\\" should be an array but got 999."
		        `);
			});

			it("should error if analytics_engine_datasets is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { analytics_engine_datasets: null } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.analytics_engine_datasets\\" should be an array but got null."
		        `);
			});

			it("should error if analytics_engine_datasets.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: {
							ENV1: {
								analytics_engine_datasets: [
									{},
									{ binding: 2333, dataset: 2444 },
									{
										binding: "AE_BINDING_2",
										dataset: 2555,
									},
									{ binding: "AE_BINDING_1", dataset: "" },
								],
							},
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"env.ENV1.analytics_engine_datasets[0]\\" bindings should have a string \\"binding\\" field but got {}.
			              - \\"env.ENV1.analytics_engine_datasets[1]\\" bindings should have a string \\"binding\\" field but got {\\"binding\\":2333,\\"dataset\\":2444}.
			              - \\"env.ENV1.analytics_engine_datasets[1]\\" bindings should, optionally, have a string \\"dataset\\" field but got {\\"binding\\":2333,\\"dataset\\":2444}.
			              - \\"env.ENV1.analytics_engine_datasets[2]\\" bindings should, optionally, have a string \\"dataset\\" field but got {\\"binding\\":\\"AE_BINDING_2\\",\\"dataset\\":2555}.
			              - \\"env.ENV1.analytics_engine_datasets[3]\\" bindings should, optionally, have a string \\"dataset\\" field but got {\\"binding\\":\\"AE_BINDING_1\\",\\"dataset\\":\\"\\"}."
		        `);
			});
		});

		describe("[unsafe.bindings]", () => {
			it("should error if unsafe is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { unsafe: [] } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe\\" should be an object but got []."
		        `);
			});

			it("should error if unsafe is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { unsafe: "BAD" } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe\\" should be an object but got \\"BAD\\"."
		        `);
			});

			it("should error if unsafe is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { unsafe: 999 } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe\\" should be an object but got 999."
		        `);
			});

			it("should error if unsafe is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { unsafe: null } } } as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe\\" should be an object but got null."
		        `);
			});

			it("should not error if unsafe is an empty object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{ env: { ENV1: { unsafe: {} } } } as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.ENV1\\" environment configuration
					    - \\"unsafe\\" fields are experimental and may change or break at any time."
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);
			});

			it("should not error if at least unsafe.bindings is undefined", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { bindings: [] } } },
					} as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should error if unsafe contains unexpected properties", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { invalid: true } } },
					} as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:

					  - \\"env.ENV1\\" environment configuration
					    - \\"unsafe\\" fields are experimental and may change or break at any time.
					    - Unexpected fields found in unsafe field: \\"invalid\\""
				`);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);
			});

			it("should error if unsafe.bindings is an object", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { bindings: {} } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got {}."
		        `);
			});

			it("should error if unsafe.bindings is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { bindings: "BAD" } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got \\"BAD\\"."
		        `);
			});

			it("should error if unsafe.bindings is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { bindings: 999 } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got 999."
		        `);
			});

			it("should error if unsafe.bindings is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { bindings: null } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe.bindings\\" should be an array but got null."
		        `);
			});

			it("should error if unsafe.bindings are not valid", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: {
							ENV1: {
								unsafe: {
									bindings: [
										{},
										{ name: "UNSAFE_BINDING_1" },
										{ name: 2666, type: 2777 },
										{
											name: "UNSAFE_BINDING_2",
											type: "UNSAFE_TYPE_2",
											extra: 2888,
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

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration

			              - \\"env.ENV1.unsafe.bindings[0]\\": {}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"type\\" field.

			              - \\"env.ENV1.unsafe.bindings[1]\\": {\\"name\\":\\"UNSAFE_BINDING_1\\"}
			                - binding should have a string \\"type\\" field.

			              - \\"env.ENV1.unsafe.bindings[2]\\": {\\"name\\":2666,\\"type\\":2777}
			                - binding should have a string \\"name\\" field.
			                - binding should have a string \\"type\\" field."
		        `);
			});

			it("should error if unsafe.metadata is an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { metadata: [] } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - The field \\"env.ENV1.unsafe.metadata\\" should be an object but got []."
		        `);
			});

			it("should error if unsafe.metadata is a string", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { metadata: "BAD" } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:

			  - \\"env.ENV1\\" environment configuration
			    - The field \\"env.ENV1.unsafe.metadata\\" should be an object but got \\"BAD\\"."
		`);
			});

			it("should error if unsafe.metadata is a number", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { metadata: 999 } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:

			  - \\"env.ENV1\\" environment configuration
			    - The field \\"env.ENV1.unsafe.metadata\\" should be an object but got 999."
		`);
			});

			it("should error if unsafe.metadata is null", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						env: { ENV1: { unsafe: { metadata: null } } },
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - \\"unsafe\\" fields are experimental and may change or break at any time."
		        `);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:

			  - \\"env.ENV1\\" environment configuration
			    - The field \\"env.ENV1.unsafe.metadata\\" should be an object but got null."
		`);
			});
		});

		describe("[tail_consumers]", () => {
			it("should error if tail_consumers is not an array", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						tail_consumers: "this sure isn't an array",
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - Expected \\"tail_consumers\\" to be an array but got \\"this sure isn't an array\\"."
		`);
			});

			it("should error on invalid tail_consumers", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						tail_consumers: [
							"some string",
							456,
							{
								binding: "other",
								namespace: "shape",
							},
							{ service: {} },
							{
								service: 123,
								environment: "prod",
							},
							// these are valid
							{ service: "tail_listener" },
							{ service: "listener_two", environment: "production" },
						],
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			"Processing wrangler configuration:
			  - \\"tail_consumers[0]\\" should be an object but got \\"some string\\".
			  - \\"tail_consumers[1]\\" should be an object but got 456.
			  - \\"tail_consumers[2].service\\" is a required field.
			  - Expected \\"tail_consumers[3].service\\" to be of type string but got {}.
			  - Expected \\"tail_consumers[4].service\\" to be of type string but got 123."
		`);
			});
		});

		describe("[observability]", () => {
			it("should error on invalid observability", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						observability: {
							notEnabled: "true",
							head_sampling_rate: true,
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in observability field: \\"notEnabled\\""
				`);

				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"observability.enabled\\" or \\"observability.logs.enabled\\" is required.
					  - Expected \\"observability.head_sampling_rate\\" to be of type number but got true."
				`);
			});

			it("should error on invalid observability.logs", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						observability: {
							enabled: true,
							logs: "enabled",
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);

				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Expected \\"observability.logs\\" to be of type object but got \\"enabled\\"."
				`);
			});

			it("should not error on nested [observability.logs] config only", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						observability: {
							logs: {
								enabled: true,
							},
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);

				expect(diagnostics.hasErrors()).toBe(false);
			});

			it("should not error on mixed observability config", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						observability: {
							enabled: true,
							logs: {
								invocation_logs: false,
							},
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					"
				`);

				expect(diagnostics.hasErrors()).toBe(false);
			});
			it("should error on a sampling rate out of range", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						observability: {
							enabled: true,
							head_sampling_rate: 2,
						},
					} satisfies RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - \\"observability.head_sampling_rate\\" must be a value between 0 and 1."
				`);
			});

			it("should error on invalid additional fields", () => {
				const { diagnostics } = normalizeAndValidateConfig(
					{
						observability: {
							enabled: true,
							invalid_key_1: "hello world",
							invalid_key_2: "hey there",
						},
					} as unknown as RawConfig,
					undefined,
					undefined,
					{ env: undefined }
				);

				expect(diagnostics.hasWarnings()).toBe(true);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.renderWarnings()).toMatchInlineSnapshot(`
					"Processing wrangler configuration:
					  - Unexpected fields found in observability field: \\"invalid_key_1\\",\\"invalid_key_2\\""
				`);
			});
		});

		describe("route & routes fields", () => {
			it("should error if both route and routes are specified in the same environment", () => {
				const environment: RawEnvironment = {
					name: "mock-env-name",
					account_id: "ENV_ACCOUNT_ID",
					compatibility_date: "2022-02-02",
					compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
					workers_dev: true,
					route: "ENV_ROUTE_1",
					routes: ["ENV_ROUTE_2", "ENV_ROUTE_3"],
					jsx_factory: "ENV_JSX_FACTORY",
					jsx_fragment: "ENV_JSX_FRAGMENT",
					triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				};
				const expectedConfig: RawConfig = {
					name: "mock-name",
					account_id: "ACCOUNT_ID",
					compatibility_date: "2022-01-01",
					compatibility_flags: ["FLAG1", "FLAG2"],
					workers_dev: false,
					routes: ["ROUTE_1", "ROUTE_2"],
					jsx_factory: "JSX_FACTORY",
					jsx_fragment: "JSX_FRAGMENT",
					triggers: { crons: ["CRON_1", "CRON_2"] },
					env: {
						ENV1: environment,
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(environment));
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.hasWarnings()).toBe(false);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:

			            - \\"env.ENV1\\" environment configuration
			              - Expected exactly one of the following fields [\\"routes\\",\\"route\\"]."
		        `);
			});

			it("should error if both route and routes are specified in the top-level environment", () => {
				const environment: RawEnvironment = {
					name: "mock-env-name",
					account_id: "ENV_ACCOUNT_ID",
					compatibility_date: "2022-02-02",
					compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
					workers_dev: true,
					routes: ["ENV_ROUTE_1", "ENV_ROUTE_2"],
					jsx_factory: "ENV_JSX_FACTORY",
					jsx_fragment: "ENV_JSX_FRAGMENT",
					triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				};
				const expectedConfig: RawConfig = {
					name: "mock-name",
					account_id: "ACCOUNT_ID",
					compatibility_date: "2022-01-01",
					compatibility_flags: ["FLAG1", "FLAG2"],
					workers_dev: false,
					route: "ROUTE_1",
					routes: ["ROUTE_2", "ROUTE_3"],
					jsx_factory: "JSX_FACTORY",
					jsx_fragment: "JSX_FRAGMENT",
					triggers: { crons: ["CRON_1", "CRON_2"] },
					env: {
						ENV1: environment,
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(environment));
				expect(diagnostics.hasErrors()).toBe(true);
				expect(diagnostics.hasWarnings()).toBe(false);

				expect(diagnostics.renderErrors()).toMatchInlineSnapshot(`
			          "Processing wrangler configuration:
			            - Expected exactly one of the following fields [\\"routes\\",\\"route\\"]."
		        `);
			});

			it("should not error if <env>.route and <top-level>.routes are specified", () => {
				const environment: RawEnvironment = {
					name: "mock-env-name",
					account_id: "ENV_ACCOUNT_ID",
					compatibility_date: "2022-02-02",
					compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
					workers_dev: true,
					route: "ENV_ROUTE_1",
					jsx_factory: "ENV_JSX_FACTORY",
					jsx_fragment: "ENV_JSX_FRAGMENT",
					triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				};
				const expectedConfig: RawConfig = {
					name: "mock-name",
					account_id: "ACCOUNT_ID",
					compatibility_date: "2022-01-01",
					compatibility_flags: ["FLAG1", "FLAG2"],
					workers_dev: false,
					routes: ["ROUTE_1", "ROUTE_2"],
					jsx_factory: "JSX_FACTORY",
					jsx_fragment: "JSX_FRAGMENT",
					triggers: { crons: ["CRON_1", "CRON_2"] },
					env: {
						ENV1: environment,
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(environment));
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should not error if <env>.routes and <top-level>.route are specified", () => {
				const environment: RawEnvironment = {
					name: "mock-env-name",
					account_id: "ENV_ACCOUNT_ID",
					compatibility_date: "2022-02-02",
					compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
					workers_dev: true,
					routes: ["ENV_ROUTE_1", "ENV_ROUTE_2"],
					jsx_factory: "ENV_JSX_FACTORY",
					jsx_fragment: "ENV_JSX_FRAGMENT",
					triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				};
				const expectedConfig: RawConfig = {
					name: "mock-name",
					account_id: "ACCOUNT_ID",
					compatibility_date: "2022-01-01",
					compatibility_flags: ["FLAG1", "FLAG2"],
					workers_dev: false,
					route: "ROUTE_1",
					jsx_factory: "JSX_FACTORY",
					jsx_fragment: "JSX_FRAGMENT",
					triggers: { crons: ["CRON_1", "CRON_2"] },
					env: {
						ENV1: environment,
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(expect.objectContaining(environment));
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should not error if <env1>.route and <env2>.routes are specified", () => {
				const environment1: RawEnvironment = {
					name: "mock-env-name",
					account_id: "ENV_ACCOUNT_ID",
					compatibility_date: "2022-02-02",
					compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
					workers_dev: true,
					routes: ["ENV1_ROUTE_1", "ENV2_ROUTE_2"],
					jsx_factory: "ENV_JSX_FACTORY",
					jsx_fragment: "ENV_JSX_FRAGMENT",
					triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				};
				const environment2: RawEnvironment = {
					name: "mock-env-name",
					account_id: "ENV_ACCOUNT_ID",
					compatibility_date: "2022-02-02",
					compatibility_flags: ["ENV_FLAG1", "ENV_FLAG2"],
					workers_dev: true,
					route: "ENV2_ROUTE_1",
					jsx_factory: "ENV_JSX_FACTORY",
					jsx_fragment: "ENV_JSX_FRAGMENT",
					triggers: { crons: ["ENV_CRON_1", "ENV_CRON_2"] },
				};
				const expectedConfig: RawConfig = {
					name: "mock-name",
					account_id: "ACCOUNT_ID",
					compatibility_date: "2022-01-01",
					compatibility_flags: ["FLAG1", "FLAG2"],
					workers_dev: false,
					route: "ROUTE_1",
					jsx_factory: "JSX_FACTORY",
					jsx_fragment: "JSX_FRAGMENT",
					triggers: { crons: ["CRON_1", "CRON_2"] },
					env: {
						ENV1: environment1,
						ENV2: environment2,
					},
				};

				const result1 = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{
						env: "ENV1",
					}
				);

				expect(result1.config).toEqual(expect.objectContaining(environment1));
				expect(result1.diagnostics.hasErrors()).toBe(false);
				expect(result1.diagnostics.hasWarnings()).toBe(false);

				const result2 = normalizeAndValidateConfig(
					expectedConfig,
					undefined,
					undefined,
					{
						env: "ENV2",
					}
				);

				expect(result2.config).toEqual(expect.objectContaining(environment2));
				expect(result2.diagnostics.hasErrors()).toBe(false);
				expect(result2.diagnostics.hasWarnings()).toBe(false);
			});
		});

		describe("[assets]", () => {
			it("should inherit from top-level assets", () => {
				const rawConfig: RawConfig = {
					assets: {
						directory: "dist",
						binding: "ASSETS",
					},
					env: {
						ENV1: {},
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(
					expect.objectContaining({
						assets: {
							directory: "dist",
							binding: "ASSETS",
						},
					})
				);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});

			it("should resolve assets in named env with top-level env also including assets", () => {
				const rawConfig: RawConfig = {
					assets: {
						directory: "dist",
						binding: "ASSETS",
					},
					env: {
						ENV1: {
							assets: {
								directory: "public",
								binding: "ASSETS",
								run_worker_first: true,
							},
						},
					},
				};

				const { config, diagnostics } = normalizeAndValidateConfig(
					rawConfig,
					undefined,
					undefined,
					{ env: "ENV1" }
				);

				expect(config).toEqual(
					expect.objectContaining({
						assets: {
							directory: "public",
							binding: "ASSETS",
							run_worker_first: true,
						},
					})
				);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(diagnostics.hasWarnings()).toBe(false);
			});
		});
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

describe("BOM (Byte Order Marker) handling", () => {
	runInTempDir();

	it("should remove UTF-8 BOM from TOML config files", () => {
		const configContent = `name = "test-worker"
compatibility_date = "2022-01-12"`;

		fs.writeFileSync(
			"wrangler.toml",
			Buffer.concat([
				Buffer.from([0xef, 0xbb, 0xbf]),
				Buffer.from(configContent, "utf-8"),
			])
		);

		const config = readConfig({ config: "wrangler.toml" });
		expect(config.name).toBe("test-worker");
		expect(config.compatibility_date).toBe("2022-01-12");
	});

	it("should remove UTF-8 BOM from JSON config files", () => {
		const configContent = `{
	"name": "test-worker",
	"compatibility_date": "2022-01-12"
}`;

		fs.writeFileSync(
			"wrangler.json",
			Buffer.concat([
				Buffer.from([0xef, 0xbb, 0xbf]),
				Buffer.from(configContent, "utf-8"),
			])
		);

		const config = readConfig({ config: "wrangler.json" });
		expect(config.name).toBe("test-worker");
		expect(config.compatibility_date).toBe("2022-01-12");
	});

	it("should error on UTF-16 BE BOM", () => {
		const bomBytes = Buffer.from([0xfe, 0xff]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-16 BE byte order marker"
		);
	});

	it("should error on UTF-16 LE BOM", () => {
		const bomBytes = Buffer.from([0xff, 0xfe]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-16 LE byte order marker"
		);
	});

	it("should error on UTF-32 BE BOM", () => {
		const bomBytes = Buffer.from([0x00, 0x00, 0xfe, 0xff]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-32 BE byte order marker"
		);
	});

	it("should error on UTF-32 LE BOM", () => {
		const bomBytes = Buffer.from([0xff, 0xfe, 0x00, 0x00]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-32 LE byte order marker"
		);
	});

	it("should handle files without BOM normally", () => {
		writeWranglerConfig({ name: "no-bom-test" });

		const config = readConfig({ config: "wrangler.toml" });
		expect(config.name).toBe("no-bom-test");
	});
});

function normalizePath(text: string): string {
	return text
		.replace("project\\wrangler.toml", "project/wrangler.toml")
		.replace("src\\index.ts", "src/index.ts")
		.replace("path\\to\\tsconfig", "path/to/tsconfig");
}
