import { defineWorker } from "@cloudflare/vite-plugin/experimental-config";
import * as cloudflareNodeEntrypoint from "./cloudflare-node/index.ts" with { type: "cf-worker" };
import * as workerAlsEntrypoint from "./worker-als/index.ts" with { type: "cf-worker" };
import * as workerBasicEntrypoint from "./worker-basic/index.ts" with { type: "cf-worker" };
import {
	cloudflareNodeConfig,
	workerAlsConfig,
	workerBasicConfig,
	workerCrossEnvConfig,
	workerCryptoConfig,
	workerDebugConfig,
	workerHttpsConfig,
	workerPostgresConfig,
	workerProcessConfig,
	workerProcessPopulatedEnvConfig,
	workerRandomConfig,
	workerResolveExternalsConfig,
} from "./worker-configs.ts";
import * as workerCrossEnvEntrypoint from "./worker-cross-env/index.ts" with { type: "cf-worker" };
import * as workerCryptoEntrypoint from "./worker-crypto/index.ts" with { type: "cf-worker" };
import * as workerDebugEntrypoint from "./worker-debug/index.ts" with { type: "cf-worker" };
import * as workerHttpsEntrypoint from "./worker-https/index.ts" with { type: "cf-worker" };
import * as workerPostgresEntrypoint from "./worker-postgres/index.ts" with { type: "cf-worker" };
import * as workerProcessPopulatedEnvEntrypoint from "./worker-process-populated-env/index.ts" with { type: "cf-worker" };
import * as workerProcessEntrypoint from "./worker-process/index.ts" with { type: "cf-worker" };
import * as workerRandomEntrypoint from "./worker-random/index.ts" with { type: "cf-worker" };
import * as workerResolveExternalsEntrypoint from "./worker-resolve-externals/index.ts" with { type: "cf-worker" };

export const workerAls = defineWorker({
	...workerAlsConfig,
	entrypoint: workerAlsEntrypoint,
});
export const workerBasic = defineWorker({
	...workerBasicConfig,
	entrypoint: workerBasicEntrypoint,
});
export const cloudflareNode = defineWorker({
	...cloudflareNodeConfig,
	entrypoint: cloudflareNodeEntrypoint,
});
export const workerCrossEnv = defineWorker({
	...workerCrossEnvConfig,
	entrypoint: workerCrossEnvEntrypoint,
});
export const workerCrypto = defineWorker({
	...workerCryptoConfig,
	entrypoint: workerCryptoEntrypoint,
});
export const workerDebug = defineWorker({
	...workerDebugConfig,
	entrypoint: workerDebugEntrypoint,
});
export const workerHttps = defineWorker({
	...workerHttpsConfig,
	entrypoint: workerHttpsEntrypoint,
});
export const workerPostgres = defineWorker({
	...workerPostgresConfig,
	entrypoint: workerPostgresEntrypoint,
});
export const workerProcess = defineWorker({
	...workerProcessConfig,
	entrypoint: workerProcessEntrypoint,
});
export const workerProcessPopulatedEnv = defineWorker({
	...workerProcessPopulatedEnvConfig,
	entrypoint: workerProcessPopulatedEnvEntrypoint,
});
export const workerRandom = defineWorker({
	...workerRandomConfig,
	entrypoint: workerRandomEntrypoint,
});
export const workerResolveExternals = defineWorker({
	...workerResolveExternalsConfig,
	entrypoint: workerResolveExternalsEntrypoint,
});

export default defineWorker({
	name: "worker",
	entrypoint: workerRandomEntrypoint,
	compatibilityDate: "2024-12-30",
});
