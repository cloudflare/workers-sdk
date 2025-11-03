import type { RawConfig, RawEnvironment } from "@cloudflare/workers-utils";

/**
 * Returns a feature-complete raw configuration for a Pages project. By
 * feature-complete we mean that all Pages-supported configuration fields
 * will be present in the returned configuration object, including complete
 * configurations for the two Pages-supported named environments: "preview"
 * and "production"
 *
 * @param projectName The Pages project name
 * @param pagesBuildOutputDir The Pages build oputput directory
 */
export function generateRawConfigForPages(
	projectName: string,
	pagesBuildOutputDir: string
): RawConfig {
	return {
		/** TOP-LEVEL ONLY FIELDS **/
		pages_build_output_dir: pagesBuildOutputDir,
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
		name: projectName,
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
				bucket_name: "test-r2-bucket-name",
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

		/** NAMED ENVIRONMENTS **/
		env: {
			// Pages supports only two named environments: "preview" & "production"
			preview: generateRawEnvConfigForPages(projectName, "preview"),
			production: generateRawEnvConfigForPages(projectName, "production"),
		},
	};
}

/**
 * Returns a feature-complete raw environment configuration for Pages. By
 * feature-complete we mean that all Pages-supported environment configuration
 * fields will be present in the returned configuration object.
 *
 * @param envName The environment name
 * @param overrideInheritableFields If `true`, top-level inehritable fields
 * will be overridden in the configuration for this named environment
 */
export function generateRawEnvConfigForPages(
	projectName: string,
	envName: string,
	overrideInheritableFields = true
): RawEnvironment {
	let envConfig: RawEnvironment = {};

	if (overrideInheritableFields) {
		envConfig = {
			name: `${projectName}-${envName}`,
			compatibility_date: "2024-01-01",
			compatibility_flags: [`COMPATIBILITY_FLAG_${envName}`],
			limits: { cpu_ms: 11 },
			placement: { mode: "off" },
		};
	}

	return {
		/** INHERITABLE ENVIRONMENT FIELDS **/
		...envConfig,

		/** NON-INHERITABLE ENVIRONMENT FIELDS **/
		vars: { VAR: `TEST_VAR-${envName}` },
		durable_objects: {
			bindings: [
				{
					name: `TEST_DO_BINDING`,
					class_name: `TEST_DO_CLASS_${envName}`,
					script_name: `TEST_DO_SCRIPT_NAME_${envName}`,
				},
			],
		},
		kv_namespaces: [
			{
				binding: `TEST_KV_BINDING`,
				id: `TEST_KV_ID_${envName}`,
			},
		],
		queues: {
			producers: [
				{
					binding: `TEST_QUEUE_PRODUCER_BINDING`,
					queue: `TEST_QUEUE_PRODUCER_NAME_${envName}`,
				},
			],
		},
		r2_buckets: [
			{
				binding: `TEST_R2_BINDING`,
				bucket_name: `test-r2-bucket-name-${envName}`,
			},
		],
		d1_databases: [
			{
				binding: `TEST_D1_BINDING`,
				database_id: `TEST_D1_DB_ID_${envName}`,
				database_name: `TEST_D1_DB_NAME_${envName}`,
			},
		],
		vectorize: [
			{
				binding: `TEST_VECTORIZE_BINDING`,
				index_name: `TEST_VECTORIZE_INDEX_NAME_${envName}`,
			},
		],
		hyperdrive: [
			{
				binding: `TEST_HYPERDRIVE_BINDING`,
				id: `TEST_HYPERDRIVE_ID_${envName}`,
			},
		],
		services: [
			{
				binding: `TEST_SERVICE_BINDING`,
				service: `TEST_SERVICE_NAME_${envName}`,
			},
		],
		analytics_engine_datasets: [
			{
				binding: `TEST_AED_BINDING`,
			},
		],
		ai: {
			binding: `TEST_AI_BINDING`,
		},
	};
}
