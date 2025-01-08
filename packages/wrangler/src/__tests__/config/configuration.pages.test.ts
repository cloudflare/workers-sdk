import path from "node:path";
import { normalizeAndValidateConfig } from "../../config/validation";
import {
	generateRawConfigForPages,
	generateRawEnvConfigForPages,
} from "../helpers/generate-wrangler-config";
import type { RawConfig, RawEnvironment } from "../../config";

describe("normalizeAndValidateConfig()", () => {
	describe("Pages configuration", () => {
		let pagesRawConfig: RawConfig = {};

		beforeEach(() => {
			pagesRawConfig = generateRawConfigForPages(
				"pages-is-awesome",
				"./public"
			);

			// supress Hyperdrive beta warnings
			vi.stubEnv("NO_HYPERDRIVE_WARNING", "true");

			// sanity checks
			expect(pagesRawConfig.env).not.toBeUndefined();
			expect(pagesRawConfig.env?.preview).not.toBeUndefined();
			expect(pagesRawConfig.env?.production).not.toBeUndefined();
		});

		describe("named environments", () => {
			it("should return config corresponding to the top-level environment, if no named environment is provided", () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: undefined,
					}
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG"],
						limits: { cpu_ms: 100 },
						placement: { mode: "smart" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS",
									script_name: "TEST_DO_SCRIPT_NAME",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID",
								database_name: "TEST_D1_DB_NAME",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});

			it('should return config corresponding to the "preview" named environment, if it exists in the configuration file', () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: "preview",
					}
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome-preview",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG_preview"],
						limits: { cpu_ms: 11 },
						placement: { mode: "off" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR-preview" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS_preview",
									script_name: "TEST_DO_SCRIPT_NAME_preview",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID_preview",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME_preview",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME_preview",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID_preview",
								database_name: "TEST_D1_DB_NAME_preview",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME_preview",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID_preview",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME_preview",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});

			it('should return config corresponding to the "production" named environment, if it exists in the configuration file', () => {
				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: "production",
					}
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome-production",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG_production"],
						limits: { cpu_ms: 11 },
						placement: { mode: "off" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR-production" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS_production",
									script_name: "TEST_DO_SCRIPT_NAME_production",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID_production",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME_production",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME_production",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID_production",
								database_name: "TEST_D1_DB_NAME_production",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME_production",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID_production",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME_production",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});

			it("should return config corresponding to any other Pages-unsupported named environment, if it exists in the configuration file", () => {
				/**
				 * While Pages config only supports "preview" & "production" named
				 * environments, the following is a valid test case, because all
				 * Pages-specific validation (incl. env naming) is performed after
				 * `normalizeAndValidateConfig` has run.
				 */
				// sanity check
				expect(pagesRawConfig.env?.["unsupported-env-name"]).toBeUndefined();

				// add config corresponding to unsupported named env
				const env = pagesRawConfig.env as { [envName: string]: RawEnvironment };
				env["unsupported-env-name"] = generateRawEnvConfigForPages(
					"pages-is-awesome",
					"unsupported-env-name"
				);
				expect(
					pagesRawConfig.env?.["unsupported-env-name"]
				).not.toBeUndefined();

				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: "unsupported-env-name",
					}
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome-unsupported-env-name",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG_unsupported-env-name"],
						limits: { cpu_ms: 11 },
						placement: { mode: "off" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR-unsupported-env-name" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS_unsupported-env-name",
									script_name: "TEST_DO_SCRIPT_NAME_unsupported-env-name",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID_unsupported-env-name",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME_unsupported-env-name",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME_unsupported-env-name",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID_unsupported-env-name",
								database_name: "TEST_D1_DB_NAME_unsupported-env-name",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME_unsupported-env-name",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID_unsupported-env-name",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME_unsupported-env-name",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});

			it('should return config corresponding to the top-level environment, if the "preview" named environment does not exist in the configuration file', () => {
				// delete the "preview" environment configuration. This leaves us
				// with just top-level and "production" env config
				delete pagesRawConfig.env?.preview;

				// sanity checks
				expect(pagesRawConfig.env?.preview).toBeUndefined();
				expect(pagesRawConfig.env?.production).not.toBeUndefined();

				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: "preview",
					}
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG"],
						limits: { cpu_ms: 100 },
						placement: { mode: "smart" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS",
									script_name: "TEST_DO_SCRIPT_NAME",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID",
								database_name: "TEST_D1_DB_NAME",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});

			it('should return config corresponding to the top-level environment, if the "production" named environment does not exist in the configuration file', () => {
				// delete the "production" environment configuration. This leaves us
				// with just the top-level config
				delete pagesRawConfig.env?.production;

				// sanity checks
				expect(pagesRawConfig.env?.preview).not.toBeUndefined();
				expect(pagesRawConfig.env?.production).toBeUndefined();

				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: "production",
					}
				);
				expect(diagnostics.hasWarnings()).toBe(false);

				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG"],
						limits: { cpu_ms: 100 },
						placement: { mode: "smart" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS",
									script_name: "TEST_DO_SCRIPT_NAME",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID",
								database_name: "TEST_D1_DB_NAME",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});

			it("should return config corresponding to the top-level environment, if any other Pages-unsupported named environment does not exist in the configuration file", () => {
				/**
				 * While Pages config only supports "preview" & "production" named
				 * environments, the following is a valid test case, because
				 * all Pages-specific validation (incl. env naming) is performed
				 * after `normalizeAndValidateConfig` has run.
				 */
				const { config, diagnostics } = normalizeAndValidateConfig(
					pagesRawConfig,
					undefined,
					{
						env: "unsupported-env-name",
					}
				);

				expect(diagnostics.hasWarnings()).toBe(false);
				expect(diagnostics.hasErrors()).toBe(false);
				expect(config).toEqual(
					expect.objectContaining({
						/** TOP-LEVEL ONLY FIELDS **/
						pages_build_output_dir: path.resolve(process.cwd(), "./public"),
						dev: {
							ip: "localhost",
							port: 1234,
							inspector_port: 5678,
							local_protocol: "https",
							upstream_protocol: "https",
							host: "127.0.0.0",
						},
						send_metrics: true,

						/** INHERITABLE ENVIRONMENT FIELDS **/
						name: "pages-is-awesome",
						compatibility_date: "2024-01-01",
						compatibility_flags: ["COMPATIBILITY_FLAG"],
						limits: { cpu_ms: 100 },
						placement: { mode: "smart" },

						/** NON-INHERITABLE ENVIRONMENT FIELDS **/
						vars: { VAR: "TEST_VAR" },
						durable_objects: {
							bindings: [
								{
									name: "TEST_DO_BINDING",
									class_name: "TEST_DO_CLASS",
									script_name: "TEST_DO_SCRIPT_NAME",
								},
							],
						},
						kv_namespaces: [
							{
								binding: "TEST_KV_BINDING",
								id: "TEST_KV_ID",
							},
						],
						queues: {
							producers: [
								{
									binding: "TEST_QUEUE_PRODUCER_BINDING",
									queue: "TEST_QUEUE_PRODUCER_NAME",
								},
							],
						},
						r2_buckets: [
							{
								binding: "TEST_R2_BINDING",
								bucket_name: "TEST_R2_BUCKET_NAME",
							},
						],
						d1_databases: [
							{
								binding: "TEST_D1_BINDING",
								database_id: "TEST_D1_DB_ID",
								database_name: "TEST_D1_DB_NAME",
							},
						],
						vectorize: [
							{
								binding: "TEST_VECTORIZE_BINDING",
								index_name: "TEST_VECTORIZE_INDEX_NAME",
							},
						],
						hyperdrive: [
							{
								binding: "TEST_HYPERDRIVE_BINDING",
								id: "TEST_HYPERDRIVE_ID",
							},
						],
						services: [
							{
								binding: "TEST_SERVICE_BINDING",
								service: "TEST_SERVICE_NAME",
							},
						],
						analytics_engine_datasets: [
							{
								binding: "TEST_AED_BINDING",
							},
						],
						ai: {
							binding: "TEST_AI_BINDING",
						},
					})
				);
			});
		});

		it("should error if there is a user binding named ASSETS at the top-level", () => {
			const { diagnostics } = normalizeAndValidateConfig(
				{
					...pagesRawConfig,
					kv_namespaces: [
						{
							binding: "ASSETS",
							id: "1234",
						},
					],
				},
				undefined,
				{ env: undefined }
			);

			expect(diagnostics.errors).toEqual([
				"The name 'ASSETS' is reserved in Pages projects. Please use a different name for your KV Namespaces binding.",
			]);
		});

		it("should error if there is a user binding named ASSETS in a named environment", () => {
			const { diagnostics } = normalizeAndValidateConfig(
				{
					...pagesRawConfig,
					env: {
						preview: {
							...pagesRawConfig.env?.preview,
							vars: { ASSETS: "test_value" },
						},
					},
				},
				undefined,
				{
					env: "preview",
				}
			);

			expect(diagnostics.errors).toEqual([
				"The name 'ASSETS' is reserved in Pages projects. Please use a different name for your Vars binding.",
			]);
		});
	});
});
