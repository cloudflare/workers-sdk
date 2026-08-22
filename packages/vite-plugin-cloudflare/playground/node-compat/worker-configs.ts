import type { WorkerConfigInput } from "@cloudflare/vite-plugin/experimental-config";

export const workerAlsConfig = {
	name: "worker",
	entrypoint: "./worker-als/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_als"],
} satisfies WorkerConfigInput;

export const workerBasicConfig = {
	name: "worker",
	entrypoint: "./worker-basic/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	exports: {
		MyDurableObject: { type: "durable-object", storage: "sqlite" },
		MyWorkerEntrypoint: { type: "worker" },
	},
	env: {
		MY_DO: {
			type: "durable-object",
			workerName: "worker",
			exportName: "MyDurableObject",
		},
		MY_SERVICE: {
			type: "worker",
			workerName: "worker",
			exportName: "MyWorkerEntrypoint",
		},
	},
} satisfies WorkerConfigInput;

export const cloudflareNodeConfig = {
	name: "worker",
	entrypoint: "./cloudflare-node/index.ts",
	compatibilityDate: "2025-11-13",
	compatibilityFlags: ["nodejs_compat"],
} satisfies WorkerConfigInput;

export const workerCrossEnvConfig = {
	name: "worker",
	entrypoint: "./worker-cross-env/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
} satisfies WorkerConfigInput;

export const workerCryptoConfig = {
	name: "worker",
	entrypoint: "./worker-crypto/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
} satisfies WorkerConfigInput;

export const workerDebugConfig = {
	name: "worker",
	entrypoint: "./worker-debug/index.ts",
	compatibilityDate: "2025-07-30",
	compatibilityFlags: ["nodejs_compat"],
	env: { DEBUG: { type: "text", value: "example:*,test" } },
} satisfies WorkerConfigInput;

export const workerHttpsConfig = {
	name: "worker",
	entrypoint: "./worker-https/index.ts",
	compatibilityDate: "2025-08-15",
	compatibilityFlags: ["nodejs_compat"],
} satisfies WorkerConfigInput;

export const workerPostgresConfig = {
	name: "worker",
	entrypoint: "./worker-postgres/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
	env: {
		DB_HOSTNAME: { type: "text", value: "127.0.0.1" },
		DB_PORT: { type: "text", value: "5432" },
		DB_NAME: { type: "text", value: "testdb" },
		DB_USERNAME: { type: "text", value: "testuser" },
		DB_PASSWORD: { type: "text", value: "testpassword" },
	},
} satisfies WorkerConfigInput;

export const workerProcessConfig = {
	name: "worker",
	entrypoint: "./worker-process/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: [
		"nodejs_compat",
		"nodejs_compat_do_not_populate_process_env",
	],
	env: { FOO: { type: "text", value: "foo value" } },
} satisfies WorkerConfigInput;

export const workerProcessPopulatedEnvConfig = {
	name: "worker",
	entrypoint: "./worker-process-populated-env/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
	env: { FOO: { type: "text", value: "foo value" } },
} satisfies WorkerConfigInput;

export const workerRandomConfig = {
	name: "worker",
	entrypoint: "./worker-random/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
} satisfies WorkerConfigInput;

export const workerResolveExternalsConfig = {
	name: "worker",
	entrypoint: "./worker-resolve-externals/index.ts",
	compatibilityDate: "2024-12-30",
	compatibilityFlags: ["nodejs_compat"],
} satisfies WorkerConfigInput;
