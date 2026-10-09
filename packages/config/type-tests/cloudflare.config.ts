/** A `cloudflare.config.ts` authored against `cf/config`, the path users import. */
import {
	bindings,
	defineConfig,
	defineContainer,
	defineWorker,
	exports,
	triggers,
} from "cf/config";
import * as entrypoint from "./worker" with { type: "cf-worker" };
import type {
	InferDurableNamespaces,
	InferEnv,
	InferMainModule,
	UnwrapConfig,
} from "cf/config";

const worker = defineWorker((ctx) => ({
	name: "worker",
	compatibilityDate: "2026-09-29",
	entrypoint,
	env: {
		MODE: bindings.text(`${ctx.mode}`),
		COUNTER: bindings.durableObject({
			worker: "worker",
			exportName: "Counter",
		}),
	},
	exports: {
		Counter: exports.durableObject({ storage: "sqlite" }),
		Admin: exports.worker(),
	},
	triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
}));

const container = defineContainer({
	name: "container",
	image: { dockerfile: "./Dockerfile" },
});

const config = defineConfig({ worker, containers: [container] });
export default config;

// The type expressions `generateTypes()` writes to `.cloudflare/types/index.d.ts`.
type WorkerConfig = UnwrapConfig<UnwrapConfig<typeof config>["worker"]>;
export type Env = InferEnv<WorkerConfig>;
export type MainModule = InferMainModule<WorkerConfig>;
export type DurableNamespaces = InferDurableNamespaces<WorkerConfig>;
